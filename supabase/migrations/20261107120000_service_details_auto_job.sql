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
        'service_type',case when coalesce(v_lead.notes,'') ~* '^Service type: Junk Removal$'
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

commit;
