// =====================================================================
// supabase/functions/mvp-dashboard/index.ts
// SECURE, authenticated, company-scoped dashboard [B1 remediation].
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ROLES = ["owner", "operations_manager", "dispatcher", "sales"];
const RECENT_LIMIT = 10;

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

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const uid = userData.user.id;

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, company_id, role, is_active")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) return json({ error: "profile_lookup_failed" }, 500);
    if (!profile || !profile.company_id) return json({ error: "forbidden" }, 403);
    if (profile.is_active !== true) return json({ error: "inactive_account" }, 403);
    if (!ALLOWED_ROLES.includes(profile.role)) return json({ error: "forbidden" }, 403);

    const companyId = profile.company_id;
    const countHead = (table: string) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);

    const [
      customersCount, leadsCount, quotesCount, jobsCount, dispatchCount, trucksCount,
      recentLeads, recentQuotes, upcomingJobs, reportSummary,
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
      supabase.rpc("staff_report_summary"),
    ]);

    const firstErr = [
      customersCount, leadsCount, quotesCount, jobsCount, dispatchCount, trucksCount,
      recentLeads, recentQuotes, upcomingJobs, reportSummary,
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
      reporting: reportSummary.data ?? {},
      recent_leads: recentLeads.data ?? [],
      recent_quotes: recentQuotes.data ?? [],
      upcoming_jobs: upcomingJobs.data ?? [],
    }, 200);
  } catch (_e) {
    return json({ error: "internal_error" }, 500);
  }
});
