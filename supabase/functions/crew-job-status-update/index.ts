import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const allowed = new Set(["assigned","en_route","arrived","loading","in_transit","unloading","completed","issue"]);

type Payload = { job_id?: string; status?: string; note?: string; latitude?: number; longitude?: number };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Server configuration missing" }, 500);

  let body: Payload;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.job_id || !body.status || !allowed.has(body.status)) return json({ error: "Valid job_id and status are required" }, 400);

  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: job, error: gateError } = await user.rpc("crew_get_job", { p_job_id: body.job_id });
  if (gateError || !job) return json({ error: gateError?.message ?? "Job not authorized" }, 403);

  const { data: userData, error: userError } = await user.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("id,company_id").eq("id", userData.user.id).single();
  if (!profile) return json({ error: "Profile not found" }, 403);

  const { data: event, error: eventError } = await admin.from("job_status_events").insert({
    company_id: profile.company_id,
    job_id: body.job_id,
    status: body.status,
    note: body.note ?? null,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    created_by: profile.id,
  }).select("id,created_at").single();
  if (eventError || !event) return json({ error: eventError?.message ?? "Unable to log status" }, 500);

  await admin.from("dispatch_assignments").update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("job_id", body.job_id).eq("company_id", profile.company_id);
  if (body.status === "completed") {
    await admin.from("jobs").update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", body.job_id).eq("company_id", profile.company_id);
  }
  return json({ event_id: event.id, created_at: event.created_at }, 201);
});
