-- =====================================================================
-- 0018_invoices.sql
-- Southern Magnolia Movers — Phase 8: Invoices & Payments.
--
-- Model mirrors quotes/jobs (0011/0013/0014/0016/0017):
--   * 3 new tables: invoices, invoice_line_items, invoice_payments.
--   * authenticated = SELECT ONLY (staff-scoped, FORCE RLS). Every write
--     flows through SECURITY DEFINER RPCs that derive company + actor
--     server-side, enforce roles, verify cross-company ownership, and
--     compute all money server-side.
--   * Per-company sequential number 'INV-0001' (advisory-lock, gap-tolerant).
--   * ONE invoice per job (partial unique index).
--
-- Lifecycle: invoice_status = draft | sent | partially_paid | paid | void
--   draft -> sent | void
--   sent  -> partially_paid (payment) | paid (payment) | void
--   partially_paid -> paid (payment) | void
--   paid / void -> terminal
--
-- Auto-draft on job completion: set_job_status is REPLACED to also create a
-- draft invoice when a job transitions to 'completed' (idempotent, wrapped so
-- an invoice hiccup never blocks the status change). A manual client RPC
-- generate_invoice_for_job(...) covers the explicit "Generate invoice" button.
--
-- Amounts: everything is a line item. When a linked quote exists, the draft is
-- seeded from the quote (labor, travel/packing/materials fees, each quote line
-- item, and discount as a negative line) with tax_rate copied from the quote,
-- so the invoice total mirrors the quote total while staying fully editable.
--
-- Roles:  SELECT   -> owner, operations_manager, dispatcher, sales
--         mutate   -> owner, operations_manager, sales  (billing)
--
-- Transactional; additive; postgres/service_role untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. ENUM
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum
      ('draft','sent','partially_paid','paid','void');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  job_id         uuid references public.jobs(id)               on delete set null,
  quote_id       uuid references public.quotes(id)             on delete set null,
  customer_id    uuid references public.customers(id)          on delete set null,
  invoice_number text not null,
  status         public.invoice_status not null default 'draft',
  subtotal       numeric not null default 0,
  tax_rate       numeric not null default 0,
  tax            numeric not null default 0,
  total          numeric not null default 0,
  amount_paid    numeric not null default 0,
  balance        numeric not null default 0,
  notes          text,
  due_date       date,
  sent_at        timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint invoices_company_number_unique unique (company_id, invoice_number),
  constraint invoices_tax_rate_range check (tax_rate >= 0 and tax_rate <= 100)
);
create index if not exists invoices_company_idx  on public.invoices (company_id);
create index if not exists invoices_job_idx       on public.invoices (job_id);
create index if not exists invoices_customer_idx  on public.invoices (customer_id);
-- One invoice per job.
create unique index if not exists invoices_job_id_unique
  on public.invoices (job_id) where job_id is not null;

create table if not exists public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity    numeric not null default 1,
  unit_price  numeric not null default 0,
  total       numeric not null default 0,
  sort_order  int not null default 0,
  constraint invoice_line_items_desc_not_empty check (btrim(description) <> '')
);
create index if not exists invoice_line_items_invoice_idx
  on public.invoice_line_items (invoice_id, sort_order);

create table if not exists public.invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id)  on delete cascade,
  amount      numeric not null check (amount > 0),
  method      text not null default 'other',
  paid_at     timestamptz not null default now(),
  note        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, paid_at desc);

-- ---------------------------------------------------------------------
-- 2. GRANT LOCKDOWN — authenticated SELECT only; anon/PUBLIC nothing.
-- ---------------------------------------------------------------------
revoke all on table public.invoices           from anon, public;
revoke all on table public.invoice_line_items from anon, public;
revoke all on table public.invoice_payments   from anon, public;
revoke all on table public.invoices           from authenticated;
revoke all on table public.invoice_line_items from authenticated;
revoke all on table public.invoice_payments   from authenticated;
grant select on table public.invoices           to authenticated;
grant select on table public.invoice_line_items to authenticated;
grant select on table public.invoice_payments   to authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS — enable + force + staff SELECT policies
-- ---------------------------------------------------------------------
alter table public.invoices           enable row level security;
alter table public.invoices           force  row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_line_items force  row level security;
alter table public.invoice_payments   enable row level security;
alter table public.invoice_payments   force  row level security;

drop policy if exists invoices_staff_select on public.invoices;
create policy invoices_staff_select on public.invoices
  for select to authenticated
  using (public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]));

drop policy if exists invoice_line_items_staff_select on public.invoice_line_items;
create policy invoice_line_items_staff_select on public.invoice_line_items
  for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_line_items.invoice_id
      and public.has_company_role(
        i.company_id,
        array['owner','operations_manager','dispatcher','sales']::public.user_role[])));

drop policy if exists invoice_payments_staff_select on public.invoice_payments;
create policy invoice_payments_staff_select on public.invoice_payments
  for select to authenticated
  using (public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]));

-- ---------------------------------------------------------------------
-- 4. NUMBERING — 'INV-0001', per-company advisory lock (RPC-only)
-- ---------------------------------------------------------------------
create or replace function public.next_invoice_number(p_company uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_seq bigint;
begin
  if p_company is null then raise exception 'company is required for invoice numbering'; end if;
  perform pg_advisory_xact_lock(hashtext('invoice_number:' || p_company::text));
  select coalesce(max((substring(i.invoice_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_seq
  from public.invoices i
  where i.company_id = p_company and i.invoice_number ~ '^INV-[0-9]+$';
  return 'INV-' || lpad(v_seq::text, 4, '0');
end;
$$;
revoke execute on function public.next_invoice_number(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. AUTHZ GUARD (billing mutators)
-- ---------------------------------------------------------------------
create or replace function public._require_invoice_mutator()
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_company uuid; v_active boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, is_active into v_company, v_active from public.profiles where id = v_uid;
  if v_company is null then raise exception 'No company associated with your account'; end if;
  if v_active is not true then raise exception 'Caller account is not active'; end if;
  if not public.has_company_role(
       v_company, array['owner','operations_manager','sales']::public.user_role[]) then
    raise exception 'Insufficient privileges for invoice operations';
  end if;
  return v_company;
end;
$$;
revoke execute on function public._require_invoice_mutator() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. TOTALS RECOMPUTE (money only; never changes status)
-- ---------------------------------------------------------------------
create or replace function public._compute_invoice_totals(p_invoice uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_sub numeric; v_tax numeric; v_total numeric; v_paid numeric; v_rate numeric;
begin
  select coalesce(tax_rate,0) into v_rate from public.invoices where id = p_invoice;
  select round(coalesce(sum(quantity * unit_price), 0), 2) into v_sub
    from public.invoice_line_items where invoice_id = p_invoice;
  v_tax   := round(v_sub * coalesce(v_rate,0) / 100, 2);
  v_total := round(greatest(v_sub + v_tax, 0), 2);
  select round(coalesce(sum(amount), 0), 2) into v_paid
    from public.invoice_payments where invoice_id = p_invoice;
  update public.invoices
     set subtotal = v_sub, tax = v_tax, total = v_total,
         amount_paid = v_paid, balance = round(v_total - v_paid, 2),
         updated_at = now()
   where id = p_invoice;
end;
$$;
revoke execute on function public._compute_invoice_totals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. INTERNAL DRAFT CREATOR (seed from linked quote when present)
--    Idempotent: returns existing invoice id for the job if one exists.
-- ---------------------------------------------------------------------
create or replace function public._create_draft_invoice_for_job(p_company uuid, p_job uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  j        record;
  q        record;
  v_number text;
  v_inv    uuid;
  v_labor  numeric;
  v_pos    int := 0;
begin
  select id, company_id, quote_id, customer_id, status::text as status
    into j from public.jobs where id = p_job;
  if j.id is null then raise exception 'Job not found'; end if;
  if j.company_id <> p_company then raise exception 'Job does not belong to your company'; end if;

  -- Idempotent: one invoice per job.
  select id into v_inv from public.invoices where job_id = p_job limit 1;
  if v_inv is not null then return v_inv; end if;

  v_number := public.next_invoice_number(p_company);

  insert into public.invoices (
    company_id, job_id, quote_id, customer_id, invoice_number, status, tax_rate, created_by
  ) values (
    p_company, p_job, j.quote_id, j.customer_id, v_number, 'draft',
    coalesce((select tax_rate from public.quotes where id = j.quote_id), 0),
    auth.uid()
  ) returning id into v_inv;

  -- Seed line items from the linked quote (if any).
  if j.quote_id is not null then
    select * into q from public.quotes where id = j.quote_id;
    if found then
      v_labor := round(coalesce(q.hourly_rate,0) * coalesce(q.estimated_hours,0), 2);
      if v_labor > 0 then
        insert into public.invoice_line_items (invoice_id, description, quantity, unit_price, total, sort_order)
        values (v_inv, 'Labor', coalesce(q.estimated_hours,0), coalesce(q.hourly_rate,0), v_labor, v_pos);
        v_pos := v_pos + 1;
      end if;
      if coalesce(q.travel_fee,0) > 0 then
        insert into public.invoice_line_items values (gen_random_uuid(), v_inv, 'Travel fee', 1, q.travel_fee, round(q.travel_fee,2), v_pos); v_pos := v_pos + 1;
      end if;
      if coalesce(q.packing_fee,0) > 0 then
        insert into public.invoice_line_items values (gen_random_uuid(), v_inv, 'Packing fee', 1, q.packing_fee, round(q.packing_fee,2), v_pos); v_pos := v_pos + 1;
      end if;
      if coalesce(q.materials_fee,0) > 0 then
        insert into public.invoice_line_items values (gen_random_uuid(), v_inv, 'Materials', 1, q.materials_fee, round(q.materials_fee,2), v_pos); v_pos := v_pos + 1;
      end if;
      insert into public.invoice_line_items (invoice_id, description, quantity, unit_price, total, sort_order)
      select v_inv, li.description, li.quantity, li.unit_price,
             round(li.quantity * li.unit_price, 2), v_pos + (row_number() over (order by li.sort_order))::int - 1
      from public.quote_line_items li where li.quote_id = j.quote_id;
      v_pos := v_pos + coalesce((select count(*) from public.quote_line_items where quote_id = j.quote_id),0)::int;
      if coalesce(q.discount,0) > 0 then
        insert into public.invoice_line_items values (gen_random_uuid(), v_inv, 'Discount', 1, -q.discount, round(-q.discount,2), v_pos);
      end if;
    end if;
  end if;

  perform public._compute_invoice_totals(v_inv);
  return v_inv;
end;
$$;
revoke execute on function public._create_draft_invoice_for_job(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. CLIENT RPCs
-- ---------------------------------------------------------------------
-- 8a. Manual "Generate invoice" (idempotent). Job must be completed.
create or replace function public.generate_invoice_for_job(p_job_id uuid)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_invoice_mutator(); j record; v_inv uuid; v_existing uuid;
begin
  select company_id, status::text as status into j from public.jobs where id = p_job_id;
  if j.company_id is null then raise exception 'Job not found'; end if;
  if j.company_id <> v_company then raise exception 'Job does not belong to your company'; end if;

  select id into v_existing from public.invoices where job_id = p_job_id limit 1;
  if v_existing is not null then
    return json_build_object('invoice_id', v_existing, 'created', false);
  end if;
  if j.status <> 'completed' then
    raise exception 'An invoice can only be generated for a completed job (current status: %)', j.status;
  end if;

  v_inv := public._create_draft_invoice_for_job(v_company, p_job_id);
  return json_build_object('invoice_id', v_inv, 'created', true);
end;
$$;
revoke execute on function public.generate_invoice_for_job(uuid) from public, anon;
grant  execute on function public.generate_invoice_for_job(uuid) to authenticated;

-- 8b. Edit a DRAFT invoice (line items + tax_rate + notes + due date).
create or replace function public.update_draft_invoice_with_items(
  p_invoice_id uuid,
  p_tax_rate   numeric     default 0,
  p_notes      text        default null,
  p_due_date   date        default null,
  p_line_items jsonb       default '[]'::jsonb
)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_invoice_mutator(); v_ic uuid; v_status text; elem jsonb;
begin
  if coalesce(p_tax_rate,0) < 0 or coalesce(p_tax_rate,0) > 100 then
    raise exception 'tax_rate must be between 0 and 100';
  end if;
  if p_line_items is not null and jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'line_items must be a JSON array';
  end if;
  for elem in select value from jsonb_array_elements(coalesce(p_line_items,'[]'::jsonb)) loop
    if btrim(coalesce(elem->>'description','')) = '' then
      raise exception 'Each line item needs a non-empty description';
    end if;
    if coalesce((elem->>'quantity')::numeric,1) < 0 then raise exception 'quantity cannot be negative'; end if;
  end loop;

  select company_id, status::text into v_ic, v_status from public.invoices where id = p_invoice_id;
  if v_ic is null then raise exception 'Invoice not found'; end if;
  if v_ic <> v_company then raise exception 'Invoice does not belong to your company'; end if;
  if v_status <> 'draft' then raise exception 'Only draft invoices can be edited (current status: %)', v_status; end if;

  update public.invoices
     set tax_rate = coalesce(p_tax_rate,0), notes = p_notes, due_date = p_due_date, updated_at = now()
   where id = p_invoice_id;

  delete from public.invoice_line_items where invoice_id = p_invoice_id;
  insert into public.invoice_line_items (invoice_id, description, quantity, unit_price, total, sort_order)
  select p_invoice_id, btrim(li->>'description'),
         coalesce((li->>'quantity')::numeric,1), coalesce((li->>'unit_price')::numeric,0),
         round(coalesce((li->>'quantity')::numeric,1) * coalesce((li->>'unit_price')::numeric,0), 2),
         coalesce((li->>'sort_order')::int, (ord-1)::int)
  from jsonb_array_elements(coalesce(p_line_items,'[]'::jsonb)) with ordinality as t(li, ord);

  perform public._compute_invoice_totals(p_invoice_id);
  return json_build_object('invoice_id', p_invoice_id);
end;
$$;
revoke execute on function public.update_draft_invoice_with_items(uuid,numeric,text,date,jsonb) from public, anon;
grant  execute on function public.update_draft_invoice_with_items(uuid,numeric,text,date,jsonb) to authenticated;

-- 8c. Mark a draft invoice as sent (requires a positive total).
create or replace function public.mark_invoice_sent(p_invoice_id uuid)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_invoice_mutator(); v_ic uuid; v_status text; v_total numeric;
begin
  select company_id, status::text, total into v_ic, v_status, v_total from public.invoices where id = p_invoice_id;
  if v_ic is null then raise exception 'Invoice not found'; end if;
  if v_ic <> v_company then raise exception 'Invoice does not belong to your company'; end if;
  if v_status = 'draft' then
    if coalesce(v_total,0) <= 0 then raise exception 'Cannot send an invoice with a zero total'; end if;
    update public.invoices set status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() where id = p_invoice_id;
  elsif v_status in ('sent','partially_paid') then null;
  else raise exception 'Cannot send an invoice in status %', v_status; end if;
  return json_build_object('invoice_id', p_invoice_id,
    'status', (select status::text from public.invoices where id = p_invoice_id));
end;
$$;
revoke execute on function public.mark_invoice_sent(uuid) from public, anon;
grant  execute on function public.mark_invoice_sent(uuid) to authenticated;

-- 8d. Record a payment/deposit; recompute balance + auto-advance status.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     text        default 'other',
  p_paid_at    timestamptz default null,
  p_note       text        default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_invoice_mutator(); v_ic uuid; v_status text; v_balance numeric;
begin
  if coalesce(p_amount,0) <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select company_id, status::text into v_ic, v_status from public.invoices where id = p_invoice_id;
  if v_ic is null then raise exception 'Invoice not found'; end if;
  if v_ic <> v_company then raise exception 'Invoice does not belong to your company'; end if;
  if v_status not in ('sent','partially_paid') then
    raise exception 'Payments can only be recorded on a sent invoice (current status: %)', v_status;
  end if;

  insert into public.invoice_payments (company_id, invoice_id, amount, method, paid_at, note, recorded_by)
  values (v_company, p_invoice_id, round(p_amount,2), coalesce(nullif(btrim(p_method),''),'other'),
          coalesce(p_paid_at, now()), p_note, auth.uid());

  perform public._compute_invoice_totals(p_invoice_id);

  select balance into v_balance from public.invoices where id = p_invoice_id;
  update public.invoices
     set status = case when v_balance <= 0 then 'paid'::public.invoice_status
                       else 'partially_paid'::public.invoice_status end,
         updated_at = now()
   where id = p_invoice_id;

  return json_build_object('invoice_id', p_invoice_id,
    'status', (select status::text from public.invoices where id = p_invoice_id),
    'balance', v_balance);
end;
$$;
revoke execute on function public.record_invoice_payment(uuid,numeric,text,timestamptz,text) from public, anon;
grant  execute on function public.record_invoice_payment(uuid,numeric,text,timestamptz,text) to authenticated;

-- 8e. Void an invoice (not once paid).
create or replace function public.void_invoice(p_invoice_id uuid)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_company uuid := public._require_invoice_mutator(); v_ic uuid; v_status text;
begin
  select company_id, status::text into v_ic, v_status from public.invoices where id = p_invoice_id;
  if v_ic is null then raise exception 'Invoice not found'; end if;
  if v_ic <> v_company then raise exception 'Invoice does not belong to your company'; end if;
  if v_status = 'void' then null;
  elsif v_status = 'paid' then raise exception 'Cannot void a paid invoice';
  else update public.invoices set status = 'void', updated_at = now() where id = p_invoice_id; end if;
  return json_build_object('invoice_id', p_invoice_id, 'status', 'void');
end;
$$;
revoke execute on function public.void_invoice(uuid) from public, anon;
grant  execute on function public.void_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. AUTO-DRAFT HOOK — replace set_job_status to create a draft invoice
--    when a job transitions to 'completed'. Invoice creation is wrapped so
--    a failure NEVER blocks the job status change.
-- ---------------------------------------------------------------------
create or replace function public.set_job_status(
  p_job_id uuid,
  p_status public.job_status
)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_company uuid := public._require_job_status_setter();
  v_jc      uuid;
  v_current public.job_status;
  v_allowed boolean;
begin
  select company_id, status into v_jc, v_current from public.jobs where id = p_job_id;
  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  if v_current = p_status then
    return json_build_object('job_id', p_job_id, 'status', v_current, 'changed', false);
  end if;

  v_allowed :=
       (v_current = 'scheduled'   and p_status in ('confirmed','cancelled'))
    or (v_current = 'confirmed'   and p_status in ('in_progress','cancelled'))
    or (v_current = 'in_progress' and p_status in ('completed','cancelled'));

  if not v_allowed then
    raise exception 'Illegal job status transition: % -> %', v_current, p_status;
  end if;

  update public.jobs set status = p_status, updated_at = now() where id = p_job_id;

  -- Auto-create a draft invoice on completion (non-blocking).
  if p_status = 'completed' then
    begin
      perform public._create_draft_invoice_for_job(v_company, p_job_id);
    exception when others then
      raise notice 'Draft invoice auto-create skipped for job %: %', p_job_id, sqlerrm;
    end;
  end if;

  return json_build_object('job_id', p_job_id, 'status', p_status, 'changed', true);
end;
$$;
revoke execute on function public.set_job_status(uuid, public.job_status) from public, anon;
grant  execute on function public.set_job_status(uuid, public.job_status) to authenticated;

commit;
