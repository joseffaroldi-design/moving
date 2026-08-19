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

type Payload = {
  job_id?: string;
  storage_path?: string;
  caption?: string;
  photo_stage?: string;
  mime_type?: string;
  size_bytes?: number;
  operational_issue_id?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Server configuration missing" }, 500);

  let body: Payload;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.job_id || !body.storage_path) return json({ error: "job_id and storage_path are required" }, 400);

  const auth = req.headers.get("Authorization") ?? "";
  const client = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.rpc("crew_register_job_photo", {
    p_job_id: body.job_id,
    p_storage_path: body.storage_path,
    p_caption: body.caption ?? null,
    p_photo_stage: body.photo_stage ?? null,
    p_mime_type: body.mime_type ?? "image/jpeg",
    p_size_bytes: body.size_bytes ?? null,
    p_operational_issue_id: body.operational_issue_id ?? null,
  });
  if (error) {
    return json(
      { error: error.message },
      /not authenticated/i.test(error.message) ? 401
        : /not authorized|not assigned|not found/i.test(error.message) ? 403 : 400
    );
  }
  return json(data, 201);
});
