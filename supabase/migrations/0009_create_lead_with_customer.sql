-- =====================================================================
-- 0009_create_lead_with_customer.sql   (DRAFT — do NOT run yet)
-- Atomic lead+customer creation to remove the two-client-write orphan risk.
--
-- The frontend currently inserts a customer then a lead as two separate calls;
-- if the lead insert fails, an orphan customer remains. This RPC performs both
-- inserts in ONE transaction (any error rolls back both). SECURITY DEFINER with
-- pinned search_path; all authorization enforced internally (never trusts the
-- client). Only owner/operations_manager/sales may create a customer+lead.
--
-- After this is applied, the frontend New Lead flow switches to a single
-- supabase.rpc('create_lead_with_customer', {...}) call.
-- =====================================================================

begin;

create or replace function public.create_lead_with_customer(
  p_first_name            text,
  p_last_name             text,
  p_email                 text default null,
  p_phone                 text default null,
  p_source                text default null,
  p_move_date             date default null,
  p_origin_address        text default null,
  p_destination_address   text default null,
  p_bedrooms              integer default null,
  p_estimated_volume_cuft integer default null,
  p_notes                 text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_company   uuid;
  v_active    boolean;
  v_customer  uuid;
  v_lead      uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select company_id, is_active into v_company, v_active
    from public.profiles where id = v_uid;
  if v_company is null then
    raise exception 'No company associated with your account';
  end if;
  if v_active is not true then
    raise exception 'Caller account is not active';
  end if;
  if not public.has_company_role(
       v_company,
       array['owner','operations_manager','sales']::public.user_role[]) then
    raise exception 'Insufficient privileges to create a customer';
  end if;
  if btrim(coalesce(p_first_name,'')) = '' or btrim(coalesce(p_last_name,'')) = '' then
    raise exception 'First and last name are required';
  end if;

  insert into public.customers (company_id, created_by, first_name, last_name, email, phone)
  values (
    v_company, v_uid, btrim(p_first_name), btrim(p_last_name),
    nullif(btrim(coalesce(p_email,'')),''),
    nullif(btrim(coalesce(p_phone,'')),'')
  )
  returning id into v_customer;

  insert into public.leads (
    company_id, created_by, customer_id, source, move_date,
    origin_address, destination_address, bedrooms, estimated_volume_cuft, notes
  )
  values (
    v_company, v_uid, v_customer,
    nullif(btrim(coalesce(p_source,'')),''),
    p_move_date,
    nullif(btrim(coalesce(p_origin_address,'')),''),
    nullif(btrim(coalesce(p_destination_address,'')),''),
    p_bedrooms, p_estimated_volume_cuft,
    nullif(btrim(coalesce(p_notes,'')),'')
  )
  returning id into v_lead;

  return v_lead;  -- both inserts committed together; any failure rolls back both
end;
$$;

revoke execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) from public;
revoke execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) from anon;
grant  execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) to authenticated;

commit;
