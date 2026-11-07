-- Southern Magnolia Moving: quote service details and accepted-quote job creation.
-- Additive schema changes. No existing quote/lead/job is backfilled or converted.
begin;

alter table public.quotes
  add column if not exists service_type text not null default 'moving',
  add column if not exists service_date date,
  add column if not exists origin_address text,
  add column if not exists destination_address text,
  add column if not exists access_details text,
  add column if not exists service_notes text;
alter table public.quotes add constraint quotes_service_type_check
  check (service_type in ('moving','junk_removal'));

-- Newly accepted work is real work, but is NOT scheduled until the dispatcher supplies
-- an exact timestamp. Never invent a noon appointment or pickup address.
alter table public.jobs alter column scheduled_start drop not null;
alter table public.jobs alter column origin_address drop not null;
alter table public.jobs alter column destination_address drop not null;
alter table public.jobs add column if not exists service_type text not null default 'moving';
alter table public.jobs add constraint jobs_service_type_check
  check (service_type in ('moving','junk_removal'));

-- All quote details writes require an active authorized company staff member.
create or replace function public.set_draft_quote_details(p_quote_id uuid, p_details jsonb)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._require_quote_mutator();
  q public.quotes%rowtype;
  v_type text;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details must be an object';
  end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found or q.company_id <> v_company then raise exception 'Quote not found'; end if;
  if q.status::text <> 'draft' then raise exception 'Only draft quote details can be edited'; end if;
  v_type := coalesce(nullif(p_details->>'service_type',''),q.service_type);
  if v_type not in ('moving','junk_removal') then raise exception 'Invalid service type'; end if;
  if length(coalesce(p_details->>'origin_address','')) > 1000
     or length(coalesce(p_details->>'destination_address','')) > 1000
     or length(coalesce(p_details->>'access_details','')) > 4000
     or length(coalesce(p_details->>'service_notes','')) > 8000 then
    raise exception 'Service details exceed maximum length';
  end if;
  update public.quotes
  set service_type=v_type,
      service_date=case when p_details ? 'service_date'
        then nullif(p_details->>'service_date','')::date else service_date end,
      origin_address=case when p_details ? 'origin_address'
        then nullif(btrim(p_details->>'origin_address'),'') else origin_address end,
      destination_address=case when p_details ? 'destination_address'
        then nullif(btrim(p_details->>'destination_address'),'') else destination_address end,
      access_details=case when p_details ? 'access_details'
        then nullif(btrim(p_details->>'access_details'),'') else access_details end,
      service_notes=case when p_details ? 'service_notes'
        then nullif(btrim(p_details->>'service_notes'),'') else service_notes end
  where id=p_quote_id;
  return json_build_object('quote_id',p_quote_id);
end; $$;
revoke all on function public.set_draft_quote_details(uuid,jsonb) from public,anon,service_role;
grant execute on function public.set_draft_quote_details(uuid,jsonb) to authenticated;

-- Existing pricing engine remains authoritative; both operations occur atomically.
create or replace function public.create_quote_with_service(
 p_lead_id uuid, p_customer_id uuid, p_hourly_rate numeric, p_estimated_hours numeric,
 p_travel_fee numeric, p_packing_fee numeric, p_materials_fee numeric, p_discount numeric,
 p_tax_rate numeric, p_deposit_percent numeric, p_expires_at timestamptz,
 p_line_items jsonb, p_crew_size integer, p_details jsonb)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result json; v_id uuid; v_lead record; v_details jsonb := coalesce(p_details,'{}'::jsonb);
begin
  v_result := public.create_quote_with_crew(
    p_lead_id,p_customer_id,p_hourly_rate,p_estimated_hours,p_travel_fee,
    p_packing_fee,p_materials_fee,p_discount,p_tax_rate,p_deposit_percent,
    p_expires_at,p_line_items,p_crew_size);
  v_id := (v_result->>'quote_id')::uuid;
  if p_lead_id is not null then
    select l.move_date,l.origin_address,l.destination_address,l.notes into v_lead
    from public.leads l join public.quotes q on q.lead_id=l.id
    where q.id=v_id and l.company_id=q.company_id;
    if found then
      v_details := jsonb_build_object(
        'service_date',v_lead.move_date,
        'origin_address',v_lead.origin_address,
        'destination_address',v_lead.destination_address,
        'service_type',case when coalesce(v_lead.notes,'') ~ '(Service type|Move type): Junk Removal'
          then 'junk_removal' else 'moving' end
      ) || v_details;
    end if;
  end if;
  perform public.set_draft_quote_details(v_id,v_details);
  return v_result;
end; $$;
revoke all on function public.create_quote_with_service(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer,jsonb) from public,anon,service_role;
grant execute on function public.create_quote_with_service(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer,jsonb) to authenticated;

create or replace function public.update_draft_quote_with_service(
 p_quote_id uuid,p_hourly_rate numeric,p_estimated_hours numeric,
 p_travel_fee numeric,p_packing_fee numeric,p_materials_fee numeric,p_discount numeric,
 p_tax_rate numeric,p_deposit_percent numeric,p_expires_at timestamptz,
 p_line_items jsonb,p_crew_size integer,p_details jsonb)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result json;
begin
  v_result := public.update_draft_quote_with_crew(
    p_quote_id,p_hourly_rate,p_estimated_hours,p_travel_fee,p_packing_fee,
    p_materials_fee,p_discount,p_tax_rate,p_deposit_percent,p_expires_at,
    p_line_items,p_crew_size);
  perform public.set_draft_quote_details(p_quote_id,p_details);
  return v_result;
end; $$;
revoke all on function public.update_draft_quote_with_service(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer,jsonb) from public,anon,service_role;
grant execute on function public.update_draft_quote_with_service(uuid,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer,jsonb) to authenticated;

-- Public customer acceptance already validates bearer token and expiry.
-- Trigger applies to ALL accepted quote paths, including portal acceptance.
-- Quote and job are saved in the SAME transaction. Unique quote_id index ensures idempotency.
create or replace function public._auto_job_from_accepted_quote()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_job uuid; v_number text; v_origin text; v_dest text; v_cust uuid; v_lead_date date;
begin
  if new.status::text <> 'accepted'
     or old.status is not distinct from new.status then return new; end if;
  select id into v_job from public.jobs where quote_id=new.id;
  if v_job is not null then
    update public.quotes set status='converted',updated_at=now() where id=new.id and status='accepted';
    return new;
  end if;

  select l.customer_id,l.move_date,l.origin_address,l.destination_address
  into v_cust,v_lead_date,v_origin,v_dest
  from public.leads l where l.id=new.lead_id and l.company_id=new.company_id;
  v_number := public.next_job_number(new.company_id);
  insert into public.jobs (
    company_id,quote_id,customer_id,status,job_number,scheduled_start,
    origin_address,destination_address,crew_size,truck_count,dispatch_notes,
    internal_notes,created_by,service_type
  ) values (
    new.company_id,new.id,coalesce(new.customer_id,v_cust),
    'confirmed',v_number,null,
    coalesce(new.origin_address,v_origin),coalesce(new.destination_address,v_dest),
    coalesce(new.crew_size,2),1,
    'Accepted quote: scheduling and arrival time require staff confirmation',
    case when coalesce(new.service_date,v_lead_date) is not null
      then 'Preferred service date: '||coalesce(new.service_date,v_lead_date)::text end,
    new.created_by,new.service_type
  );
  update public.quotes set status='converted', updated_at=now() where id=new.id and status='accepted';
  return new;
end; $$;
revoke all on function public._auto_job_from_accepted_quote() from public,anon,authenticated,service_role;
drop trigger if exists zz_auto_job_on_quote_accepted on public.quotes;
create trigger zz_auto_job_on_quote_accepted
after update of status on public.quotes
for each row when (new.status = 'accepted' and old.status is distinct from new.status)
execute function public._auto_job_from_accepted_quote();

-- Staff can later give the automatically created job its actual schedule.
create or replace function public.schedule_confirmed_job(
 p_job_id uuid,p_scheduled_start timestamptz,p_origin_address text,
 p_destination_address text,p_scheduled_end timestamptz default null,
 p_crew_size integer default null,p_truck_count integer default null)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_job_converter(); j public.jobs%rowtype;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.company_id <> v_company then raise exception 'Job not found'; end if;
  if j.status::text not in ('confirmed','scheduled') then raise exception 'Job cannot be rescheduled in its current state'; end if;
  if p_scheduled_start is null then raise exception 'Scheduled start required'; end if;
  if nullif(btrim(coalesce(p_origin_address,'')),'') is null then raise exception 'Pickup address required'; end if;
  if j.service_type='moving' and nullif(btrim(coalesce(p_destination_address,'')),'') is null
    then raise exception 'Destination required for moving'; end if;
  if p_scheduled_end is not null and p_scheduled_end <= p_scheduled_start then raise exception 'End must follow start'; end if;
  if p_crew_size is not null and p_crew_size not between 1 and 20 then raise exception 'Crew size must be 1–20'; end if;
  if p_truck_count is not null and p_truck_count not between 0 and 20 then raise exception 'Truck count must be 0–20'; end if;
  update public.jobs set status='scheduled',
    scheduled_start=p_scheduled_start,scheduled_end=p_scheduled_end,
    origin_address=btrim(p_origin_address),
    destination_address=nullif(btrim(coalesce(p_destination_address,'')),''),
    crew_size=coalesce(p_crew_size,j.crew_size),truck_count=coalesce(p_truck_count,j.truck_count)
  where id=p_job_id;
  return json_build_object('job_id',p_job_id,'status','scheduled');
end; $$;
revoke all on function public.schedule_confirmed_job(uuid,timestamptz,text,text,timestamptz,integer,integer) from public,anon,service_role;
grant execute on function public.schedule_confirmed_job(uuid,timestamptz,text,text,timestamptz,integer,integer) to authenticated;

-- Existing scoped quote readers gain safe, customer-visible service details.
CREATE OR REPLACE FUNCTION public.get_quote_by_approval_token(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare t public.quote_approval_tokens; q record; v_items json; v_profile record;
begin
  t := public._require_quote_approval_token(p_token);
  select * into q from public.quotes where id = t.quote_id;
  if not found or q.status::text not in ('sent','viewed') then
    raise exception 'This quote link is invalid or unavailable';
  end if;
  if q.expires_at is not null and q.expires_at <= now() then
    update public.quotes set status = 'expired', updated_at = now() where id = q.id;
    raise exception 'This quote has expired';
  end if;

  update public.quote_approval_tokens set last_viewed_at = now() where id = t.id;
  if q.status::text = 'sent' then
    update public.quotes set status = 'viewed', updated_at = now() where id = q.id;
    q.status := 'viewed'::public.quote_status;
  end if;

  select coalesce(json_agg(json_build_object(
    'description', description, 'quantity', quantity, 'unit_price', unit_price,
    'total', total, 'sort_order', sort_order) order by sort_order), '[]'::json)
    into v_items from public.quote_line_items where quote_id = q.id;
  select first_name, last_name into v_profile
    from public.customers where id = q.customer_id;

  return json_build_object(
    'id', q.id, 'quote_number', q.quote_number, 'status', q.status::text,
    'created_at', q.created_at, 'expires_at', q.expires_at,
    'hourly_rate', q.hourly_rate, 'estimated_hours', q.estimated_hours, 'crew_size', q.crew_size,
    'travel_fee', q.travel_fee, 'packing_fee', q.packing_fee,
    'materials_fee', q.materials_fee, 'discount', q.discount,
    'subtotal', q.subtotal, 'tax_rate', q.tax_rate, 'tax', q.tax,
    'total', q.total, 'deposit_percent', q.deposit_percent,
    'deposit_amount', q.deposit_amount,
    'service_type', q.service_type, 'service_date', q.service_date,
    'origin_address', q.origin_address, 'destination_address', q.destination_address,
    'access_details', q.access_details, 'service_notes', q.service_notes,
    'customer', json_build_object('first_name', v_profile.first_name, 'last_name', v_profile.last_name),
    'line_items', v_items
  );
end;
$function$
;
-- Existing scoped quote readers gain safe, customer-visible service details.
CREATE OR REPLACE FUNCTION public.portal_get_quote(p_quote_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cust uuid := public._portal_current_customer_id();
  q record;
  v_items json;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;
  select id, quote_number, status, created_at, expires_at, accepted_at,
         hourly_rate, estimated_hours, crew_size, travel_fee, packing_fee, materials_fee,
         discount, subtotal, tax_rate, tax, total, deposit_percent, deposit_amount,
         service_type, service_date, origin_address, destination_address, access_details, service_notes
    into q
  from public.quotes
  where id = p_quote_id and customer_id = v_cust and status::text <> 'draft';
  if not found then raise exception 'Quote not found'; end if;
  select coalesce(json_agg(json_build_object(
           'description', li.description, 'quantity', li.quantity,
           'unit_price', li.unit_price, 'total', li.total, 'sort_order', li.sort_order)
           order by li.sort_order), '[]'::json)
    into v_items
  from public.quote_line_items li where li.quote_id = q.id;
  return json_build_object(
    'id', q.id, 'quote_number', q.quote_number, 'status', q.status::text,
    'created_at', q.created_at, 'expires_at', q.expires_at, 'accepted_at', q.accepted_at,
    'hourly_rate', q.hourly_rate, 'estimated_hours', q.estimated_hours, 'crew_size', q.crew_size,
    'travel_fee', q.travel_fee, 'packing_fee', q.packing_fee,
    'materials_fee', q.materials_fee, 'discount', q.discount,
    'subtotal', q.subtotal, 'tax_rate', q.tax_rate, 'tax', q.tax,
    'total', q.total, 'deposit_percent', q.deposit_percent,
    'deposit_amount', q.deposit_amount,
    'service_type', q.service_type, 'service_date', q.service_date,
    'origin_address', q.origin_address, 'destination_address', q.destination_address,
    'access_details', q.access_details, 'service_notes', q.service_notes, 'line_items', v_items
  );
end;
$function$
;

-- Copy service and PDF details when staff duplicates an existing quote.
create or replace function public.duplicate_quote_with_service(p_quote_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $
declare v_company uuid := public._require_quote_mutator(); v_src public.quotes%rowtype; v_result json;
begin
  select * into v_src from public.quotes where id=p_quote_id;
  if not found or v_src.company_id<>v_company then raise exception 'Quote not found'; end if;
  v_result := public.duplicate_quote(p_quote_id);
  perform public.set_draft_quote_details((v_result->>'quote_id')::uuid,
    jsonb_build_object('service_type',v_src.service_type,'service_date',v_src.service_date,
      'origin_address',v_src.origin_address,'destination_address',v_src.destination_address,
      'access_details',v_src.access_details,'service_notes',v_src.service_notes));
  return v_result;
end; $;
revoke all on function public.duplicate_quote_with_service(uuid) from public,anon,service_role;
grant execute on function public.duplicate_quote_with_service(uuid) to authenticated;

-- The separate job-status RPC must not start an unscheduled job.
create or replace function public._guard_unscheduled_job_progress()
returns trigger language plpgsql set search_path=public,pg_temp as $
begin
 if new.status::text in ('in_progress','completed')
    and (new.scheduled_start is null or nullif(btrim(coalesce(new.origin_address,'')),'') is null) then
   raise exception 'Schedule the job and confirm the pickup location before starting work';
 end if;
 return new;
end; $;
drop trigger if exists guard_unscheduled_job_progress on public.jobs;
create trigger guard_unscheduled_job_progress
before update of status on public.jobs
for each row execute function public._guard_unscheduled_job_progress();

-- Align the authoritative public-intake RPC whitelist with the Edge Function.
CREATE OR REPLACE FUNCTION public.create_public_lead(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_company constant uuid := 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';
  c_move_types constant text[] := array[
    'Residential Moving','Commercial Moving','Packing Services',
    'Specialty Items','Local Moving','Long-Distance','Junk Removal'];

  v_company     uuid;
  v_key_hash    text := btrim(coalesce(p_payload->>'key_hash',''));
  v_payload_hash text := btrim(coalesce(p_payload->>'payload_hash',''));
  v_existing_ph text;
  v_claimed     text;

  v_first   text := btrim(coalesce(p_payload->>'first_name',''));
  v_last    text := btrim(coalesce(p_payload->>'last_name',''));
  v_email   text := nullif(btrim(coalesce(p_payload->>'email','')), '');
  v_phone   text := nullif(btrim(coalesce(p_payload->>'phone','')), '');
  v_origin  text := nullif(btrim(coalesce(p_payload->>'origin_address','')), '');
  v_dest    text := nullif(btrim(coalesce(p_payload->>'destination_address','')), '');
  v_notes   text := nullif(btrim(coalesce(p_payload->>'notes','')), '');
  v_cnotes  text := nullif(btrim(coalesce(p_payload->>'customer_notes','')), '');
  v_mtype   text := nullif(btrim(coalesce(p_payload->>'move_type','')), '');
  v_mdate_t text := nullif(btrim(coalesce(p_payload->>'move_date','')), '');
  v_mdate   date;

  v_customer uuid;
  v_lead     uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  select id into v_company from public.companies where id = c_company;
  if v_company is null then raise exception 'intake_misconfigured'; end if;

  if v_key_hash !~ '^[0-9a-f]{64} then raise exception 'invalid_key_hash'; end if;
  if v_payload_hash !~ '^[0-9a-f]{64} then raise exception 'invalid_payload_hash'; end if;

  if v_first = '' or char_length(v_first) > 80 then raise exception 'invalid_first_name'; end if;
  if v_last  = '' or char_length(v_last)  > 80 then raise exception 'invalid_last_name'; end if;

  if v_email is not null then
    if char_length(v_email) > 160 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+ then
      raise exception 'invalid_email';
    end if;
  end if;

  if v_phone is not null then
    if char_length(v_phone) > 40
       or v_phone !~ '^[+0-9 ().-]+
       or char_length(regexp_replace(v_phone,'[^0-9]','','g')) not between 7 and 15 then
      raise exception 'invalid_phone';
    end if;
  end if;

  if v_email is null and v_phone is null then raise exception 'missing_contact'; end if;

  if v_origin is not null and char_length(v_origin) > 200 then raise exception 'invalid_origin'; end if;
  if v_dest   is not null and char_length(v_dest)   > 200 then raise exception 'invalid_destination'; end if;
  if v_notes  is not null and char_length(v_notes)  > 4000 then raise exception 'invalid_notes'; end if;
  if v_cnotes is not null and char_length(v_cnotes) > 2000 then raise exception 'invalid_customer_notes'; end if;

  if v_mtype is not null and not (v_mtype = any(c_move_types)) then
    raise exception 'invalid_move_type';
  end if;

  if v_mdate_t is not null then
    if v_mdate_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} then raise exception 'invalid_move_date'; end if;
    v_mdate := v_mdate_t::date;
    if v_mdate < current_date or v_mdate > (current_date + interval '2 years')::date then
      raise exception 'move_date_out_of_range';
    end if;
  end if;

  insert into public.public_intake_idempotency (key_hash, payload_hash)
  values (v_key_hash, v_payload_hash)
  on conflict (key_hash) do nothing
  returning key_hash into v_claimed;

  if v_claimed is null then
    select payload_hash into v_existing_ph
      from public.public_intake_idempotency where key_hash = v_key_hash;
    if v_existing_ph = v_payload_hash then
      return jsonb_build_object('status', 'duplicate');
    else
      raise exception 'idempotency_conflict';
    end if;
  end if;

  insert into public.customers (company_id, created_by, first_name, last_name, email, phone, notes)
  values (v_company, null, v_first, v_last, v_email, v_phone, v_cnotes)
  returning id into v_customer;

  insert into public.leads (
    company_id, created_by, customer_id, status, source, move_date,
    origin_address, destination_address, notes
  )
  values (
    v_company, null, v_customer, 'new'::public.lead_status, 'website',
    v_mdate, v_origin, v_dest, v_notes
  )
  returning id into v_lead;

  insert into public.activity_log (
    company_id, actor_id, actor_email, actor_role, action,
    entity_type, entity_id, summary, metadata
  )
  values (
    v_company, null, null, 'public', 'lead.public_intake',
    'lead', v_lead::text, 'Website estimate request received',
    jsonb_build_object(
      'source', 'website',
      'has_email', (v_email is not null),
      'has_phone', (v_phone is not null),
      'move_type', v_mtype,
      'utm_source',   left(nullif(btrim(coalesce(p_payload->>'utm_source','')),''),120),
      'utm_medium',   left(nullif(btrim(coalesce(p_payload->>'utm_medium','')),''),120),
      'utm_campaign', left(nullif(btrim(coalesce(p_payload->>'utm_campaign','')),''),120)
    )
  );

  return jsonb_build_object('status', 'created');
end;
$function$
;
commit;
