// =====================================================================
// supabase/functions/mvp-dashboard/index.ts
// SECURE, authenticated, company-scoped dashboard [B1 remediation].
//
// SECURITY MODEL
//  - Requires an Authorization: Bearer <user access token> header.
//    * No header / malformed             -> 401
//    * anon publishable key as bearer     -> 401 (not a user JWT)
//    * invalid / expired user JWT         -> 401
//  - Verifies the JWT via supabase.auth.getUser(token).
//  - Resolves the caller's profile server-side; must be active AND hold an
//    approved staff role, else 403 (customers / inactive / no-company /
//    non-staff roles are all rejected).
//  - company_id + role are DERIVED from the verified profile. Any client
//    supplied tenant id in the body/query is IGNORED (cannot be overridden).
//  - ALL data queries run through a USER-SCOPED client (the caller's JWT is
//    forwarded), so Postgres RLS is the final authority and cross-company
//    access is impossible. NO service-role client is used. No anon/bypass
//    path remains — the publishable key alone never authorizes a request.
//  - Explicit column selection only (never select('*')). Returns operational
//    fields the staff dashboard UI needs (customer name, move route,
//    schedule, quote totals, statuses). Does NOT return customer email /
//    phone / internal notes / metadata.
//  - Structured errors; never leaks DB error text, stack traces, tokens, or
//    config. Never logs JWTs/keys/PII.
//
// Uses the platform-injected env only: SUPABASE_URL, SUPABASE_ANON_KEY.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["owner", "operations_manager", "dispatcher", "sales"];
const RECENT_LIMIT = 10;

// CORS: "*" is acceptable here only because every response requires a valid
// bearer token (no cookies / credentials mode).
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
    //    The anon key only initializes the client; the forwarded JWT authorizes.
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3) Verify the JWT (anon publishable key / invalid / expired -> no user).
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const uid = userData.user.id;

    // 4) Resolve profile server-side: active + approved staff role + company.
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, company_id, role, is_active")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) return json({ error: "profile_lookup_failed" }, 500);
    if (!profile || !profile.company_id) return json({ error: "forbidden" }, 403);
    if (profile.is_active !== true) return json({ error: "inactive_account" }, 403);
    if (!ALLOWED_ROLES.includes(profile.role)) return json({ error: "forbidden" }, 403);

    // 5) Tenant derived from the verified profile; client input ignored.
    const companyId = profile.company_id;

    const countHead = (table: string) =>
      supabase.from(table).select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

    // 6) Company-scoped payload (RLS also scopes every query to companyId).
    //    Explicit columns; no email / phone / notes / metadata.
    const [
      customersCount, leadsCount, quotesCount, jobsCount, dispatchCount, trucksCount,
      recentLeads, recentQuotes, upcomingJobs,
    ] = await Promise.all([
      countHead("customers"),
      countHead("leads"),
      countHead("quotes"),
      countHead("jobs"),
      countHead("dispatch_assignments"),
      countHead("trucks"),
      supabase.from("leads")
        .select("id, status, move_date, origin_address, destination_address, created_at, customers(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      supabase.from("quotes")
        .select("id, quote_number, status, total, created_at, customers(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      supabase.from("jobs")
        .select("id, job_number, status, scheduled_start, origin_address, destination_address, customers(first_name, last_name)")
        .eq("company_id", companyId)
        .order("scheduled_start", { ascending: true }).limit(RECENT_LIMIT),
    ]);

    const firstErr = [
      customersCount, leadsCount, quotesCount, jobsCount, dispatchCount, trucksCount,
      recentLeads, recentQuotes, upcomingJobs,
    ].find((r: any) => r?.error);
    if (firstErr) return json({ error: "query_failed" }, 500);

    return json({
      company_id: companyId,
      role: profile.role,
      counts: {
        customers: customersCount.count ?? 0,
        leads: leadsCount.count ?? 0,
        quotes: quotesCount.count ?? 0,
        jobs: jobsCount.count ?? 0,
        dispatch_assignments: dispatchCount.count ?? 0,
        trucks: trucksCount.count ?? 0,
      },
      recent_leads: recentLeads.data ?? [],
      recent_quotes: recentQuotes.data ?? [],
      upcoming_jobs: upcomingJobs.data ?? [],
    }, 200);
  } catch (_e) {
    // Never leak internal/DB error text.
    return json({ error: "internal_error" }, 500);
  }
});
