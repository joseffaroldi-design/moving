-- Phase 19 — Payments V1
-- Lean Stripe-ready payment boundary for Southern Magnolia.
-- Browser clients never write payment tables directly; authenticated customers
-- prepare checkout through a SECURITY DEFINER RPC and service_role-only RPCs
-- attach/finalize provider sessions after verified webhook delivery.

alter table public.invoice_payments
  add column if not exists customer_deposit_id uuid references public.customer_deposits(id),
  add column if not exists provider text,
  add column if not exists external_payment_id text;

create unique index if not exists invoice_payments_customer_deposit_uq
  on public.invoice_payments(customer_deposit_id)
  where customer_deposit_id is not null;

create unique index if not exists invoice_payments_provider_external_uq
  on public.invoice_payments(provider, external_payment_id)
  where provider is not null and external_payment_id is not null;

create unique index if not exists customer_deposits_quote_uq
  on public.customer_deposits(quote_id)
  where quote_id is not null;

create table if not exists app_private.payment_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  customer_id uuid not null references public.customers(id),
  kind text not null check (kind in ('deposit','invoice')),
  quote_id uuid references public.quotes(id),
  deposit_id uuid references public.customer_deposits(id),
  invoice_id uuid references public.invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'usd' check (currency = lower(currency) and char_length(currency) = 3),
  provider text not null default 'stripe',
  external_session_id text,
  external_payment_intent_id text,
  status text not null default 'created' check (status in ('created','open','paid','cancelled','expired','failed')),
  expires_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_checkout_target_ck check (
    (kind = 'deposit' and deposit_id is not null and quote_id is not null and invoice_id is null)
    or
    (kind = 'invoice' and invoice_id is not null and deposit_id is null)
  )
);

create unique index if not exists payment_checkout_external_session_uq
  on app_private.payment_checkout_sessions(provider, external_session_id)
  where external_session_id is not null;

create index if not exists payment_checkout_company_idx
  on app_private.payment_checkout_sessions(company_id, created_at desc);
create index if not exists payment_checkout_invoice_idx
  on app_private.payment_checkout_sessions(invoice_id, created_at desc)
  where invoice_id is not null;
create index if not exists payment_checkout_deposit_idx
  on app_private.payment_checkout_sessions(deposit_id, created_at desc)
  where deposit_id is not null;

alter table app_private.payment_checkout_sessions enable row level security;
revoke all on table app_private.payment_checkout_sessions from public, anon, authenticated;
grant select, insert, update on table app_private.payment_checkout_sessions to service_role;

create or replace function public.portal_prepare_payment_checkout(
  p_kind text,
  p_target_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_customer uuid := public._portal_current_customer_id();
  v_company uuid;
  v_email text;
  v_kind text := lower(btrim(coalesce(p_kind,'')));
  v_amount numeric(12,2);
  v_description text;
  v_checkout uuid;
  v_deposit uuid;
  v_paid_at timestamptz;
  v_job uuid;
  v_quote_status text;
  v_invoice_status text;
begin
  if v_uid is null or v_customer is null then
    raise exception 'Not authorized as a customer';
  end if;
  if p_target_id is null then raise exception 'Payment target is required'; end if;
  if v_kind not in ('deposit','invoice') then raise exception 'Unsupported payment kind'; end if;

  select c.company_id, c.email into v_company, v_email
    from public.customers c where c.id = v_customer;
  if v_company is null then raise exception 'Customer company not found'; end if;

  if v_kind = 'invoice' then
    select i.status::text, round(i.balance,2), i.invoice_number
      into v_invoice_status, v_amount, v_description
      from public.invoices i
     where i.id = p_target_id
       and i.company_id = v_company
       and i.customer_id = v_customer
     for update;

    if v_invoice_status is null then raise exception 'Invoice not found'; end if;
    if v_invoice_status not in ('sent','partially_paid','overdue') then
      raise exception 'Invoice is not payable in its current status';
    end if;
    if coalesce(v_amount,0) <= 0 then raise exception 'Invoice has no balance due'; end if;
    v_description := 'Invoice ' || v_description;

    update app_private.payment_checkout_sessions
       set status = 'cancelled', updated_at = now()
     where customer_id = v_customer
       and invoice_id = p_target_id
       and status in ('created','open');

    insert into app_private.payment_checkout_sessions (
      company_id, customer_id, kind, invoice_id, amount, created_by
    ) values (
      v_company, v_customer, 'invoice', p_target_id, v_amount, v_uid
    ) returning id into v_checkout;

  else
    select q.status::text, round(q.deposit_amount,2), q.quote_number
      into v_quote_status, v_amount, v_description
      from public.quotes q
     where q.id = p_target_id
       and q.company_id = v_company
       and q.customer_id = v_customer
     for update;

    if v_quote_status is null then raise exception 'Quote not found'; end if;
    if v_quote_status not in ('accepted','converted') then
      raise exception 'Deposit is only payable after quote acceptance';
    end if;
    if coalesce(v_amount,0) <= 0 then raise exception 'No deposit is required for this quote'; end if;

    select j.id into v_job from public.jobs j where j.quote_id = p_target_id limit 1;

    insert into public.customer_deposits (
      company_id, customer_id, quote_id, job_id, amount
    ) values (
      v_company, v_customer, p_target_id, v_job, v_amount
    )
    on conflict (quote_id) where quote_id is not null
    do update set
      customer_id = excluded.customer_id,
      job_id = coalesce(public.customer_deposits.job_id, excluded.job_id),
      amount = excluded.amount,
      updated_at = now()
    returning id, paid_at into v_deposit, v_paid_at;

    if v_paid_at is not null then raise exception 'Deposit is already paid'; end if;
    v_description := 'Deposit for quote ' || v_description;

    update app_private.payment_checkout_sessions
       set status = 'cancelled', updated_at = now()
     where customer_id = v_customer
       and deposit_id = v_deposit
       and status in ('created','open');

    insert into app_private.payment_checkout_sessions (
      company_id, customer_id, kind, quote_id, deposit_id, amount, created_by
    ) values (
      v_company, v_customer, 'deposit', p_target_id, v_deposit, v_amount, v_uid
    ) returning id into v_checkout;
  end if;

  return jsonb_build_object(
    'checkout_id', v_checkout,
    'kind', v_kind,
    'target_id', p_target_id,
    'amount', v_amount,
    'amount_cents', round(v_amount * 100)::bigint,
    'currency', 'usd',
    'description', v_description,
    'customer_email', v_email
  );
end;
$$;

revoke all on function public.portal_prepare_payment_checkout(text,uuid) from public, anon;
grant execute on function public.portal_prepare_payment_checkout(text,uuid) to authenticated;

create or replace function public.payment_attach_stripe_session(
  p_checkout_id uuid,
  p_external_session_id text,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_row app_private.payment_checkout_sessions;
begin
  if p_checkout_id is null or btrim(coalesce(p_external_session_id,'')) = '' then
    raise exception 'Checkout id and Stripe session id are required';
  end if;

  update app_private.payment_checkout_sessions
     set external_session_id = p_external_session_id,
         status = 'open',
         expires_at = p_expires_at,
         updated_at = now()
   where id = p_checkout_id
     and provider = 'stripe'
     and status in ('created','open')
     and (external_session_id is null or external_session_id = p_external_session_id)
  returning * into v_row;

  if v_row.id is null then raise exception 'Checkout session cannot be attached'; end if;
  return jsonb_build_object('checkout_id',v_row.id,'status',v_row.status);
end;
$$;

revoke all on function public.payment_attach_stripe_session(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.payment_attach_stripe_session(uuid,text,timestamptz) to service_role;

create or replace function public.payment_finalize_stripe_checkout(
  p_external_session_id text,
  p_external_payment_intent_id text,
  p_amount_cents bigint,
  p_currency text,
  p_paid_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_row app_private.payment_checkout_sessions;
  v_expected bigint;
  v_invoice uuid;
  v_balance numeric;
  v_inserted uuid;
begin
  select * into v_row
    from app_private.payment_checkout_sessions
   where provider = 'stripe' and external_session_id = p_external_session_id
   for update;

  if v_row.id is null then raise exception 'Unknown Stripe checkout session'; end if;
  if v_row.status = 'paid' then
    return jsonb_build_object('checkout_id',v_row.id,'status','paid','idempotent',true);
  end if;
  if v_row.status not in ('created','open') then raise exception 'Checkout session is not payable'; end if;

  v_expected := round(v_row.amount * 100)::bigint;
  if p_amount_cents is null or p_amount_cents <> v_expected then
    raise exception 'Stripe amount does not match checkout amount';
  end if;
  if lower(coalesce(p_currency,'')) <> v_row.currency then
    raise exception 'Stripe currency does not match checkout currency';
  end if;
  if btrim(coalesce(p_external_payment_intent_id,'')) = '' then
    raise exception 'Stripe payment intent id is required';
  end if;

  update app_private.payment_checkout_sessions
     set external_payment_intent_id = p_external_payment_intent_id,
         status = 'paid',
         paid_at = coalesce(p_paid_at,now()),
         updated_at = now()
   where id = v_row.id;

  if v_row.kind = 'deposit' then
    update public.customer_deposits
       set paid_at = coalesce(paid_at, coalesce(p_paid_at,now())), updated_at = now()
     where id = v_row.deposit_id
       and company_id = v_row.company_id
       and customer_id = v_row.customer_id;

    select i.id into v_invoice
      from public.invoices i
     where i.company_id = v_row.company_id
       and i.customer_id = v_row.customer_id
       and (
         (v_row.quote_id is not null and i.quote_id = v_row.quote_id)
         or
         (v_row.invoice_id is not null and i.id = v_row.invoice_id)
       )
     limit 1;

    if v_invoice is not null then
      insert into public.invoice_payments (
        company_id, invoice_id, amount, method, paid_at, note, recorded_by,
        customer_deposit_id, provider, external_payment_id
      ) values (
        v_row.company_id, v_invoice, v_row.amount, 'deposit', coalesce(p_paid_at,now()),
        'Deposit credited from Stripe checkout', null,
        v_row.deposit_id, 'stripe', p_external_payment_intent_id
      )
      on conflict (customer_deposit_id) where customer_deposit_id is not null do nothing
      returning id into v_inserted;

      if v_inserted is not null then perform public._compute_invoice_totals(v_invoice); end if;
    end if;
  else
    select i.balance into v_balance
      from public.invoices i
     where i.id = v_row.invoice_id
       and i.company_id = v_row.company_id
       and i.customer_id = v_row.customer_id
     for update;
    if v_balance is null then raise exception 'Invoice not found for checkout'; end if;

    insert into public.invoice_payments (
      company_id, invoice_id, amount, method, paid_at, note, recorded_by,
      provider, external_payment_id
    ) values (
      v_row.company_id, v_row.invoice_id, v_row.amount, 'card', coalesce(p_paid_at,now()),
      'Stripe Checkout payment', null, 'stripe', p_external_payment_intent_id
    )
    on conflict (provider, external_payment_id)
      where provider is not null and external_payment_id is not null
    do nothing
    returning id into v_inserted;

    if v_inserted is not null then perform public._compute_invoice_totals(v_row.invoice_id); end if;
    v_invoice := v_row.invoice_id;
  end if;

  if v_invoice is not null then
    select balance into v_balance from public.invoices where id = v_invoice;
    update public.invoices
       set status = case
         when v_balance <= 0 then 'paid'::public.invoice_status
         when status::text in ('sent','partially_paid','overdue') then 'partially_paid'::public.invoice_status
         else status
       end,
       updated_at = now()
     where id = v_invoice;
  end if;

  return jsonb_build_object(
    'checkout_id',v_row.id,
    'kind',v_row.kind,
    'status','paid',
    'invoice_id',v_invoice,
    'idempotent',false
  );
end;
$$;

revoke all on function public.payment_finalize_stripe_checkout(text,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.payment_finalize_stripe_checkout(text,text,bigint,text,timestamptz) to service_role;

create or replace function app_private.credit_existing_deposit_on_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  insert into public.invoice_payments (
    company_id, invoice_id, amount, method, paid_at, note, recorded_by,
    customer_deposit_id, provider, external_payment_id
  )
  select
    new.company_id, new.id, d.amount, 'deposit', d.paid_at,
    'Paid deposit credited to final invoice', null,
    d.id, pcs.provider, pcs.external_payment_intent_id
  from public.customer_deposits d
  left join lateral (
    select s.provider, s.external_payment_intent_id
      from app_private.payment_checkout_sessions s
     where s.deposit_id = d.id and s.status = 'paid'
     order by s.paid_at desc nulls last
     limit 1
  ) pcs on true
  where d.company_id = new.company_id
    and d.customer_id is not distinct from new.customer_id
    and d.paid_at is not null
    and (
      (new.quote_id is not null and d.quote_id = new.quote_id)
      or
      (new.job_id is not null and d.job_id = new.job_id)
    )
  on conflict (customer_deposit_id) where customer_deposit_id is not null do nothing;
  return new;
end;
$$;

revoke all on function app_private.credit_existing_deposit_on_invoice_insert() from public, anon, authenticated;

drop trigger if exists credit_existing_deposit_on_invoice_insert on public.invoices;
create trigger credit_existing_deposit_on_invoice_insert
  after insert on public.invoices
  for each row execute function app_private.credit_existing_deposit_on_invoice_insert();

comment on table app_private.payment_checkout_sessions is
  'Internal payment checkout ledger. No browser access; prepared via portal RPC and finalized by verified provider webhooks.';
