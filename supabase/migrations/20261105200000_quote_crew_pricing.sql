-- New quotes price labor per worker: hourly rate x estimated hours x crew size.
-- Legacy quotes retain their stored totals and null crew_size; no backfill.
begin;
alter table public.quotes add column if not exists crew_size integer;
alter table public.quotes add constraint quotes_crew_size_positive check (crew_size between 1 and 20);
CREATE OR REPLACE FUNCTION public._compute_quote_totals(p_quote uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  v_labor := round(coalesce(q.hourly_rate,0) * coalesce(q.estimated_hours,0) * coalesce(q.crew_size,1), 2);

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
$function$
;
CREATE OR REPLACE FUNCTION public.duplicate_quote(p_quote_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    hourly_rate, estimated_hours, crew_size, travel_fee, packing_fee, materials_fee,
    discount, tax_rate, deposit_percent, expires_at
  ) values (
    v_company, s.lead_id, s.customer_id, 'draft', v_number, v_uid,
    s.hourly_rate, s.estimated_hours, s.crew_size, s.travel_fee, s.packing_fee, s.materials_fee,
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
$function$
;
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
    'customer', json_build_object('first_name', v_profile.first_name, 'last_name', v_profile.last_name),
    'line_items', v_items
  );
end;
$function$
;
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
         discount, subtotal, tax_rate, tax, total, deposit_percent, deposit_amount
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
    'deposit_amount', q.deposit_amount, 'line_items', v_items
  );
end;
$function$
;

create or replace function public.create_quote_with_crew(
 p_lead_id uuid, p_customer_id uuid, p_hourly_rate numeric, p_estimated_hours numeric,
 p_travel_fee numeric, p_packing_fee numeric, p_materials_fee numeric, p_discount numeric,
 p_tax_rate numeric, p_deposit_percent numeric, p_expires_at timestamptz,
 p_line_items jsonb, p_crew_size integer
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result json; v_id uuid;
begin
 if p_crew_size is null or p_crew_size not between 1 and 20 then raise exception 'Crew size must be between 1 and 20'; end if;
 v_result := public.create_quote_with_items(p_lead_id,p_customer_id,p_hourly_rate,p_estimated_hours,
   p_travel_fee,p_packing_fee,p_materials_fee,p_discount,p_tax_rate,p_deposit_percent,p_expires_at,p_line_items);
 v_id := (v_result->>'quote_id')::uuid;
 update public.quotes set crew_size=p_crew_size where id=v_id;
 perform public._compute_quote_totals(v_id);
 return v_result;
end; $$;

create or replace function public.update_draft_quote_with_crew(
 p_quote_id uuid, p_hourly_rate numeric, p_estimated_hours numeric,
 p_travel_fee numeric, p_packing_fee numeric, p_materials_fee numeric, p_discount numeric,
 p_tax_rate numeric, p_deposit_percent numeric, p_expires_at timestamptz,
 p_line_items jsonb, p_crew_size integer
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result json;
begin
 if p_crew_size is null or p_crew_size not between 1 and 20 then raise exception 'Crew size must be between 1 and 20'; end if;
 v_result := public.update_draft_quote_with_items(p_quote_id,p_hourly_rate,p_estimated_hours,
   p_travel_fee,p_packing_fee,p_materials_fee,p_discount,p_tax_rate,p_deposit_percent,p_expires_at,p_line_items);
 update public.quotes set crew_size=p_crew_size where id=p_quote_id;
 perform public._compute_quote_totals(p_quote_id);
 return v_result;
end; $$;

revoke all on function public.create_quote_with_crew(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer) from public,anon,service_role;
grant execute on function public.create_quote_with_crew(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer) to authenticated;
revoke all on function public.update_draft_quote_with_crew(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer) from public,anon,service_role;
grant execute on function public.update_draft_quote_with_crew(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,integer) to authenticated;
commit;