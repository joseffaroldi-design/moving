import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const EVENTS = new Set(["estimate_received","quote_ready","booking_confirmed","deposit_received","move_reminder","invoice_ready","payment_receipt","review_request"]);
const STAFF = new Set(["owner","operations_manager","dispatcher","sales"]);
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const money = (v: unknown) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(v||0));
function render(input:string, vars:Record<string,string>) { return input.replace(/{{\s*([a-z_]+)\s*}}/g,(_,k)=>vars[k]??""); }

Deno.serve(async (req:Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url||!anon||!service) return json({error:"Server configuration missing"},500);
  const auth=req.headers.get("Authorization")??"";
  const isService=auth === `Bearer ${service}`;
  const admin=createClient(url,service,{auth:{persistSession:false}});
  let callerCompany:string|null=null;
  if (!isService) {
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:u}=await userClient.auth.getUser();
    if (!u.user) return json({error:"Unauthorized"},401);
    const {data:p}=await admin.from("profiles").select("company_id,role,is_active").eq("id",u.user.id).single();
    if (!p||p.is_active!==true||!p.company_id||!STAFF.has(p.role)) return json({error:"Active staff access required"},403);
    callerCompany=p.company_id;
  }
  let b:any; try { b=await req.json(); } catch { return json({error:"Invalid JSON"},400); }

  // Authorized retry: reuses the original immutable event/idempotency identity.
  if (b.retry_communication_id) {
    const {data:old}=await admin.from("communications").select("*").eq("id",String(b.retry_communication_id)).single();
    if (!old || old.channel!=="email" || old.direction!=="outbound") return json({error:"Communication not found"},404);
    if (!isService && old.company_id!==callerCompany) return json({error:"Forbidden"},403);
    if (old.status!=="failed") return json({ok:true,communication_id:old.id,status:old.status,already_processed:true});
    b={...old.metadata,event_type:old.event_type,idempotency_key:old.idempotency_key,customer_id:old.customer_id,lead_id:old.lead_id,quote_id:old.quote_id,job_id:old.job_id,communication_id:old.id};
  }

  const event=String(b.event_type??"");
  if (!EVENTS.has(event)) return json({error:"Invalid event_type"},400);
  const key=String(b.idempotency_key??"").trim();
  if (!key || key.length>240) return json({error:"idempotency_key required"},400);

  let customer:any=null;
  if (b.customer_id) {
    const {data}=await admin.from("customers").select("id,company_id,first_name,last_name,email").eq("id",b.customer_id).single(); customer=data;
  } else if (b.lead_id) {
    const {data:l}=await admin.from("leads").select("company_id,customer_id").eq("id",b.lead_id).single();
    if (l?.customer_id) { const {data}=await admin.from("customers").select("id,company_id,first_name,last_name,email").eq("id",l.customer_id).single(); customer=data; }
  }
  if (!customer?.email) return json({error:"Customer with email required"},400);
  if (!isService && customer.company_id!==callerCompany) return json({error:"Forbidden"},403);
  const companyId=customer.company_id;

  const {data:existing}=await admin.from("communications").select("id,status,provider_message_id,error_message").eq("company_id",companyId).eq("idempotency_key",key).maybeSingle();
  if (existing && !b.communication_id) return json({ok:true,...existing,duplicate:true});

  const {data:bp}=await admin.from("business_profile").select("business_name,email,website").eq("company_id",companyId).maybeSingle();
  const {data:t}=await admin.from("message_templates").select("id,subject,body").eq("company_id",companyId).eq("channel","email").eq("name",event).eq("is_active",true).maybeSingle();
  if (!t) return json({error:`Active template missing for ${event}`},500);

  const vars:Record<string,string>={
    first_name:customer.first_name??"there", business_name:bp?.business_name??"Southern Magnolia Moving",
    move_date:String(b.move_date??""), amount:money(b.amount), invoice_number:String(b.invoice_number??""), action_url:String(b.action_url??"")
  };
  const subject=render(t.subject??"Southern Magnolia Moving update",vars), body=render(t.body,vars);
  const from=Deno.env.get("CUSTOMER_EMAIL_FROM") || bp?.email;
  const apiKey=Deno.env.get("RESEND_API_KEY");
  const metadata={event_type:event,idempotency_key:key,customer_id:customer.id,lead_id:b.lead_id??null,quote_id:b.quote_id??null,job_id:b.job_id??null,move_date:b.move_date??null,amount:b.amount??null,invoice_number:b.invoice_number??null,action_url:b.action_url??null};

  let communicationId=b.communication_id as string|undefined;
  if (!communicationId) {
    const {data:created,error}=await admin.from("communications").insert({company_id:companyId,customer_id:customer.id,lead_id:b.lead_id??null,quote_id:b.quote_id??null,job_id:b.job_id??null,channel:"email",direction:"outbound",subject,body,from_address:from??null,to_address:customer.email,provider:"resend",status:"queued",event_type:event,idempotency_key:key,template_id:t.id,related_object_type:b.related_object_type??null,related_object_id:b.related_object_id??null,metadata}).select("id").single();
    if (error) { const {data:dupe}=await admin.from("communications").select("id,status").eq("company_id",companyId).eq("idempotency_key",key).maybeSingle(); if (dupe) return json({ok:true,...dupe,duplicate:true}); return json({error:error.message},500); }
    communicationId=created.id;
  }
  if (!apiKey || !from) {
    await admin.from("communications").update({status:"failed",error_message:"Email provider configuration missing",last_attempt_at:new Date().toISOString(),retry_count:b.communication_id?Number(b.retry_count??0)+1:0}).eq("id",communicationId);
    return json({error:"Email provider configuration missing",communication_id:communicationId},503);
  }

  try {
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({from,to:[customer.email],subject,text:body})});
    const out=await r.json();
    if (!r.ok) throw new Error(out?.message||`Provider HTTP ${r.status}`);
    await admin.from("communications").update({status:"sent",provider_message_id:out.id??null,sent_at:new Date().toISOString(),last_attempt_at:new Date().toISOString(),error_message:null}).eq("id",communicationId);
    return json({ok:true,communication_id:communicationId,status:"sent",provider_message_id:out.id??null});
  } catch(e) {
    const msg=e instanceof Error?e.message:"Email delivery failed";
    await admin.from("communications").update({status:"failed",error_message:msg,last_attempt_at:new Date().toISOString(),retry_count:b.communication_id?Number(b.retry_count??0)+1:0}).eq("id",communicationId);
    return json({error:msg,communication_id:communicationId},502);
  }
});
