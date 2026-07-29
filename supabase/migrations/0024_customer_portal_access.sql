-- =====================================================================
-- 0024_customer_portal_access.sql        [Phase 9 — Customer Portal foundation]
-- OWNER-EXECUTED ONLY. Author does NOT run this. Additive & security-focused.
--
-- Establishes a SECURE link between an authenticated user and ONE customer
-- record, and grants customers read access to ONLY their own quotes / jobs /
-- invoices / payments, plus two ownership-scoped RPCs (approve quote, update
-- contact). Email-based / LIMIT-1 identity resolution is explicitly avoided.
--
-- DOES NOT: touch staff RLS policies, existing invoice/quote/job/staff RPCs,
-- auth, or any financial/status logic. anon & PUBLIC receive nothing.
--
-- Run order: Part A (read-only) -> review -> Part B -> Part C (read-only) ->
-- Part D (owner links a specific customer<->user by explicit IDs). Part E is
-- the rollback if ever needed.
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT DIAGNOSTICS (READ-ONLY; run first, paste results)
-- =====================================================================

-- A1. Does customers.auth_user_id already exist? (expect 0 before, i.e. not yet)
select count(*) as auth_user_id_col_exists
from information_schema.columns
where table_schema='public' and table_name='customers' and column_name='auth_user_id';

-- A2. Confirm the columns this migration depends on actually exist.
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public'
  and ( (table_name='customers' and column_name in ('id','company_id','first_name','last_name','email','phone'))
     or (table_name='profiles'  and column_name in ('id','company_id','role','is_active'))
     or (table_name='quotes'    and column_name in ('id','company_id','customer_id','status','accepted_at','updated_at'))
     or (table_name='jobs'      and column_name in ('id','company_id','customer_id'))
     or (table_name='invoices'  and column_name in ('id','company_id','customer_id','status')) )
group by table_name order by table_name;

-- A3. Existing functions that must not be broken / that we replace.
select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('current_customer_id','portal_approve_quote','portal_update_contact','has_company_role')
order by p.proname;

-- A4. Any lingering email-based customer resolver? (expect none)
select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('current_customer_id')
  and pg_get_functiondef(p.oid) ~* 'email';

-- A5. Existing STAFF policies on target tables that MUST remain untouched.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
order by tablename, policyname;

-- A6. Current quote status values in use (informs the approvable-state guard).
select status, count(*) from public.quotes group by status order by 1;

-- A7. Any duplicate/conflicting future auth links? (expect 0 now; also run in Part C)
select 1 where exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='auth_user_id');


-- =====================================================================
-- PART B — MIGRATION (transactional; idempotent where practical)
-- =====================================================================
begin;

-- B1. Secure link column (nullable; staff attach a portal login later).
alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- B2. Uniqueness: one auth user may link to at most ONE customer record.
create unique index if not exists customers_auth_user_id_unique
  on public.customers(auth_user_id)
  where auth_user_id is not null;

-- B3. Secure identity resolver — keyed on auth.uid() ONLY (no email, no guess).
--     Uniqueness (B2) guarantees at most one row, so no LIMIT is needed.
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
  from public.customers c
  join public.profiles p on p.id = auth.uid()
  where c.auth_user_id = auth.uid()
    and p.role = 'customer'::public.user_role
    and p.is_active = true
    and c.company_id = p.company_id
$$;

revoke all on function public.current_customer_id() from public, anon;
grant execute on function public.current_customer_id() to authenticated;

-- B4. CUSTOMER-SELF SELECT policies (own rows only). Staff policies untouched;
--     these are ADDED (permissive OR). For staff users current_customer_id()
--     is NULL, so these policies match no extra rows.

-- customers: only the caller's own linked record.
drop policy if exists "customers_customer_self_select" on public.customers;
create policy "customers_customer_self_select" on public.customers
  for select to authenticated
  using ( id = public.current_customer_id() );

-- quotes: own, and not a draft (drafts are staff-internal).
drop policy if exists "quotes_customer_self_select" on public.quotes;
create policy "quotes_customer_self_select" on public.quotes
  for select to authenticated
  using ( customer_id = public.current_customer_id()
          and status <> 'draft'::public.quote_status );

-- quote_line_items: via an owned, non-draft quote.
drop policy if exists "quote_line_items_customer_self_select" on public.quote_line_items;
create policy "quote_line_items_customer_self_select" on public.quote_line_items
  for select to authenticated
  using ( exists (
    select 1 from public.quotes q
    where q.id = quote_line_items.quote_id
      and q.customer_id = public.current_customer_id()
      and q.status <> 'draft'::public.quote_status ) );

-- jobs: own.
drop policy if exists "jobs_customer_self_select" on public.jobs;
create policy "jobs_customer_self_select" on public.jobs
  for select to authenticated
  using ( customer_id = public.current_customer_id() );

-- invoices: own, and not a draft (drafts are staff-internal).
drop policy if exists "invoices_customer_self_select" on public.invoices;
create policy "invoices_customer_self_select" on public.invoices
  for select to authenticated
  using ( customer_id = public.current_customer_id()
          and status <> 'draft'::public.invoice_status );

-- invoice_line_items: via an owned, non-draft invoice.
drop policy if exists "invoice_line_items_customer_self_select" on public.invoice_line_items;
create policy "invoice_line_items_customer_self_select" on public.invoice_line_items
  for select to authenticated
  using ( exists (
    select 1 from public.invoices i
    where i.id = invoice_line_items.invoice_id
      and i.customer_id = public.current_customer_id()
      and i.status <> 'draft'::public.invoice_status ) );

-- invoice_payments: payments on the caller's own non-draft invoices.
drop policy if exists "invoice_payments_customer_self_select" on public.invoice_payments;
create policy "invoice_payments_customer_self_select" on public.invoice_payments
  for select to authenticated
  using ( exists (
    select 1 from public.invoices i
    where i.id = invoice_payments.invoice_id
      and i.customer_id = public.current_customer_id()
      and i.status <> 'draft'::public.invoice_status ) );

-- B5. RPC: customer approves ONE of their own quotes in an approvable state.
create or replace function public.portal_approve_quote(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust uuid := public.current_customer_id();
  v_status public.quote_status;
begin
  if v_cust is null then
    raise exception 'Not authorized as a customer';
  end if;

  select status into v_status
  from public.quotes
  where id = p_quote_id and customer_id = v_cust;

  if not found then
    raise exception 'Quote not found';
  end if;

  if v_status not in ('sent'::public.quote_status, 'viewed'::public.quote_status) then
    raise exception 'This quote is not in an approvable state (current status: %)', v_status;
  end if;

  update public.quotes
     set status = 'accepted'::public.quote_status,
         accepted_at = now(),
         updated_at = now()
   where id = p_quote_id and customer_id = v_cust;

  return json_build_object('quote_id', p_quote_id, 'status', 'accepted');
end;
$$;

revoke all on function public.portal_approve_quote(uuid) from public, anon;
grant execute on function public.portal_approve_quote(uuid) to authenticated;

-- B6. RPC: customer updates ONLY their own approved contact columns.
--     Cannot touch company_id, role, id, auth_user_id, notes, status, or
--     any financial field — only first/last name, email, phone.
create or replace function public.portal_update_contact(
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust uuid := public.current_customer_id();
begin
  if v_cust is null then
    raise exception 'Not authorized as a customer';
  end if;

  update public.customers
     set first_name = coalesce(nullif(btrim(p_first_name), ''), first_name),
         last_name  = coalesce(nullif(btrim(p_last_name),  ''), last_name),
         email      = coalesce(nullif(btrim(p_email),      ''), email),
         phone      = coalesce(nullif(btrim(p_phone),      ''), phone)
   where id = v_cust;

  return json_build_object('customer_id', v_cust, 'updated', true);
end;
$$;

revoke all on function public.portal_update_contact(text, text, text, text) from public, anon;
grant execute on function public.portal_update_contact(text, text, text, text) to authenticated;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste results)
-- =====================================================================

-- C1. auth_user_id column exists.
select exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='auth_user_id') as auth_user_id_exists;

-- C2. Uniqueness protection exists.
select indexname from pg_indexes
where schemaname='public' and tablename='customers' and indexname='customers_auth_user_id_unique';

-- C3. Helper is SECURITY DEFINER + pinned search_path + NOT email-based.
select p.prosecdef as security_definer,
       p.proconfig as config,
       (pg_get_functiondef(p.oid) !~* 'email') as no_email_resolution
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='current_customer_id';

-- C4. anon/PUBLIC have NO execute on the new functions (expect no anon/PUBLIC rows).
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema='public'
  and routine_name in ('current_customer_id','portal_approve_quote','portal_update_contact')
order by routine_name, grantee;

-- C5. Customer-self SELECT policies exist on all 7 tables.
select tablename, policyname, cmd
from pg_policies
where schemaname='public' and policyname like '%customer_self_select'
order by tablename;

-- C6. Existing STAFF policies still present (compare to Part A5 — must be unchanged).
select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and tablename in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
  and policyname not like '%customer_self_select'
order by tablename, policyname;

-- C7. No duplicate auth links (each auth user maps to <=1 customer).
select auth_user_id, count(*) as n
from public.customers
where auth_user_id is not null
group by auth_user_id having count(*) > 1;


-- =====================================================================
-- PART D — OWNER LINKING INSTRUCTIONS (explicit IDs only; NO email match)
-- =====================================================================
-- Link ONE existing customer record to ONE existing Auth user, by IDs you have
-- personally verified. Do NOT bulk-match by email. Steps:
--
-- 1) Find the customer id (verify it is the correct person + company):
--      select id, company_id, first_name, last_name, email
--      from public.customers where email ilike '%<known email>%';
--
-- 2) Find the Auth user id (verify it is that same person's login):
--      select id, email from auth.users where email ilike '%<known email>%';
--    Confirm this user's profile is an ACTIVE customer in the SAME company:
--      select id, company_id, role, is_active from public.profiles where id = '<AUTH_USER_ID>';
--    (role must be 'customer', is_active true, company_id must equal the customer's company_id.)
--
-- 3) ONLY after visually confirming BOTH ids and the company match, link them:
--      update public.customers
--         set auth_user_id = '<AUTH_USER_ID>'
--       where id = '<CUSTOMER_ID>'
--         and auth_user_id is null;            -- refuse to overwrite an existing link
--
-- 4) Verify the link resolves:
--      -- as that signed-in user, public.current_customer_id() must return <CUSTOMER_ID>.
--      select id, auth_user_id from public.customers where id = '<CUSTOMER_ID>';
--
-- The unique index guarantees the same Auth user cannot be linked to a second
-- customer. To relink, first set auth_user_id = null on the old record.


-- =====================================================================
-- PART E — ROLLBACK (removes ONLY objects created by 0024)
-- =====================================================================
-- begin;
--   drop policy if exists "customers_customer_self_select"            on public.customers;
--   drop policy if exists "quotes_customer_self_select"               on public.quotes;
--   drop policy if exists "quote_line_items_customer_self_select"     on public.quote_line_items;
--   drop policy if exists "jobs_customer_self_select"                 on public.jobs;
--   drop policy if exists "invoices_customer_self_select"             on public.invoices;
--   drop policy if exists "invoice_line_items_customer_self_select"   on public.invoice_line_items;
--   drop policy if exists "invoice_payments_customer_self_select"     on public.invoice_payments;
--   drop function if exists public.portal_approve_quote(uuid);
--   drop function if exists public.portal_update_contact(text, text, text, text);
--   drop function if exists public.current_customer_id();
--   drop index if exists public.customers_auth_user_id_unique;
--   -- Only drop the column if you are sure no data depends on it:
--   -- alter table public.customers drop column if exists auth_user_id;
-- commit;
-- Staff policies, staff RPCs, invoices/quotes/jobs logic are NOT touched by rollback.
