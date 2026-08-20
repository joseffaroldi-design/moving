import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

  // Profile lookup remains under the caller's JWT/RLS boundary.
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("id, company_id, role, full_name, phone, avatar_url, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.is_active !== true) {
    return jsonResponse({
      user: { id: userData.user.id, email: userData.user.email },
      profile: null,
      company: null,
      navigation: [],
      counts: null,
      needs_profile: true,
    });
  }

  // These two reference-data tables are deliberately not granted directly to
  // authenticated clients. Read them with service privileges only after the
  // caller has been authenticated and their active tenant profile resolved.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const [{ data: company, error: companyError }, { data: navigation, error: navigationError }] =
    await Promise.all([
      admin
        .from("companies")
        .select("id, name, legal_name, phone, email, website, city, state, timezone")
        .eq("id", profile.company_id)
        .maybeSingle(),
      admin
        .from("app_navigation_items")
        .select("key, label, href, section, icon, allowed_roles, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  if (companyError || navigationError) {
    console.error("me reference-data lookup failed", {
      company: companyError?.message ?? null,
      navigation: navigationError?.message ?? null,
    });
    return jsonResponse({ error: "Unable to load account configuration" }, 500);
  }

  const allowedNavigation = (navigation ?? []).filter((item: any) => {
    return Array.isArray(item.allowed_roles) && item.allowed_roles.includes(profile.role);
  });

  // Business counts stay on the caller client so normal tenant RLS remains
  // the authority for business-data visibility.
  const [leads, quotes, jobs, dispatchAssignments] = await Promise.all([
    userClient.from("leads").select("id", { count: "exact", head: true }),
    userClient.from("quotes").select("id", { count: "exact", head: true }),
    userClient.from("jobs").select("id", { count: "exact", head: true }),
    userClient.from("dispatch_assignments").select("id", { count: "exact", head: true }),
  ]);

  const countError = leads.error ?? quotes.error ?? jobs.error ?? dispatchAssignments.error;
  if (countError) {
    console.error("me tenant-count lookup failed", countError.message);
    return jsonResponse({ error: "Unable to load account counts" }, 500);
  }

  return jsonResponse({
    user: { id: userData.user.id, email: userData.user.email },
    profile,
    company,
    navigation: allowedNavigation,
    counts: {
      leads: leads.count ?? 0,
      quotes: quotes.count ?? 0,
      jobs: jobs.count ?? 0,
      dispatch_assignments: dispatchAssignments.count ?? 0,
    },
    needs_profile: false,
  });
});
