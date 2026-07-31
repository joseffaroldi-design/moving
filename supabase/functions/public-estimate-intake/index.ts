// =====================================================================
// supabase/functions/public-estimate-intake/index.ts
// PUBLIC (unauthenticated) estimate-request intake for the marketing site.
//
// SECURITY MODEL
//  - This is the ONLY public boundary. It holds the service-role secret and
//    calls public.create_public_lead(jsonb) (service_role-only). The browser
//    never touches base tables or that RPC directly.
//  - Controls: origin allowlist CORS, OPTIONS preflight, POST-only, JSON-only,
//    body-size cap, strict field allowlist, honeypot, server-side validation +
//    normalization, DB-enforced idempotency (via the RPC), best-effort Deno KV
//    rate limiting, generic public errors, request timeout, NO PII/secret logs.
//  - company_id is resolved INSIDE the RPC (never accepted from the client).
//
// DEPLOY (owner): supabase functions deploy public-estimate-intake --no-verify-jwt
//   (public function — auth is by honeypot + validation + rate limit, not JWT.)
// ENV (Supabase injects SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY automatically):
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
//   - INTAKE_ALLOWED_ORIGINS  (comma-separated; else the built-in defaults)
// =====================================================================

const DEFAULT_ORIGINS = [
  "https://magnolia-movers-rc1.preview.emergentagent.com",
];

const MAX_BODY_BYTES = 8 * 1024; // 8 KB hard cap
const RPC_TIMEOUT_MS = 8000;

// Rate limits (best-effort, Deno KV). See notes at the bottom of this file.
const RL = {
  ipPerMin: { limit: 5, windowSec: 60 },
  ipPerHour: { limit: 30, windowSec: 3600 },
  emailPer10Min: { limit: 3, windowSec: 600 },
};

const MOVE_TYPES = new Set([
  "Residential Moving", "Commercial Moving", "Packing Services",
  "Specialty Items", "Local Moving", "Long-Distance",
]);
const HOME_SIZES = new Set([
  "Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "4 Bedrooms", "5+ Bedrooms",
  "Office", "Storage Unit", "Other",
]);
const SERVICES = new Set([
  "Packing", "Unpacking", "Loading", "Unloading", "Furniture Assembly",
  "Storage", "Specialty Items", "Junk Removal",
]);

function allowedOrigins(): string[] {
  const env = Deno.env.get("INTAKE_ALLOWED_ORIGINS");
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_ORIGINS;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins();
  const allow = origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const OK = { ok: true, message: "Your estimate request was received." };
const FAIL = { ok: false, message: "We couldn't submit your request. Please call or text us." };

// --- helpers ---------------------------------------------------------
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Strip control chars, collapse whitespace, cap length.
  return v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 160;
}
function normPhone(s: string): string {
  const p = s.replace(/[^\d+]/g, "");
  const digits = p.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? p.slice(0, 40) : "";
}
function validZip(s: string): string {
  return /^[0-9-]{0,10}$/.test(s) ? s : "";
}
function validDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
  return d >= min && d <= max ? s : "";
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(req: Request): string {
  // Supabase's edge sets x-forwarded-for; take the FIRST (client) hop.
  // NOTE: not cryptographically trustworthy, but adequate for coarse throttling.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || "unknown";
}

async function rateLimited(kv: Deno.Kv | null, ip: string, email: string): Promise<boolean> {
  if (!kv) return false; // KV unavailable -> fail-open (documented).
  const checks: Array<[Deno.KvKey, number, number]> = [
    [["rl", "ipm", ip], RL.ipPerMin.limit, RL.ipPerMin.windowSec],
    [["rl", "iph", ip], RL.ipPerHour.limit, RL.ipPerHour.windowSec],
  ];
  if (email) checks.push([["rl", "em", email], RL.emailPer10Min.limit, RL.emailPer10Min.windowSec]);
  for (const [key, limit, windowSec] of checks) {
    const cur = (await kv.get<number>(key)).value ?? 0;
    if (cur >= limit) return true;
    await kv.set(key, cur + 1, { expireIn: windowSec * 1000 });
  }
  return false;
}

// --- handler ---------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(FAIL, 405, origin);

  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.toLowerCase().includes("application/json")) return json(FAIL, 415, origin);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json(FAIL, 500, origin);

  // Body-size cap (read raw, enforce before parse).
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json(FAIL, 400, origin);
  }
  if (raw.length > MAX_BODY_BYTES) return json(FAIL, 413, origin);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("shape");
  } catch {
    return json(FAIL, 400, origin);
  }

  // Honeypot: any value -> pretend success, create nothing.
  if (clean(body["company_website"], 200) !== "") return json(OK, 200, origin);

  // Strict allowlist + validation.
  const errors: Record<string, string> = {};
  const first = clean(body["first_name"], 80);
  const last = clean(body["last_name"], 80);
  if (!first) errors["first_name"] = "Please enter your first name.";
  if (!last) errors["last_name"] = "Please enter your last name.";

  const emailRaw = clean(body["email"], 160).toLowerCase();
  const email = emailRaw && isEmail(emailRaw) ? emailRaw : "";
  if (emailRaw && !email) errors["email"] = "Please enter a valid email address.";
  const phone = normPhone(clean(body["phone"], 40));
  if (!email && !phone) errors["contact"] = "Please provide a phone number or email so we can reach you.";

  const moveTypeRaw = clean(body["move_type"], 40);
  const moveType = MOVE_TYPES.has(moveTypeRaw) ? moveTypeRaw : "";
  const homeSizeRaw = clean(body["home_size"], 40);
  const homeSize = HOME_SIZES.has(homeSizeRaw) ? homeSizeRaw : "";
  const originCity = clean(body["origin_city"], 80);
  const originZip = validZip(clean(body["origin_zip"], 10));
  const destCity = clean(body["destination_city"], 80);
  const destZip = validZip(clean(body["destination_zip"], 10));
  const moveDate = validDate(clean(body["move_date"], 10));
  const notes = clean(body["notes"], 2000);
  const services = Array.isArray(body["services"])
    ? (body["services"] as unknown[]).map((s) => clean(s, 40)).filter((s) => SERVICES.has(s)).slice(0, 12)
    : [];
  const utm = {
    source: clean(body["utm_source"], 120),
    medium: clean(body["utm_medium"], 120),
    campaign: clean(body["utm_campaign"], 120),
  };

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, message: "Please check the highlighted fields.", errors }, 400, origin);
  }

  // Compose address + structured, staff-readable notes (plain text; React
  // escapes on render; parameterized insert -> not executable as SQL/HTML).
  const originAddress = [originCity, originZip].filter(Boolean).join(" ");
  const destAddress = [destCity, destZip].filter(Boolean).join(" ");
  const lines: string[] = ["— Website Estimate Request —"];
  if (moveType) lines.push(`Move type: ${moveType}`);
  if (homeSize) lines.push(`Home size: ${homeSize}`);
  if (services.length) lines.push(`Services: ${services.join(", ")}`);
  if (originAddress) lines.push(`Origin: ${originAddress}`);
  if (destAddress) lines.push(`Destination: ${destAddress}`);
  if (moveDate) lines.push(`Preferred date: ${moveDate}`);
  if (notes) lines.push("", "Customer notes:", notes);
  const composedNotes = lines.join("\n").slice(0, 4000);

  // Idempotency: hash the client token (raw token never stored/logged).
  const idemRaw = clean(body["idempotency_key"], 64);
  const keyHash = idemRaw ? await sha256Hex(idemRaw) : "";

  // Best-effort rate limiting (Deno KV). Fail-open if KV is unavailable.
  let kv: Deno.Kv | null = null;
  try { kv = await Deno.openKv(); } catch { kv = null; }
  try {
    if (await rateLimited(kv, clientIp(req), email)) return json(FAIL, 429, origin);
  } catch { /* fail-open */ }

  // Call the service-role-only atomic RPC with a timeout.
  const payload = {
    first_name: first, last_name: last, email, phone,
    move_date: moveDate, origin_address: originAddress, destination_address: destAddress,
    notes: composedNotes, move_type: moveType,
    utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign,
    key_hash: keyHash,
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), RPC_TIMEOUT_MS);
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_lead`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_payload: payload }),
      signal: ac.signal,
    });
    if (!resp.ok) {
      // Log status only (no body, no PII, no secret).
      console.log(JSON.stringify({ event: "intake", result: "rpc_error", status: resp.status }));
      return json(FAIL, 502, origin);
    }
    console.log(JSON.stringify({ event: "intake", result: "ok" }));
    return json(OK, 200, origin);
  } catch (_e) {
    console.log(JSON.stringify({ event: "intake", result: "exception" }));
    return json(FAIL, 502, origin);
  } finally {
    clearTimeout(timer);
  }
});

// =====================================================================
// RATE LIMITING — HONEST NOTE
//   Deno KV (Deno.openKv) backs a fixed-window counter per client IP and per
//   email. On Supabase's Deno Deploy runtime KV is durable & global across
//   instances, so this is real throttling (not per-instance memory). IP is read
//   from x-forwarded-for (first hop) — spoofable at the network layer, so treat
//   IP limits as coarse. Idempotency is DB-enforced (unique key_hash), which is
//   the strong duplicate guard. If Deno.openKv() is unavailable, rate limiting
//   FAILS OPEN (requests proceed) while honeypot + validation + DB idempotency
//   still apply; add CAPTCHA (Turnstile/hCaptcha) here later for stronger bot
//   defense. Do not treat the IP limit alone as robust production protection.
// =====================================================================
