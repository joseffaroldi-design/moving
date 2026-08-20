const DEFAULT_ORIGINS = [
  "https://ops-preview-7.emergent.host",
  "https://magnolia-movers-rc1.preview.emergentagent.com",
  "http://localhost:3000",
];

const MAX_BODY_BYTES = 4 * 1024;
const RPC_TIMEOUT_MS = 5000;

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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function numberInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function estimateVolumeFromBedrooms(bedrooms: number): number {
  const bedroomVolume: Record<number, number> = {
    0: 350,
    1: 650,
    2: 950,
    3: 1250,
    4: 1650,
    5: 2100,
    6: 2400,
    7: 2800,
    8: 3200,
  };
  return bedroomVolume[bedrooms] ?? 950;
}

async function checkRateLimit(req: Request, origin: string | null): Promise<Response | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Service unavailable" }, 503, origin);

  const ipHash = await sha256Hex(`estimate:ip:${clientIp(req)}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/check_public_intake_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_endpoint: "estimate",
        p_ip_hash: ipHash,
        p_email_hash: null,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return json({ error: "Service unavailable" }, 503, origin);
    const result = await resp.json() as { allowed?: boolean; retry_after_seconds?: number };
    if (result.allowed !== true) {
      const retryAfter = Math.max(1, Number(result.retry_after_seconds) || 60);
      return json(
        { error: "Too many requests. Please try again shortly." },
        429,
        origin,
        { "Retry-After": String(retryAfter) },
      );
    }
    return null;
  } catch {
    return json({ error: "Service unavailable" }, 503, origin);
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!originAllowed(origin)) return json({ error: "Forbidden origin" }, 403, origin);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Unsupported media type" }, 415, origin);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413, origin);
  }

  const limited = await checkRateLimit(req, origin);
  if (limited) return limited;

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Invalid request" }, 400, origin);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413, origin);

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("shape");
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const bedrooms = finiteNumber(payload.bedrooms, 2);
  const volume = payload.volume_cuft == null
    ? estimateVolumeFromBedrooms(bedrooms)
    : finiteNumber(payload.volume_cuft, NaN);
  const distance = finiteNumber(payload.distance_miles, 15);
  const stairs = finiteNumber(payload.stairs_flights, 0);

  if (!integerInRange(bedrooms, 0, 8)) return json({ error: "Invalid bedrooms" }, 400, origin);
  if (!numberInRange(volume, 100, 5000)) return json({ error: "Invalid volume" }, 400, origin);
  if (!numberInRange(distance, 0, 500)) return json({ error: "Invalid distance" }, 400, origin);
  if (!integerInRange(stairs, 0, 12)) return json({ error: "Invalid stairs" }, 400, origin);

  for (const field of ["has_piano", "has_safe", "packing_requested"] as const) {
    if (payload[field] != null && typeof payload[field] !== "boolean") {
      return json({ error: `Invalid ${field}` }, 400, origin);
    }
  }

  const hasPiano = payload.has_piano === true;
  const hasSafe = payload.has_safe === true;
  const packingRequested = payload.packing_requested === true;

  const crewSize = volume <= 800 ? 2 : volume <= 1500 ? 3 : 4;
  const truckCount = volume <= 1400 ? 1 : 2;
  const baseHours = Math.max(3, Math.ceil(volume / (crewSize * 150)));
  const travelHours = Math.max(1, Math.ceil(distance / 30));
  const stairsHours = stairs * 0.5;
  const specialtyHours = (hasPiano ? 1.5 : 0) + (hasSafe ? 1 : 0);
  const packingHours = packingRequested ? Math.ceil(volume / 500) : 0;

  const estimatedHours = baseHours + travelHours + stairsHours + specialtyHours + packingHours;
  const hourlyRate = crewSize === 2 ? 149 : crewSize === 3 ? 199 : 249;
  const labor = estimatedHours * hourlyRate;
  const travelFee = 89;
  const fuel = distance > 30 ? 79 : 39;
  const stairsFee = stairs * 35;
  const specialtyFees = (hasPiano ? 300 : 0) + (hasSafe ? 250 : 0);
  const packingFee = packingRequested ? packingHours * 99 : 0;
  const estimatedTotal = Math.round(labor + travelFee + fuel + stairsFee + specialtyFees + packingFee);

  return json({
    crew_size: crewSize,
    truck_count: truckCount,
    estimated_volume_cuft: volume,
    estimated_hours: estimatedHours,
    hourly_rate: hourlyRate,
    line_items: [
      { description: "Labor", amount: Math.round(labor) },
      { description: "Travel fee", amount: travelFee },
      { description: "Fuel surcharge", amount: fuel },
      ...(stairsFee ? [{ description: "Stairs", amount: stairsFee }] : []),
      ...(specialtyFees ? [{ description: "Specialty handling", amount: specialtyFees }] : []),
      ...(packingFee ? [{ description: "Packing labor", amount: packingFee }] : []),
    ],
    estimated_total: estimatedTotal,
    low_range: Math.round(estimatedTotal * 0.9),
    high_range: Math.round(estimatedTotal * 1.15),
  }, 200, origin);
});
