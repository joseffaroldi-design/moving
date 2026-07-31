// Public estimate-intake client. Posts to the `public-estimate-intake` Edge
// Function. No DB access from the browser; the function holds the service role.
//
// Activation: set NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED="true" AFTER the Edge
// Function is deployed. While unset/false, EstimateForm keeps its current
// frontend-only behavior and never calls this.

export type EstimatePayload = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  move_type?: string;
  origin_city?: string;
  origin_zip?: string;
  destination_city?: string;
  destination_zip?: string;
  move_date?: string;
  home_size?: string;
  services?: string[];
  notes?: string;
};

export type EstimateResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
};

export const INTAKE_ENABLED =
  process.env.NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED === "true";

const FALLBACK_FAIL: EstimateResult = {
  ok: false,
  message: "We couldn't submit your request. Please call or text us.",
};

export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function submitEstimate(
  payload: EstimatePayload,
  idempotencyKey: string
): Promise<EstimateResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !apikey) return FALLBACK_FAIL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(`${base}/functions/v1/public-estimate-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        ...payload,
        company_website: "", // honeypot (must stay empty)
        idempotency_key: idempotencyKey,
      }),
      signal: controller.signal,
    });
    const data = (await resp.json().catch(() => null)) as EstimateResult | null;
    if (!data || typeof data.ok !== "boolean") return FALLBACK_FAIL;
    return data;
  } catch {
    return FALLBACK_FAIL;
  } finally {
    clearTimeout(timer);
  }
}
