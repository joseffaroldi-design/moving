import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ORIGINS = [
  "https://ops-preview-7.emergent.host",
  "https://magnolia-movers-rc1.preview.emergentagent.com",
  "http://localhost:3000",
];

function allowedOrigins(): string[] {
  const env = Deno.env.get("PAYMENT_ALLOWED_ORIGINS") ?? "";
  return Array.from(new Set([
    ...DEFAULT_ORIGINS,
    ...env.split(",").map((s) => s.trim()).filter(Boolean),
  ]));
}

function originAllowed(origin: string | null): boolean {
  return !origin || allowedOrigins().includes(origin);
}

function cors(origin: string | null): Record<string, string> {
  const list = allowedOrigins();
  const allow = origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

type CheckoutContext = {
  checkout_id: string;
  kind: "deposit" | "invoice";
  target_id: string;
  amount: number;
  amount_cents: number;
  currency: string;
  description: string;
  customer_email: string | null;
};

type StripeSession = {
  id?: string;
  url?: string;
  expires_at?: number;
  error?: { message?: string };
};

function cleanBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("PAYMENT_RETURN_BASE_URL must use HTTPS");
  }
  return trimmed;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (!originAllowed(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(origin) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!originAllowed(origin)) return json({ error: "Forbidden origin" }, 403, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const returnBaseRaw = Deno.env.get("PAYMENT_RETURN_BASE_URL");
  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey || !returnBaseRaw) {
    return json({ error: "Online payments are not configured yet." }, 503, origin);
  }

  let returnBase: string;
  try {
    returnBase = cleanBaseUrl(returnBaseRaw);
  } catch {
    return json({ error: "Payment return URL is misconfigured." }, 503, origin);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, origin);

  let body: { kind?: unknown; target_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  if (!(["deposit", "invoice"] as string[]).includes(kind) || !/^[0-9a-f-]{36}$/i.test(targetId)) {
    return json({ error: "Valid payment kind and target_id are required" }, 400, origin);
  }

  const { data: prepared, error: prepareError } = await userClient.rpc(
    "portal_prepare_payment_checkout",
    { p_kind: kind, p_target_id: targetId },
  );
  if (prepareError || !prepared) {
    return json({ error: prepareError?.message ?? "Unable to prepare payment" }, 400, origin);
  }

  const context = prepared as CheckoutContext;
  if (!context.checkout_id || !Number.isInteger(Number(context.amount_cents)) || Number(context.amount_cents) <= 0) {
    return json({ error: "Invalid payment context" }, 500, origin);
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", context.checkout_id);
  form.set("success_url", `${returnBase}/portal/payments?payment=success`);
  form.set("cancel_url", `${returnBase}/portal/payments?payment=cancelled`);
  form.append("payment_method_types[]", "card");
  form.set("line_items[0][price_data][currency]", context.currency || "usd");
  form.set("line_items[0][price_data][product_data][name]", context.description.slice(0, 120));
  form.set("line_items[0][price_data][unit_amount]", String(context.amount_cents));
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[local_checkout_id]", context.checkout_id);
  form.set("metadata[payment_kind]", context.kind);
  form.set("metadata[target_id]", context.target_id);
  form.set("payment_intent_data[metadata][local_checkout_id]", context.checkout_id);
  if (context.customer_email) form.set("customer_email", context.customer_email);

  let stripeResponse: Response;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `moveops-checkout-${context.checkout_id}`,
      },
      body: form.toString(),
    });
  } catch {
    return json({ error: "Payment provider is temporarily unavailable." }, 502, origin);
  }

  const stripe = await stripeResponse.json().catch(() => ({})) as StripeSession;
  if (!stripeResponse.ok || !stripe.id || !stripe.url) {
    console.log(JSON.stringify({ event: "payment_checkout_create", result: "stripe_error", status: stripeResponse.status }));
    return json({ error: "Unable to start payment checkout." }, 502, origin);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const expiresAt = stripe.expires_at ? new Date(stripe.expires_at * 1000).toISOString() : null;
  const { error: attachError } = await admin.rpc("payment_attach_stripe_session", {
    p_checkout_id: context.checkout_id,
    p_external_session_id: stripe.id,
    p_expires_at: expiresAt,
  });
  if (attachError) {
    console.log(JSON.stringify({ event: "payment_checkout_create", result: "attach_error" }));
    return json({ error: "Unable to initialize payment checkout." }, 502, origin);
  }

  return json({ url: stripe.url }, 201, origin);
});
