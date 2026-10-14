create or replace function public.portal_get_deposit_state(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_customer uuid := public._portal_current_customer_id();
  v_company uuid;
  v_amount numeric;
  v_paid_at timestamptz;
begin
  if v_customer is null then raise exception 'Not authorized as a customer'; end if;
  select c.company_id into v_company from public.customers c where c.id=v_customer;

  select q.deposit_amount,
         (select d.paid_at from public.customer_deposits d
           where d.quote_id=q.id and d.company_id=q.company_id and d.customer_id=v_customer
           limit 1)
    into v_amount,v_paid_at
    from public.quotes q
   where q.id=p_quote_id and q.company_id=v_company and q.customer_id=v_customer;

  if not found then raise exception 'Quote not found'; end if;
  return jsonb_build_object(
    'required',coalesce(v_amount,0)>0,
    'amount',coalesce(v_amount,0),
    'paid_at',v_paid_at,
    'paid',v_paid_at is not null
  );
end;
$$;

revoke all on function public.portal_get_deposit_state(uuid) from public,anon;
grant execute on function public.portal_get_deposit_state(uuid) to authenticated;
