import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAFF_ROLES = new Set([
  "owner",
  "operations_manager",
  "dispatcher",
  "sales",
  "crew_lead",
  "mover",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("id,company_id,role,is_active")
    .eq("id", userData.user.id)
    .single();
  if (callerError || !caller || caller.is_active !== true || !caller.company_id) {
    return json({ error: "Active staff profile required" }, 403);
  }
  if (!new Set(["owner", "operations_manager"]).has(caller.role)) {
    return json({ error: "Insufficient permissions" }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const fullName = String(payload.full_name ?? "").trim().slice(0, 160);
  const phone = String(payload.phone ?? "").trim().slice(0, 40);
  const role = String(payload.role ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    return json({ error: "A valid email is required" }, 400);
  }
  if (!fullName) return json({ error: "Full name is required" }, 400);
  if (!STAFF_ROLES.has(role)) return json({ error: "Invalid staff role" }, 400);
  if (caller.role === "operations_manager" && role === "owner") {
    return json({ error: "Only an owner may invite another owner" }, 403);
  }

  const redirectTo = Deno.env.get("STAFF_INVITE_REDIRECT_URL") || undefined;
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (inviteError || !invite.user) {
    return json({ error: inviteError?.message ?? "Unable to invite staff member" }, 400);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: invite.user.id,
      company_id: caller.company_id,
      role,
      full_name: fullName,
      phone: phone || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (profileError) {
    return json({ error: "Invite created, but staff profile assignment failed" }, 500);
  }

  return json({
    ok: true,
    user_id: invite.user.id,
    email,
    role,
    message: "Invitation sent.",
  }, 201);
});
