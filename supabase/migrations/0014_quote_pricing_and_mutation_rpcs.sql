-- =====================================================================
-- 0014_quote_pricing_and_mutation_rpcs.sql  (CORRECTED)
-- Southern Magnolia Movers — Phase 4 (Quotes) pricing + atomic mutations.
--
-- Adds 3 additive columns + CHECK constraints, one authoritative server-side
-- pricing engine, and the RPC-only mutation surface. authenticated has NO
-- direct write grant (0011) — every mutation flows through SECURITY DEFINER
-- RPCs that derive company_id + actor server-side, enforce roles, verify
-- cross-company ownership, and compute all money server-side.
--
-- Security model (exactly 8 SECURITY DEFINER functions):
--   DEFINER (privileged): _require_quote_mutator, _compute_quote_totals,
--     create_quote_with_items, update_draft_quote_with_items, duplicate_quote,
--     mark_quote_sent, expire_quote, cancel_quote
--   INVOKER (pure validators, no table access): _assert_quote_scalars,
--     _assert_quote_line_items
--   All 10: EXECUTE revoked from PUBLIC + anon. authenticated may EXECUTE only
--   the 6 client RPCs; both helpers AND both validators are client-unavailable.
--
-- EXISTING DATA: the 2 legacy quotes are NOT recomputed. New columns default 0
-- (satisfy the CHECKs); historical subtotal/tax/total/status left as-is.
--
-- AUTHORITATIVE PRICING (percent inputs 0..100, divided by 100):
--   labor        = round(coalesce(hourly_rate,0)*coalesce(estimated_hours,0),2)
--   line_items   = round(sum(quantity*unit_price),2)
--   gross        = round(labor+line_items+travel+packing+materials,2)
--   discounted   = round(greatest(gross-discount,0),2)   (discount<=gross enforced)
--   tax          = round(discounted*tax_rate/100,2)
--   total        = round(greatest(discounted+tax,0),2)
--   deposit_amt  = round(total*deposit_percent/100,2)
--   (stored: subtotal=gross, plus tax/total/deposit_amount)
--
-- Roles for all mutations: owner, operations_manager, sales (dispatcher is
-- read-only in Phase 4). Approve/Decline/Viewed = token path (0015); Convert =
-- Phase-5 handoff (0016).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ADDITIVE COLUMNS + CHECK CONSTRAINTS (defaults; existing rows valid)
-- ---------------------------------------------------------------------
alter table public.quotes add column if not exists tax_rate        numeric not null default 0;
alter table public.quotes add column if not exists deposit_percent numeric not null default 0;
alter table public.quotes add column if not exists deposit_amount  numeric not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'quotes_tax_rate_range' and conrelid = 'public.quotes'::regclass) then
    alter table public.quotes
      add constraint quotes_tax_rate_range check (tax_rate >= 0 and tax_rate <= 100);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'quotes_deposit_percent_range' and conrelid = 'public.quotes'::regclass) then
    alter table public.quotes
      add constraint quotes_deposit_percent_range check (deposit_percent >= 0 and deposit_percent <= 100);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'quotes_deposit_amount_nonneg' and conrelid = 'public.quotes'::regclass) then
    alter table public.quotes
      add constraint quotes_deposit_amount_nonneg check (deposit_amount >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2a. VALIDATORS — SECURITY INVOKER, no table access
-- ---------------------------------------------------------------------
create or replace function public._assert_quote_scalars(
  p_hourly_rate numeric, p_estimated_hours numeric,
  p_travel_fee numeric, p_packing_fee numeric, p_materials_fee numeric,
  p_discount numeric, p_tax_rate numeric, p_deposit_percent numeric)
returns void
language plpgsql
security invoker
immutable
set search_path = public, pg_temp
as $$
begin
  if coalesce(p_hourly_rate,0)     < 0 then raise exception 'hourly_rate cannot be negative'; end if;
  if coalesce(p_estimated_hours,0) < 0 then raise exception 'estimated_hours cannot be negative'; end if;
  if coalesce(p_travel_fee,0)      < 0 then raise exception 'travel_fee cannot be negative'; end if;
  if coalesce(p_packing_fee,0)     < 0 then raise exception 'packing_fee cannot be negative'; end if;
  if coalesce(p_materials_fee,0)   < 0 then raise exception 'materials_fee cannot be negative'; end if;
  if coalesce(p_discount,0)        < 0 then raise exception 'discount cannot be negative'; end if;
  if coalesce(p_tax_rate,0) < 0 or coalesce(p_tax_rate,0) > 100 then
    raise exception 'tax_rate must be between 0 and 100'; end if;
  if coalesce(p_deposit_percent,0) < 0 or coalesce(p_deposit_percent,0) > 100 then
    raise exception 'deposit_percent must be between 0 and 100'; end if;
end;
$$;

create or replace function public._assert_quote_line_items(p_line_items jsonb)
returns void
language plpgsql
security invoker
immutable
set search_path = public, pg_temp
as $$
declare
  elem   jsonb;
  v_desc text;
  v_qty  numeric;
  v_prc  numeric;
begin
  if p_line_items is null then
    return;
  end if;
  if jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'line_items must be a JSON array';
  end if;

  for elem in select value from jsonb_array_elements(p_line_items) loop
    if jsonb_typeof(elem) <> 'object' then
      raise exception 'Each line item must be a JSON object';
    end if;

    v_desc := btrim(coalesce(elem->>'description',''));
    if v_desc = '' then
      raise exception 'Each line item needs a non-empty description';
    end if;

    begin
      v_qty := coalesce((elem->>'quantity')::numeric, 1);
    exception when others then
      raise exception 'Line item "%" has a non-numeric quantity: %', v_desc, elem->>'quantity';
    end;

    begin
      v_prc := coalesce((elem->>'unit_price')::numeric, 0);
    exception when others then
      raise exception 'Line item "%" has a non-numeric unit_price: %', v_desc, elem->>'unit_price';
    end;

    if v_qty < 0 then
      raise exception 'Line item "%" quantity cannot be negative', v_desc;
    end if;
    if v_prc < 0 then
      raise exception 'Line item "%" unit_price cannot be negative', v_desc;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2b. PRIVILEGED HELPERS — SECURITY DEFINER
-- ---------------------------------------------------------------------
create or replace function public._require_quote_mutator()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_active  boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, is_active into v_company, v_active
    from public.profiles where id = v_uid;
  if v_company is null then raise exception 'No company associated with your account'; end if;
  if v_active is not true then raise exception 'Caller account is not active'; end if;
  if not public.has_company_role(
       v_company, array['owner','operations_manager','sales']::public.user_role[]) then
    raise exception 'Insufficient privileges for quote operations';
  end if;
  return v_company;
end;
$$;

create or replace function public._compute_quote_totals(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q       record;
  v_labor numeric;
  v_items numeric;
  v_gross numeric;
  v_disc  numeric;
  v_tax   numeric;
  v_total numeric;
  v_dep   numeric;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'Quote not found'; end if;

  v_labor := round(coalesce(q.hourly_rate,0) * coalesce(q.estimated_hours,0), 2);

  select round(coalesce(sum(li.quantity * li.unit_price), 0), 2)
    into v_items
  from public.quote_line_items li
  where li.quote_id = p_quote;

  v_gross := round(v_labor + v_items
                   + coalesce(q.travel_fee,0)
                   + coalesce(q.packing_fee,0)
                   + coalesce(q.materials_fee,0), 2);

  if coalesce(q.discount,0) > v_gross then
    raise exception 'discount (%) cannot exceed subtotal (%)', q.discount, v_gross;
  end if;

  v_disc  := round(greatest(v_gross - coalesce(q.discount,0), 0), 2);
  v_tax   := round(v_disc * coalesce(q.tax_rate,0) / 100, 2);
  v_total := round(greatest(v_disc + v_tax, 0), 2);
  v_dep   := round(v_total * coalesce(q.deposit_percent,0) / 100, 2);

  update public.quotes
     set subtotal = v_gross, tax = v_tax, total = v_total,
         deposit_amount = v_dep, updated_at = now()
   where id = p_quote;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. MUTATION RPCs — SECURITY DEFINER
-- ---------------------------------------------------------------------
create or replace function public.create_quote_with_items(
  p_lead_id         uuid        default null,
  p_customer_id     uuid        default null,
  p_hourly_rate     numeric     default null,
  p_estimated_hours numeric     default null,
  p_travel_fee      numeric     default 0,
  p_packing_fee     numeric     default 0,
  p_materials_fee   numeric     default 0,
  p_discount        numeric     default 0,
  p_tax_rate        numeric     default 0,
  p_deposit_percent numeric     default 0,
  p_expires_at      timestamptz default null,
  p_line_items      jsonb       default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := auth.uid();
  v_company       uuid := public._require_quote_mutator();
  v_customer      uuid := p_customer_id;
  v_lead_company  uuid;
  v_lead_customer uuid;
  v_cust_company  uuid;
  v_number        text;
  v_quote         uuid;
begin
  perform public._assert_quote_scalars(
    p_hourly_rate, p_estimated_hours, p_travel_fee, p_packing_fee,
    p_materials_fee, p_discount, p_tax_rate, p_deposit_percent);
  perform public._assert_quote_line_items(p_line_items);

  if p_lead_id is not null then
    select company_id, customer_id into v_lead_company, v_lead_customer
      from public.leads where id = p_lead_id;
    if v_lead_company is null then raise exception 'Lead not found'; end if;
    if v_lead_company <> v_company then raise exception 'Lead does not belong to your company'; end if;
    -- Reject a customer that contradicts the lead's existing customer.
    if v_lead_customer is not null and p_customer_id is not null
       and p_customer_id <> v_lead_customer then
      raise exception 'Provided customer does not match the lead''s customer';
    end if;
    if v_customer is null then v_customer := v_lead_customer; end if;
  end if;

  if v_customer is not null then
    select company_id into v_cust_company from public.customers where id = v_customer;
    if v_cust_company is null then raise exception 'Customer not found'; end if;
    if v_cust_company <> v_company then raise exception 'Customer does not belong to your company'; end if;
  end if;

  if v_customer is null and p_lead_id is null then
    raise exception 'A lead or customer is required to create a quote';
  end if;

  v_number := public.next_quote_number(v_company);

  insert into public.quotes (
    company_id, lead_id, customer_id, status, quote_number, created_by,
    hourly_rate, estimated_hours, travel_fee, packing_fee, materials_fee,
    discount, tax_rate, deposit_percent, expires_at
  ) values (
    v_company, p_lead_id, v_customer, 'draft', v_number, v_uid,
    p_hourly_rate, p_estimated_hours,
    coalesce(p_travel_fee,0), coalesce(p_packing_fee,0), coalesce(p_materials_fee,0),
    coalesce(p_discount,0), coalesce(p_tax_rate,0), coalesce(p_deposit_percent,0),
    p_expires_at
  )
  returning id into v_quote;

  insert into public.quote_line_items (quote_id, description, quantity, unit_price, total, sort_order)
  select v_quote,
         btrim(li->>'description'),
         coalesce((li->>'quantity')::numeric, 1),
         coalesce((li->>'unit_price')::numeric, 0),
         round(coalesce((li->>'quantity')::numeric,1) * coalesce((li->>'unit_price')::numeric,0), 2),
         coalesce((li->>'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as t(li, ord);

  perform public._compute_quote_totals(v_quote);

  return json_build_object('quote_id', v_quote, 'quote_number', v_number);
end;
$$;

create or replace function public.update_draft_quote_with_items(
  p_quote_id        uuid,
  p_hourly_rate     numeric     default null,
  p_estimated_hours numeric     default null,
  p_travel_fee      numeric     default 0,
  p_packing_fee     numeric     default 0,
  p_materials_fee   numeric     default 0,
  p_discount        numeric     default 0,
  p_tax_rate        numeric     default 0,
  p_deposit_percent numeric     default 0,
  p_expires_at      timestamptz default null,
  p_line_items      jsonb       default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._require_quote_mutator();
  v_qc      uuid;
  v_status  text;
begin
  perform public._assert_quote_scalars(
    p_hourly_rate, p_estimated_hours, p_travel_fee, p_packing_fee,
    p_materials_fee, p_discount, p_tax_rate, p_deposit_percent);
  perform public._assert_quote_line_items(p_line_items);

  select company_id, status::text into v_qc, v_status
    from public.quotes where id = p_quote_id;
  if v_qc is null then raise exception 'Quote not found'; end if;
  if v_qc <> v_company then raise exception 'Quote does not belong to your company'; end if;
  if v_status <> 'draft' then
    raise exception 'Only draft quotes can be edited (current status: %)', v_status;
  end if;

  update public.quotes
     set hourly_rate     = p_hourly_rate,
         estimated_hours = p_estimated_hours,
         travel_fee      = coalesce(p_travel_fee,0),
         packing_fee     = coalesce(p_packing_fee,0),
         materials_fee   = coalesce(p_materials_fee,0),
         discount        = coalesce(p_discount,0),
         tax_rate        = coalesce(p_tax_rate,0),
         deposit_percent = coalesce(p_deposit_percent,0),
         expires_at      = p_expires_at,
         updated_at      = now()
   where id = p_quote_id;

  delete from public.quote_line_items where quote_id = p_quote_id;

  insert into public.quote_line_items (quote_id, description, quantity, unit_price, total, sort_order)
  select p_quote_id,
         btrim(li->>'description'),
         coalesce((li->>'quantity')::numeric, 1),
         coalesce((li->>'unit_price')::numeric, 0),
         round(coalesce((li->>'quantity')::numeric,1) * coalesce((li->>'unit_price')::numeric,0), 2),
         coalesce((li->>'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as t(li, ord);

  perform public._compute_quote_totals(p_quote_id);

  return json_build_object('quote_id', p_quote_id);
end;
$$;

create or replace function public.duplicate_quote(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid := public._require_quote_mutator();
  s         record;
  v_number  text;
  v_new     uuid;
begin
  select * into s from public.quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found'; end if;
  if s.company_id <> v_company then raise exception 'Quote does not belong to your company'; end if;

  v_number := public.next_quote_number(v_company);

  insert into public.quotes (
    company_id, lead_id, customer_id, status, quote_number, created_by,
    hourly_rate, estimated_hours, travel_fee, packing_fee, materials_fee,
    discount, tax_rate, deposit_percent, expires_at
  ) values (
    v_company, s.lead_id, s.customer_id, 'draft', v_number, v_uid,
    s.hourly_rate, s.estimated_hours, s.travel_fee, s.packing_fee, s.materials_fee,
    s.discount, s.tax_rate, s.deposit_percent, null
  )
  returning id into v_new;

  insert into public.quote_line_items (quote_id, pricing_rule_id, description, quantity, unit_price, total, sort_order)
  select v_new, li.pricing_rule_id, li.description, li.quantity, li.unit_price, li.total, li.sort_order
  from public.quote_line_items li
  where li.quote_id = p_quote_id;

  perform public._compute_quote_totals(v_new);

  return json_build_object('quote_id', v_new, 'quote_number', v_number);
end;
$$;

create or replace function public.mark_quote_sent(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid := public._require_quote_mutator(); v_qc uuid; v_status text;
begin
  select company_id, status::text into v_qc, v_status from public.quotes where id = p_quote_id;
  if v_qc is null then raise exception 'Quote not found'; end if;
  if v_qc <> v_company then raise exception 'Quote does not belong to your company'; end if;
  if v_status = 'draft' then
    update public.quotes set status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() where id = p_quote_id;
  elsif v_status in ('sent','viewed') then null;
  else raise exception 'Cannot send a quote in status %', v_status; end if;
  return json_build_object('quote_id', p_quote_id, 'status',
    (select status::text from public.quotes where id = p_quote_id));
end;
$$;

create or replace function public.expire_quote(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid := public._require_quote_mutator(); v_qc uuid; v_status text;
begin
  select company_id, status::text into v_qc, v_status from public.quotes where id = p_quote_id;
  if v_qc is null then raise exception 'Quote not found'; end if;
  if v_qc <> v_company then raise exception 'Quote does not belong to your company'; end if;
  if v_status = 'expired' then null;
  elsif v_status in ('draft','sent','viewed') then
    update public.quotes set status = 'expired', updated_at = now() where id = p_quote_id;
  else raise exception 'Cannot expire a quote in status %', v_status; end if;
  return json_build_object('quote_id', p_quote_id, 'status', 'expired');
end;
$$;

create or replace function public.cancel_quote(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid := public._require_quote_mutator(); v_qc uuid; v_status text;
begin
  select company_id, status::text into v_qc, v_status from public.quotes where id = p_quote_id;
  if v_qc is null then raise exception 'Quote not found'; end if;
  if v_qc <> v_company then raise exception 'Quote does not belong to your company'; end if;
  if v_status = 'cancelled' then null;
  elsif v_status = 'converted' then raise exception 'Cannot cancel a converted quote';
  else update public.quotes set status = 'cancelled', updated_at = now() where id = p_quote_id; end if;
  return json_build_object('quote_id', p_quote_id, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- 4. EXECUTE GRANTS — clients get the 6 client RPCs only.
--    PUBLIC + anon: nothing. Helpers + validators: internal only.
-- ---------------------------------------------------------------------
revoke execute on function public._assert_quote_scalars(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke execute on function public._assert_quote_line_items(jsonb)                                       from public, anon, authenticated;
revoke execute on function public._require_quote_mutator()                                              from public, anon, authenticated;
revoke execute on function public._compute_quote_totals(uuid)                                           from public, anon, authenticated;

revoke execute on function public.create_quote_with_items(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb) from public, anon;
revoke execute on function public.update_draft_quote_with_items(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb) from public, anon;
revoke execute on function public.duplicate_quote(uuid)   from public, anon;
revoke execute on function public.mark_quote_sent(uuid)   from public, anon;
revoke execute on function public.expire_quote(uuid)      from public, anon;
revoke execute on function public.cancel_quote(uuid)      from public, anon;

grant execute on function public.create_quote_with_items(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb) to authenticated;
grant execute on function public.update_draft_quote_with_items(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb) to authenticated;
grant execute on function public.duplicate_quote(uuid)   to authenticated;
grant execute on function public.mark_quote_sent(uuid)   to authenticated;
grant execute on function public.expire_quote(uuid)      to authenticated;
grant execute on function public.cancel_quote(uuid)      to authenticated;

commit;
