import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const allowed = new Set([
  "assigned",
  "en_route",
  "arrived",
  "loading",
  "in_transit",
  "unloading",
  "completed",
  "issue",
]);

type Payload = {
  job_id?: string;
  status?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Server configuration missing" }, 500);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.job_id || !body.status || !allowed.has(body.status)) {
    return json({ error: "Valid job_id and status are required" }, 400);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "Unauthorized" }, 401);

  const user = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data, error } = await user.rpc("crew_set_move_day_status", {
    p_job_id: body.job_id,
    p_status: body.status,
    p_note: body.note ?? null,
    p_latitude: body.latitude ?? null,
    p_longitude: body.longitude ?? null,
  });

  if (error) {
    const message = error.message || "Unable to update move-day status";
    const status = /not authenticated|unauthorized/i.test(message)
      ? 401
      : /not assigned|not found/i.test(message)
        ? 403
        : 409;
    return json({ error: message }, status);
  }

  return json(data, 200);
});
