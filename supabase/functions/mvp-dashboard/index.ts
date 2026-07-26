// =====================================================================
// supabase/functions/mvp-dashboard/index.ts
// SECURE replacement for the mvp-dashboard Edge Function [B1 remediation].
//
// SECURITY MODEL
//  - Requires an Authorization: Bearer <access_token> header.
//  - Verifies the JWT via Supabase auth (getUser). Missing/malformed/expired/
//    invalid -> 401.
//  - Resolves the caller's profile server-side; must be active; role must be an
//    approved staff role -> else 403 (customers/unauthorized rejected).
//  - company_id is DERIVED from the verified profile. Any client-supplied tenant
//    id in the body/query is IGNORED.
//  - Data is read with a USER-SCOPED client (the caller's JWT), so Postgres RLS
//    is the final authority and cross-company access is impossible. NO service
//    role is used.
//  - Returns ONLY dashboard-required fields. Excludes customer email, phone,
//    full address, and internal/dispatcher notes.
//  - Structured errors; never leaks DB error text. Never logs JWTs/keys/PII.
//
// DO NOT hardcode secrets. Uses the platform-injected env:
//   SUPABASE_URL, SUPABASE_ANON_KEY  (both provided to every Edge Function).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["owner", "operations_manager", "dispatcher", "sales"];
const RECENT_LIMIT = 10;

// Explicit CORS. Tighten ALLOW_ORIGIN to your production domain if you do not
// need cross-origin calls; "*" is acceptable here only because every response
// requires a valid bearer token (no cookies / credentials mode).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !ANON_KEY) return json({ error: "server_misconfigured" }, 500);

    // 1) Require a bearer token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) return json({ error: "unauthorized" }, 401);

    // 2) User-scoped client — the caller's JWT drives every query (RLS enforced).
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3) Verify the JWT.
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const uid = userData.user.id;

    // 4) Resolve profile server-side: active + approved staff role.
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, company_id, role, is_active")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) return json({ error: "profile_lookup_failed" }, 500);
    if (!profile || !profile.company_id) return json({ error: "forbidden" }, 403);
    if (profile.is_active !== true) return json({ error: "inactive_account" }, 403);
    if (!ALLOWED_ROLES.includes(profile.role)) return json({ error: "forbidden" }, 403);

    // 5) Tenant is derived from the verified profile; client input ignored.
    const companyId = profile.company_id;

    // 6) Minimal, non-PII dashboard payload (RLS also scopes these to companyId).
    const countHead = (table: string, extra?: (q: any) => any) => {
      let q = supabase.from(table).select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (extra) q = extra(q);
      return q;
    };

    const [
      leadsCount, quotesCount, jobsCount,
      recentLeads, recentQuotes, recentJobs,
    ] = await Promise.all([
      countHead("leads"),
      countHead("quotes"),
      countHead("jobs"),
      // NOTE: no email / phone / address / notes selected.
      supabase.from("leads")
        .select("id, status, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      supabase.from("quotes")
        .select("id, quote_number, status, total, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      supabase.from("jobs")
        .select("id, job_number, status, scheduled_start, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
    ]);

    const firstErr = [leadsCount, quotesCount, jobsCount, recentLeads, recentQuotes, recentJobs]
      .find((r: any) => r?.error);
    if (firstErr) return json({ error: "query_failed" }, 500);

    return json({
      company_id: companyId,
      role: profile.role,
      counts: {
        leads: leadsCount.count ?? 0,
        quotes: quotesCount.count ?? 0,
        jobs: jobsCount.count ?? 0,
      },
      recent_leads: recentLeads.data ?? [],
      recent_quotes: recentQuotes.data ?? [],
      recent_jobs: recentJobs.data ?? [],
    }, 200);
  } catch (_e) {
    // Never leak internal/DB error text.
    return json({ error: "internal_error" }, 500);
  }
});
