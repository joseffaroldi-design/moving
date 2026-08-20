const DEFAULT_ORIGINS = [
  "https://ops-preview-7.emergent.host",
  "https://magnolia-movers-rc1.preview.emergentagent.com",
  "http://localhost:3000",
];

const MAX_BODY_BYTES = 8 * 1024;
const RPC_TIMEOUT_MS = 8000;

const MOVE_TYPES = new Set([
  "Residential Moving",
  "Commercial Moving",
  "Packing Services",
  "Specialty Items",
  "Local Moving",
  "Long-Distance",
]);

const HOME_SIZES = new Set([
  "Studio",
  "1 Bedroom",
  "2 Bedrooms",
  "3 Bedrooms",
  "4 Bedrooms",
  "5+ Bedrooms",
  "Office",
  "Storage Unit",
  "Other",
]);

const SERVICES = new Set([
  "Packing",
  "Unpacking",
  "Loading",
  "Unloading",
  "Furniture Assembly",
  "Storage",
  "Specialty Items",
  "Junk Removal",
]);

function allowedOrigins(): string[] {
  const env = Deno.env.get("INTAKE_ALLOWED_ORIGINS") ?? "";
  return Array.from(new Set([
    ...DEFAULT_ORIGINS,
    ...env.split(",").map((s) => s.trim()).filter(Boolean),
  ]));
}

function originAllowed(origin: string | null): boolean {
  return !origin || allowedOrigins().includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins();
  const allow = origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-idempotency-key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...extraHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const OK = { ok: true, message: "Your estimate request was received." };
const FAIL = { ok: false, message: "We couldn't submit your request. Please call or text us." };

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

function normalizePhone(value: string): string {
  const normalized = value.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? normalized.slice(0, 40) : "";
}

function validZip(value: string): boolean {
  return value === "" || /^[0-9][0-9-]{0,9}$/.test(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const min = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const max = new Date(min);
  max.setUTCFullYear(max.getUTCFullYear() + 2);
  return date >= min && date <= max;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}

async function rpc(
  url: string,
  serviceKey: string,
  name: string,
  body: Record<string, unknown>,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (!originAllowed(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(FAIL, 405, origin);
  if (!originAllowed(origin)) return json(FAIL, 403, origin);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return json(FAIL, 415, origin);

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(FAIL, 413, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(FAIL, 503, origin);

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json(FAIL, 400, origin);
  }
  if (raw.length > MAX_BODY_BYTES) return json(FAIL, 413, origin);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(FAIL, 400, origin);
  }

  if (clean(body.company_website ?? body.website, 200)) return json(OK, 202, origin);

  const errors: Record<string, string> = {};
  const first = clean(body.first_name, 80);
  const last = clean(body.last_name, 80);
  if (!first) errors.first_name = "Please enter your first name.";
  if (!last) errors.last_name = "Please enter your last name.";

  const emailRaw = clean(body.email, 160).toLowerCase();
  const email = emailRaw && isEmail(emailRaw) ? emailRaw : "";
  if (emailRaw && !email) errors.email = "Please enter a valid email address.";

  const phoneRaw = clean(body.phone, 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
  if (phoneRaw && !phone) errors.phone = "Please enter a valid phone number.";
  if (!email && !phone) errors.contact = "Please provide a phone number or email so we can reach you.";

  const moveTypeRaw = clean(body.move_type, 80);
  const moveType = moveTypeRaw && MOVE_TYPES.has(moveTypeRaw) ? moveTypeRaw : "";
  if (moveTypeRaw && !moveType) errors.move_type = "Please choose a valid move type.";

  const homeSizeRaw = clean(body.home_size, 40);
  const homeSize = homeSizeRaw && HOME_SIZES.has(homeSizeRaw) ? homeSizeRaw : "";
  if (homeSizeRaw && !homeSize) errors.home_size = "Please choose a valid home size.";

  const originCity = clean(body.origin_city, 80);
  const originZip = clean(body.origin_zip, 10);
  if (!validZip(originZip)) errors.origin_zip = "Please enter a valid ZIP code.";

  const destinationCity = clean(body.destination_city, 80);
  const destinationZip = clean(body.destination_zip, 10);
  if (!validZip(destinationZip)) errors.destination_zip = "Please enter a valid ZIP code.";

  const moveDateRaw = clean(body.move_date, 10);
  const moveDate = moveDateRaw && validDate(moveDateRaw) ? moveDateRaw : "";
  if (moveDateRaw && !moveDate) errors.move_date = "Please choose a date within the next two years.";

  const notes = clean(body.notes, 2000);
  const servicesRaw = Array.isArray(body.services) ? body.services : [];
  const services: string[] = [];
  for (const item of servicesRaw.slice(0, 12)) {
    const value = clean(item, 40);
    if (!SERVICES.has(value)) {
      errors.services = "Please choose valid services.";
      break;
    }
    services.push(value);
  }

  if (Object.keys(errors).length) {
    return json({ ok: false, message: "Please check the highlighted fields.", errors }, 400, origin);
  }

  const originAddress = [originCity, originZip].filter(Boolean).join(" ");
  const destinationAddress = [destinationCity, destinationZip].filter(Boolean).join(" ");

  const lines = ["— Website Estimate Request —"];
  if (moveType) lines.push(`Move type: ${moveType}`);
  if (homeSize) lines.push(`Home size: ${homeSize}`);
  if (services.length) lines.push(`Services: ${services.join(", ")}`);
  if (originAddress) lines.push(`Origin: ${originAddress}`);
  if (destinationAddress) lines.push(`Destination: ${destinationAddress}`);
  if (moveDate) lines.push(`Preferred date: ${moveDate}`);
  if (notes) lines.push("", "Customer notes:", notes);
  const composedNotes = lines.join("\n").slice(0, 4000);

  const clientToken = clean(req.headers.get("x-idempotency-key") || body.idempotency_key, 200);
  if (!clientToken || clientToken.length < 16) {
    return json({ ok: false, message: "Please refresh the page and try again." }, 400, origin);
  }

  const keyHash = await sha256Hex(clientToken);
  const payloadHash = await sha256Hex(JSON.stringify([
    first,
    last,
    email,
    phone,
    moveType,
    originAddress,
    destinationAddress,
    moveDate,
    composedNotes,
  ]));

  const ipHash = await sha256Hex(`lead:ip:${clientIp(req)}`);
  const emailHash = email ? await sha256Hex(`lead:email:${email}`) : null;

  try {
    const limitResp = await rpc(supabaseUrl, serviceKey, "check_public_intake_rate_limit", {
      p_endpoint: "lead",
      p_ip_hash: ipHash,
      p_email_hash: emailHash,
    });
    if (!limitResp.ok) return json(FAIL, 503, origin);
    const limit = await limitResp.json() as { allowed?: boolean; retry_after_seconds?: number };
    if (limit.allowed !== true) {
      const retryAfter = Math.max(1, Number(limit.retry_after_seconds) || 60);
      return json(
        { ok: false, message: "Too many requests. Please wait a moment and try again." },
        429,
        origin,
        { "Retry-After": String(retryAfter) },
      );
    }
  } catch {
    return json(FAIL, 503, origin);
  }

  const utmSource = clean(body.utm_source, 120);
  const utmMedium = clean(body.utm_medium, 120);
  const utmCampaign = clean(body.utm_campaign, 120);

  try {
    const createResp = await rpc(supabaseUrl, serviceKey, "create_public_lead", {
      p_payload: {
        first_name: first,
        last_name: last,
        email: email || null,
        phone: phone || null,
        move_date: moveDate || null,
        origin_address: originAddress || null,
        destination_address: destinationAddress || null,
        move_type: moveType || null,
        notes: composedNotes || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        key_hash: keyHash,
        payload_hash: payloadHash,
      },
    });

    if (!createResp.ok) {
      const errorText = await createResp.text().catch(() => "");
      if (errorText.includes("idempotency_conflict")) {
        return json({ ok: false, message: "This request changed while being submitted. Please refresh and try again." }, 409, origin);
      }
      return json(FAIL, 502, origin);
    }

    const data = await createResp.json().catch(() => null) as { status?: string } | null;
    return json(
      { ok: true, message: OK.message, status: data?.status === "duplicate" ? "duplicate" : "created" },
      data?.status === "duplicate" ? 200 : 201,
      origin,
    );
  } catch {
    return json(FAIL, 502, origin);
  }
});
