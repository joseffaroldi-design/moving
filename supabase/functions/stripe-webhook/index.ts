import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const values = header.split(",").map((part) => part.trim());
  const timestampRaw = values.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = values.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((candidate) => timingSafeEqualHex(candidate, expected));
}

type StripeCheckoutSession = {
  id?: string;
  mode?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string | { id?: string } | null;
};

type StripeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: StripeCheckoutSession };
};

function paymentIntentId(value: StripeCheckoutSession["payment_intent"]): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    return json({ error: "Webhook configuration missing" }, 503);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }

  const signatureHeader = req.headers.get("stripe-signature") ?? "";
  if (!signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return json({ error: "Invalid Stripe signature" }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!event.id || !event.type) return json({ error: "Malformed Stripe event" }, 400);

  const supported = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]);
  if (!supported.has(event.type)) return json({ received: true }, 200);

  const session = event.data?.object;
  if (!session?.id || session.mode !== "payment" || session.payment_status !== "paid") {
    return json({ received: true }, 200);
  }

  const paymentIntent = paymentIntentId(session.payment_intent);
  if (!paymentIntent || !Number.isInteger(session.amount_total) || !session.currency) {
    return json({ error: "Incomplete paid checkout session" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const paidAt = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString();

  const { data: finalized, error: finalizeError } = await admin.rpc("payment_finalize_stripe_checkout", {
    p_external_session_id: session.id,
    p_external_payment_intent_id: paymentIntent,
    p_amount_cents: session.amount_total,
    p_currency: session.currency,
    p_paid_at: paidAt,
  });

  const safePayload = {
    checkout_session_id: session.id,
    payment_intent_id: paymentIntent,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
  };

  if (finalizeError) {
    await admin.from("webhook_events").upsert(
      {
        provider: "stripe",
        event_type: event.type,
        external_id: event.id,
        status: "failed",
        payload: safePayload,
        error_message: String(finalizeError.message ?? "Payment reconciliation failed").slice(0, 500),
        processed_at: null,
      },
      { onConflict: "provider,external_id" },
    );
    console.log(JSON.stringify({ event: "stripe_webhook", result: "reconcile_failed", type: event.type }));
    return json({ error: "Payment reconciliation failed" }, 500);
  }

  await admin.from("webhook_events").upsert(
    {
      provider: "stripe",
      event_type: event.type,
      external_id: event.id,
      status: "processed",
      payload: safePayload,
      error_message: null,
      processed_at: new Date().toISOString(),
    },
    { onConflict: "provider,external_id" },
  );

  console.log(JSON.stringify({ event: "stripe_webhook", result: "processed", type: event.type, idempotent: Boolean((finalized as { idempotent?: boolean } | null)?.idempotent) }));
  return json({ received: true }, 200);
});
