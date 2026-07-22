-- =====================================================================
-- 0009_create_lead_with_customer.sql
-- Southern Magnolia Movers — atomic lead+customer creation (removes the
-- two-client-write orphan risk in the New Lead flow).
--
-- One transaction: customer insert + lead insert. If the lead insert fails,
-- the customer insert rolls back (a plpgsql function body is atomic within the
-- calling statement). SECURITY DEFINER is REQUIRED so the single call can write
-- both rows after internal authorization; all checks are enforced inside.
--
-- Authorization (internal, never trusts client):
--   * requires auth.uid()
--   * caller must have a profile and be is_active = true
--   * caller must hold owner / operations_manager / sales for THEIR company
--     (intersection of leads-insert and customers-insert RLS; dispatcher is
--      excluded because customers RLS forbids dispatcher inserts)
--   * company_id is derived from the caller's profile (NOT a client argument)
--   * created_by is set to auth.uid() (NOT a client argument)
--   * lead status hardcoded to 'new'
--
-- Returns {customer_id, lead_id} as json. Does not weaken any RLS/grant.
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
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_company  uuid;
  v_active   boolean;
  v_customer uuid;
  v_lead     uuid;
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
    raise exception 'Insufficient privileges to create a customer and lead';
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
    company_id, created_by, customer_id, status, source, move_date,
    origin_address, destination_address, bedrooms, estimated_volume_cuft, notes
  )
  values (
    v_company, v_uid, v_customer, 'new'::public.lead_status,
    nullif(btrim(coalesce(p_source,'')),''),
    p_move_date,
    nullif(btrim(coalesce(p_origin_address,'')),''),
    nullif(btrim(coalesce(p_destination_address,'')),''),
    p_bedrooms, p_estimated_volume_cuft,
    nullif(btrim(coalesce(p_notes,'')),'')
  )
  returning id into v_lead;

  return json_build_object('customer_id', v_customer, 'lead_id', v_lead);
end;
$$;

revoke execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) from public;
revoke execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) from anon;
grant  execute on function public.create_lead_with_customer(
  text,text,text,text,text,date,text,text,integer,integer,text) to authenticated;

commit;
