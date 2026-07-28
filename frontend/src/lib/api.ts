import { FUNCTIONS_URL, SUPABASE_KEY } from "./supabase/config";
import type { MeResponse, NormalizedDashboard } from "./types";
import { normalizeDashboard } from "./normalize";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function baseHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token || SUPABASE_KEY}`,
  };
}

async function callFunction<T>(
  name: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const { method = "GET", body, token } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method,
      headers: baseHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      "Unable to reach the MoveOps backend. The Supabase project may be paused or offline.",
      0
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg =
      (json && typeof json === "object" && "error" in json
        ? String((json as Record<string, unknown>).error)
        : null) || `Request to ${name} failed (${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return json as T;
}

// Requires the caller's authenticated Supabase access token. The token is
// forwarded so every query in the Edge Function runs under the caller's RLS
// context. There is NO anonymous fallback: without a token this rejects.
export async function getDashboard(token: string): Promise<NormalizedDashboard> {
  if (!token) throw new ApiError("You need to be signed in to load the dashboard.", 401);
  const raw = await callFunction<unknown>("mvp-dashboard", { token });
  return normalizeDashboard(raw);
}

export async function getHealth(): Promise<unknown> {
  return callFunction<unknown>("app-health");
}

export async function getMe(token: string): Promise<MeResponse> {
  return callFunction<MeResponse>("me", { token });
}
