-- =====================================================================
-- 0026_customer_portal_access.sql   [Phase 9 — Customer Portal foundation]
-- OWNER-EXECUTED ONLY. The author does NOT run this. Additive & security-focused.
--
-- DEPENDS ON (dependency-ordered chain):
--   1) 0024_activity_log_hardened.sql — portal_approve_quote writes ONE audit row
--      to public.activity_log in the SAME transaction as quote acceptance; with
--      check_function_bodies on, CREATE FUNCTION aborts if activity_log is absent.
--   2) 0025_quarantine_legacy_portal_policies.sql — removes the 5 legacy
--      customer-self policies + is_current_customer(uuid) so the unsafe email-based
--      public.current_customer_id() has ZERO dependencies. RE-RUN this file's
--      Part A AFTER 0025 quarantine so A3c/D show zero resolver dependents before
--      Part F (legacy-resolver hardening) is executed.
--
-- ARCHITECTURE (approved 2026-06): EXPLICIT-FIELD READ RPCs.
--   Customers NEVER get a base-table SELECT policy. All portal reads flow
--   through SECURITY DEFINER RPCs that return an explicit, whitelisted set of
--   customer-safe fields as JSON. This prevents the Data API from exposing any
--   internal/staff/financial column (RLS filters ROWS, not COLUMNS).
--
-- WHAT THIS DOES
--   * Adds customers.auth_user_id (nullable link to auth.users) + unique index.
--   * Adds an internal auth-UID-only identity resolver (NO email, NO LIMIT 1).
--   * Adds 6 read RPCs (quotes/jobs/invoices list+detail) — explicit JSON only.
--   * Adds portal_approve_quote — reproduces the authoritative 0015 acceptance
--     invariants (expiry guard + status-guarded atomic accept + token revoke)
--     in ONE transaction, plus a KEPT server-derived audit-log write whose
--     actor_id/actor_email/actor_role/company_id are ALL derived from auth.uid()
--     + the customer record (no client-supplied identity).
--   * Adds portal_update_contact — customer edits ONLY their own name/email/phone.
--
-- WHAT THIS DOES NOT DO
--   * Does NOT add/alter/drop any staff RLS policy.
--   * Does NOT change table grants on the 7 base tables or on activity_log.
--   * Does NOT touch existing invoice/quote/job RPCs, Edge Functions, or the
--     legacy email-based public.current_customer_id() (dormant + non-executable
--     since 0006; see Part A3b/A3c + Part F).
--   * anon & PUBLIC receive nothing.
--
-- RUN ORDER: (run 0024_activity_log_hardened.sql first) -> Part A (read-only
--   preflight; PASTE RESULTS + SAVE A3 output) -> review -> Part B (migration)
--   -> Part C (read-only verification) -> Part D (owner links ONE customer<->
--   user by explicit IDs) -> done. Part E is the rollback. Part F is the
--   legacy-resolver hardening (gated on Part A3c evidence).
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT (READ-ONLY; run first, paste every result)
-- =====================================================================

-- A1. auth_user_id must NOT exist yet (expect 0).
select count(*) as auth_user_id_col_exists
from information_schema.columns
where table_schema='public' and table_name='customers' and column_name='auth_user_id';

-- A2. Confirm every column this migration reads/writes actually exists.
--     (If any expected row is missing, STOP — do not run Part B.)
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public' and (
      (table_name='customers'          and column_name in ('id','company_id','first_name','last_name','email','phone'))
   or (table_name='profiles'           and column_name in ('id','company_id','role','is_active'))
   or (table_name='quotes'             and column_name in ('id','company_id','customer_id','quote_number','status','created_at','expires_at','accepted_at','updated_at','hourly_rate','estimated_hours','travel_fee','packing_fee','materials_fee','discount','subtotal','tax_rate','tax','total','deposit_percent','deposit_amount'))
   or (table_name='quote_line_items'   and column_name in ('id','quote_id','description','quantity','unit_price','total','sort_order'))
   or (table_name='jobs'               and column_name in ('id','company_id','customer_id','job_number','status','scheduled_start','scheduled_end','origin_address','destination_address'))
   or (table_name='invoices'           and column_name in ('id','company_id','customer_id','invoice_number','status','subtotal','tax_rate','tax','total','amount_paid','balance','notes','due_date','sent_at'))
   or (table_name='invoice_line_items' and column_name in ('id','invoice_id','description','quantity','unit_price','total','sort_order'))
   or (table_name='invoice_payments'   and column_name in ('id','invoice_id','amount','method','paid_at','note'))
   or (table_name='activity_log'       and column_name in ('company_id','actor_id','actor_email','actor_role','action','entity_type','entity_id','summary','metadata')) )
group by table_name order by table_name;

-- A2b. Token fields used by portal_approve_quote step (iii) must exist on
--      quote_approval_tokens (expect one row listing all four).
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public' and table_name='quote_approval_tokens'
  and column_name in ('quote_id','revoked_at','decided_at','expires_at')
group by table_name;

-- A3. CAPTURE + SAVE the exact prior definitions of anything that shares a name
--     we use. If any UNEXPECTED object appears here (i.e. a portal_* /
--     _portal_* function OR a *_customer_self_*/*portal* policy already exists),
--     STOP and reconcile before Part B — do not blindly overwrite.
select p.proname,
       pg_get_userbyid(p.proowner) as owner,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       p.proconfig as config,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
  and p.proname in ('current_customer_id','_portal_current_customer_id',
                    'portal_list_quotes','portal_get_quote','portal_list_jobs',
                    'portal_get_job','portal_list_invoices','portal_get_invoice',
                    'portal_approve_quote','portal_update_contact')
order by p.proname;

-- Policy collision check. Part B (0026) creates NO policies, so this catches
-- pre-existing customer-facing policies only. After 0025 quarantine this must be
-- 0 rows. NOTE: the preserved staff policies portal_tokens_manager_select/write
-- are intentionally EXCLUDED (they are legitimate manager policies, not portal
-- customer policies and do not reference the resolver).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and (policyname ilike '%customer_self%'
       or policyname ilike 'portal_list_%' or policyname ilike 'portal_get_%'
       or policyname ilike 'portal_approve_%' or policyname ilike 'portal_update_%'
       or policyname ilike '%portal_activity_member%')
order by tablename, policyname;

-- A3b. LEGACY RESOLVER FOCUS — exact owner + full EXECUTE grants of the legacy
--      email-based public.current_customer_id() (and, for contrast, the new
--      internal name if it somehow already exists). Expect: legacy present with
--      NO PUBLIC/anon/authenticated EXECUTE (revoked in 0006); new name absent.
select n.nspname as schema, p.proname,
       pg_get_userbyid(p.proowner) as owner,
       pg_get_function_identity_arguments(p.oid) as signature,
       coalesce(array_to_string(p.proacl, ' | '), '(default ACL = EXECUTE to PUBLIC)') as execute_acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('current_customer_id','_portal_current_customer_id')
order by p.proname;

-- A3c. LEGACY RESOLVER — COMPLETE DEPENDENCY INVENTORY. Removal/hardening of
--      current_customer_id() is only safe if ALL of these return ZERO rows.
--      (pg_depend does not record SQL/plpgsql body references, so we also text-
--      search function bodies, RLS policy expressions, view/matview defs, and
--      column defaults/constraints.)
--   c1) hard catalog dependencies on the function object:
select classid::regclass as dependent_catalog, objid, deptype
from pg_depend
where refobjid = (
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='current_customer_id'
  order by p.oid limit 1)
  and deptype not in ('i');   -- ignore internal
--   c2) other function/procedure bodies referencing it by name:
select p.proname, n.nspname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname <> 'current_customer_id' and p.prokind in ('f','p')
  and pg_get_functiondef(p.oid) ~* '\mcurrent_customer_id\M';
--   c3) RLS policies referencing it (USING or WITH CHECK):
select schemaname, tablename, policyname, cmd
from pg_policies
where coalesce(qual,'') ~* '\mcurrent_customer_id\M'
   or coalesce(with_check,'') ~* '\mcurrent_customer_id\M';
--   c4) views / matviews referencing it:
select schemaname, viewname as relname, 'view' as kind from pg_views
where definition ~* '\mcurrent_customer_id\M'
union all
select schemaname, matviewname, 'matview' from pg_matviews
where definition ~* '\mcurrent_customer_id\M';
--   c5) column defaults / check constraints referencing it (rare but possible):
select conrelid::regclass as table, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where pg_get_constraintdef(oid) ~* '\mcurrent_customer_id\M';

-- A3d. EXISTING quote-acceptance surface — exact signatures + owners. Part B
--      does NOT create or modify any of these; portal_approve_quote only mirrors
--      their invariants. Confirm they exist unchanged (and note their sigs).
select p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('respond_to_quote_approval','get_quote_by_approval_token',
                    'create_quote_approval_link','revoke_quote_approval_links',
                    '_require_quote_approval_token','_require_quote_mutator')
order by p.proname;

-- A3e. activity_log dependency (created by 0024) — must exist, company_id NOT
--      NULL, RLS enabled, authenticated=SELECT only, no anon/PUBLIC, no client
--      write grants. portal_approve_quote's audit insert depends on this.
select
  to_regclass('public.activity_log') is not null as table_exists,
  (select is_nullable from information_schema.columns
     where table_schema='public' and table_name='activity_log' and column_name='company_id') as company_id_nullable,
  (select relrowsecurity from pg_class where oid='public.activity_log'::regclass) as rls_enabled;
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='activity_log'
  and grantee in ('anon','authenticated','public','PUBLIC')
order by grantee, privilege_type;

-- A3f. CREATE/REPLACE MANIFEST — the 9 function identities Part B will create.
--      Expect ALL to be ABSENT now (0 rows). Any row here = a pre-existing
--      object Part B would replace -> STOP and reconcile (also cross-check A3).
select p.proname, pg_get_function_identity_arguments(p.oid) as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_portal_current_customer_id','portal_list_quotes','portal_get_quote',
                    'portal_list_jobs','portal_get_job','portal_list_invoices',
                    'portal_get_invoice','portal_approve_quote','portal_update_contact')
order by p.proname;

-- A4. Enum labels Part B casts to must exist (expect every column true).
select
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role'     and e.enumlabel='customer')  as user_role_customer,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='quote_status'   and e.enumlabel='draft')     as qs_draft,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='quote_status'   and e.enumlabel='sent')      as qs_sent,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='quote_status'   and e.enumlabel='viewed')    as qs_viewed,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='quote_status'   and e.enumlabel='accepted')  as qs_accepted,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='quote_status'   and e.enumlabel='expired')   as qs_expired,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='invoice_status' and e.enumlabel='draft')     as inv_draft;

-- A5. Snapshot the EXISTING staff policies on the 7 target tables. Save this;
--     Part C6 must return an identical set (proves staff RLS was untouched).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
order by tablename, policyname;

-- A6. Snapshot base-table grants for anon/authenticated/public. Save this;
--     Part C7 must return an identical set (proves grants were untouched).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;


-- =====================================================================
-- PART B — MIGRATION (single transaction)
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- B1. Secure link column + uniqueness (one auth user -> at most one customer).
-- ---------------------------------------------------------------------
alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists customers_auth_user_id_unique
  on public.customers(auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------
-- B2. Internal identity resolver — auth.uid() ONLY (no email, no LIMIT 1).
--     Verifies: caller present, active 'customer' profile, non-null company,
--     customer.company_id == profile.company_id. Uniqueness (B1) guarantees
--     at most one matching customer row, so no LIMIT is required.
--     Internal-only: EXECUTE revoked from every client. Portal RPCs (DEFINER)
--     call it as the definer; clients never call it directly.
-- ---------------------------------------------------------------------
create or replace function public._portal_current_customer_id()
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
    and p.role::text = 'customer'
    and p.is_active is true
    and p.company_id is not null
    and c.company_id = p.company_id
$$;

revoke all on function public._portal_current_customer_id() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- B3. READ RPC — list the caller's own quotes (non-draft). Explicit fields.
--     Bounded limit (1..100), deterministic order (created_at desc, id desc).
-- ---------------------------------------------------------------------
create or replace function public.portal_list_quotes(
  p_limit  integer default 20,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust  uuid := public._portal_current_customer_id();
  v_lim   integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_items json;
  v_count bigint;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select count(*) into v_count
  from public.quotes q
  where q.customer_id = v_cust and q.status::text <> 'draft';

  select coalesce(json_agg(json_build_object(
           'id', q.id, 'quote_number', q.quote_number, 'status', q.status,
           'created_at', q.created_at, 'expires_at', q.expires_at,
           'total', q.total, 'deposit_amount', q.deposit_amount)
           order by q.created_at desc, q.id desc), '[]'::json)
    into v_items
  from (
    select q.id, q.quote_number, q.status::text as status,
           q.created_at, q.expires_at, q.total, q.deposit_amount
    from public.quotes q
    where q.customer_id = v_cust and q.status::text <> 'draft'
    order by q.created_at desc, q.id desc
    limit v_lim offset v_off
  ) q;

  return json_build_object('items', v_items, 'count', v_count, 'limit', v_lim, 'offset', v_off);
end;
$$;

revoke all on function public.portal_list_quotes(integer, integer) from public, anon;
grant execute on function public.portal_list_quotes(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- B4. READ RPC — one owned, non-draft quote + its line items. Explicit fields.
-- ---------------------------------------------------------------------
create or replace function public.portal_get_quote(p_quote_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust  uuid := public._portal_current_customer_id();
  q       record;
  v_items json;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select id, quote_number, status, created_at, expires_at, accepted_at,
         hourly_rate, estimated_hours, travel_fee, packing_fee, materials_fee,
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
  from public.quote_line_items li
  where li.quote_id = q.id;

  return json_build_object(
    'id', q.id, 'quote_number', q.quote_number, 'status', q.status::text,
    'created_at', q.created_at, 'expires_at', q.expires_at, 'accepted_at', q.accepted_at,
    'hourly_rate', q.hourly_rate, 'estimated_hours', q.estimated_hours,
    'travel_fee', q.travel_fee, 'packing_fee', q.packing_fee,
    'materials_fee', q.materials_fee, 'discount', q.discount,
    'subtotal', q.subtotal, 'tax_rate', q.tax_rate, 'tax', q.tax,
    'total', q.total, 'deposit_percent', q.deposit_percent,
    'deposit_amount', q.deposit_amount, 'line_items', v_items
  );
end;
$$;

revoke all on function public.portal_get_quote(uuid) from public, anon;
grant execute on function public.portal_get_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- B5. READ RPC — list the caller's own jobs. Explicit fields (NO dispatch_notes,
--     NO created_by, NO crew/truck counts, NO company_id). Deterministic order.
-- ---------------------------------------------------------------------
create or replace function public.portal_list_jobs(
  p_limit  integer default 20,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust  uuid := public._portal_current_customer_id();
  v_lim   integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_items json;
  v_count bigint;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select count(*) into v_count from public.jobs j where j.customer_id = v_cust;

  select coalesce(json_agg(json_build_object(
           'id', j.id, 'job_number', j.job_number, 'status', j.status,
           'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
           'origin_address', j.origin_address, 'destination_address', j.destination_address)
           order by j.scheduled_start desc nulls last, j.id desc), '[]'::json)
    into v_items
  from (
    select j.id, j.job_number, j.status::text as status,
           j.scheduled_start, j.scheduled_end, j.origin_address, j.destination_address
    from public.jobs j
    where j.customer_id = v_cust
    order by j.scheduled_start desc nulls last, j.id desc
    limit v_lim offset v_off
  ) j;

  return json_build_object('items', v_items, 'count', v_count, 'limit', v_lim, 'offset', v_off);
end;
$$;

revoke all on function public.portal_list_jobs(integer, integer) from public, anon;
grant execute on function public.portal_list_jobs(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- B6. READ RPC — one owned job. Explicit customer-safe fields only.
-- ---------------------------------------------------------------------
create or replace function public.portal_get_job(p_job_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust uuid := public._portal_current_customer_id();
  j      record;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select id, job_number, status, scheduled_start, scheduled_end,
         origin_address, destination_address
    into j
  from public.jobs
  where id = p_job_id and customer_id = v_cust;

  if not found then raise exception 'Job not found'; end if;

  return json_build_object(
    'id', j.id, 'job_number', j.job_number, 'status', j.status::text,
    'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
    'origin_address', j.origin_address, 'destination_address', j.destination_address
  );
end;
$$;

revoke all on function public.portal_get_job(uuid) from public, anon;
grant execute on function public.portal_get_job(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- B7. READ RPC — list the caller's own invoices (non-draft). Explicit fields.
-- ---------------------------------------------------------------------
create or replace function public.portal_list_invoices(
  p_limit  integer default 20,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust  uuid := public._portal_current_customer_id();
  v_lim   integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_items json;
  v_count bigint;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select count(*) into v_count
  from public.invoices i
  where i.customer_id = v_cust and i.status::text <> 'draft';

  select coalesce(json_agg(json_build_object(
           'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status,
           'total', i.total, 'amount_paid', i.amount_paid, 'balance', i.balance,
           'due_date', i.due_date, 'sent_at', i.sent_at)
           order by i.sent_at desc nulls last, i.id desc), '[]'::json)
    into v_items
  from (
    select i.id, i.invoice_number, i.status::text as status,
           i.total, i.amount_paid, i.balance, i.due_date, i.sent_at
    from public.invoices i
    where i.customer_id = v_cust and i.status::text <> 'draft'
    order by i.sent_at desc nulls last, i.id desc
    limit v_lim offset v_off
  ) i;

  return json_build_object('items', v_items, 'count', v_count, 'limit', v_lim, 'offset', v_off);
end;
$$;

revoke all on function public.portal_list_invoices(integer, integer) from public, anon;
grant execute on function public.portal_list_invoices(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- B8. READ RPC — one owned, non-draft invoice + line items + payments.
--     Explicit fields (NO created_by, NO recorded_by, NO company_id).
--     NOTE: invoices.notes and invoice_payments.note are OMITTED — both are
--     staff-authored freeform fields (set via InvoiceEditorDrawer / RecordPayment
--     Dialog) not proven exclusively customer-facing; default-omit to avoid
--     leaking internal remarks. Re-add later only if proven customer-facing.
-- ---------------------------------------------------------------------
create or replace function public.portal_get_invoice(p_invoice_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust    uuid := public._portal_current_customer_id();
  i         record;
  v_items   json;
  v_pays    json;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  select id, invoice_number, status, subtotal, tax_rate, tax, total,
         amount_paid, balance, due_date, sent_at
    into i
  from public.invoices
  where id = p_invoice_id and customer_id = v_cust and status::text <> 'draft';

  if not found then raise exception 'Invoice not found'; end if;

  select coalesce(json_agg(json_build_object(
           'description', li.description, 'quantity', li.quantity,
           'unit_price', li.unit_price, 'total', li.total, 'sort_order', li.sort_order)
           order by li.sort_order), '[]'::json)
    into v_items
  from public.invoice_line_items li
  where li.invoice_id = i.id;

  select coalesce(json_agg(json_build_object(
           'amount', p.amount, 'method', p.method, 'paid_at', p.paid_at)
           order by p.paid_at desc), '[]'::json)
    into v_pays
  from public.invoice_payments p
  where p.invoice_id = i.id;

  return json_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status::text,
    'subtotal', i.subtotal, 'tax_rate', i.tax_rate, 'tax', i.tax, 'total', i.total,
    'amount_paid', i.amount_paid, 'balance', i.balance,
    'due_date', i.due_date, 'sent_at', i.sent_at,
    'line_items', v_items, 'payments', v_pays
  );
end;
$$;

revoke all on function public.portal_get_invoice(uuid) from public, anon;
grant execute on function public.portal_get_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- B9. WRITE RPC — customer approves ONE of their own quotes.
--     Reproduces the authoritative 0015 respond_to_quote_approval invariants
--     for an 'accept' decision, atomically:
--       (i)   awaiting-decision guard: status must be 'sent' or 'viewed'.
--       (ii)  expiry: an expired-by-date quote is atomically flipped to
--             'expired' and the function RETURNS a structured, NON-RAISING
--             result {status:'expired', approved:false} — so the flip PERSISTS
--             and commits (it is NOT rolled back). This is an INTENTIONAL
--             DIFFERENCE from 0015: respond_to_quote_approval flips to 'expired'
--             then RAISEs, which rolls its own flip back (expiry there is
--             effectively display/validation-only). The portal is a logged-in
--             interactive surface, so persisting true state is correct here.
--             0015 is NOT modified (out of scope; no DDL to the token path).
--       (iii) status-guarded atomic UPDATE ... RETURNING: accepts exactly one
--             'sent'/'viewed' quote; returns {status:'accepted', approved:true}.
--       (iv)  revoke all outstanding active approval tokens (mirrors 0015 cleanup).
--     The row is locked FOR UPDATE to serialise against a concurrent token-path
--     decision. quotes has no triggers and the audit log is not trigger-driven
--     (verified vs 0003/0014/0015).
--
--     AUDIT (ATOMIC / FAIL-CLOSED per owner decision): on ACCEPT only, one
--     activity_log row is written in THIS SAME transaction with NO exception
--     handler — accept + token revoke + audit all commit together or all roll
--     back. Identity is server-derived: actor_id = auth.uid(); actor_role +
--     company_id from the caller's own active public.profiles row (not
--     hardcoded); actor_email from auth.users (NOT the editable customers.email).
--     No client-supplied actor/customer/company identity is trusted. Depends on
--     0024_activity_log_hardened.sql. Customers cannot READ activity_log.
-- ---------------------------------------------------------------------
create or replace function public.portal_approve_quote(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust    uuid := public._portal_current_customer_id();
  v_status  text;
  v_expires timestamptz;
  v_updated uuid;
  v_number  text;
  v_email   text;
  v_role    text;
  v_company uuid;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

  -- lock the row; also fetch current status/expiry
  select status::text, expires_at into v_status, v_expires
  from public.quotes
  where id = p_quote_id and customer_id = v_cust
  for update;

  if not found then raise exception 'Quote not found'; end if;

  -- (i) awaiting-decision guard
  if v_status not in ('sent','viewed') then
    raise exception 'This quote is not awaiting a decision (current status: %)', v_status;
  end if;

  -- (ii) expiry: flip to expired and RETURN (no raise -> the flip PERSISTS and
  --      commits). Intentional difference from 0015 (which raises + rolls back).
  if v_expires is not null and v_expires <= now() then
    update public.quotes
       set status = 'expired'::public.quote_status, updated_at = now()
     where id = p_quote_id and customer_id = v_cust
       and status::text in ('sent','viewed');
    return json_build_object('quote_id', p_quote_id, 'status', 'expired', 'approved', false);
  end if;

  -- (iii) status-guarded atomic accept
  update public.quotes
     set status = 'accepted'::public.quote_status,
         accepted_at = now(),
         updated_at = now()
   where id = p_quote_id and customer_id = v_cust
     and status::text in ('sent','viewed')
  returning id, quote_number into v_updated, v_number;

  if v_updated is null then
    raise exception 'This quote is not awaiting a decision (current status: %)', v_status;
  end if;

  -- (iv) revoke outstanding active approval tokens — mirrors 0015 cleanup
  update public.quote_approval_tokens
     set revoked_at = now()
   where quote_id = p_quote_id and revoked_at is null and decided_at is null;

  -- (v) audit log — ATOMIC & FAIL-CLOSED (NO exception handler). Identity/tenant
  --     fields come from the VERIFIED active profile + the Auth user, not the
  --     client and not the editable customers.email. Any failure here rolls back
  --     the accept + token revoke with it.
  select p.role::text, p.company_id, u.email
    into v_role, v_company, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and p.is_active is true;

  if v_company is null then
    raise exception 'Audit identity could not be resolved for the current user';
  end if;

  insert into public.activity_log
    (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
  values
    (v_company, auth.uid(), v_email, v_role, 'quote.approved', 'quote', v_updated::text,
     'Customer approved quote ' || coalesce(v_number, v_updated::text) || ' via portal',
     jsonb_build_object('source','portal','customer_id', v_cust));

  return json_build_object('quote_id', v_updated, 'status', 'accepted', 'approved', true);
end;
$$;

revoke all on function public.portal_approve_quote(uuid) from public, anon;
grant execute on function public.portal_approve_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- B10. WRITE RPC — customer updates ONLY their own contact fields.
--      Cannot touch id, company_id, auth_user_id, created_by, notes, status,
--      or any financial field — only first/last name, email, phone.
-- ---------------------------------------------------------------------
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
  v_cust uuid := public._portal_current_customer_id();
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;

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
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste every result)
-- =====================================================================

-- C1. Link column + uniqueness index exist.
select
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='customers' and column_name='auth_user_id') as auth_user_id_exists,
  exists (select 1 from pg_indexes
          where schemaname='public' and tablename='customers'
            and indexname='customers_auth_user_id_unique') as unique_index_exists;

-- C2. All 9 functions: owner, SECURITY DEFINER, and safe pinned search_path.
--     Expect owner=postgres (or your DB owner), security_definer=t for all,
--     and proconfig containing search_path=public, pg_temp.
select p.proname,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.proconfig as config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_portal_current_customer_id','portal_list_quotes','portal_get_quote',
                    'portal_list_jobs','portal_get_job','portal_list_invoices',
                    'portal_get_invoice','portal_approve_quote','portal_update_contact')
order by p.proname;

-- C3. The IDENTITY RESOLVER must not use email at all (expect 0 rows).
--     Identity is resolved by auth.uid() only. (portal_update_contact and
--     portal_approve_quote legitimately reference the email CONTACT field —
--     that is not identity resolution and is intentionally NOT checked here.)
select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname = '_portal_current_customer_id'
  and pg_get_functiondef(p.oid) ~* 'email';

-- C4. Grants: authenticated may EXECUTE the 8 client RPCs; the internal
--     resolver has NO client grant; anon/PUBLIC have NOTHING.
select p.proname,
       coalesce(array_to_string(p.proacl, ' | '), '(default/no explicit ACL)') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_portal_current_customer_id','portal_list_quotes','portal_get_quote',
                    'portal_list_jobs','portal_get_job','portal_list_invoices',
                    'portal_get_invoice','portal_approve_quote','portal_update_contact')
order by p.proname;

-- C5. NO customer SELECT policy was added to any of the 7 base tables (expect 0).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
  and (policyname ilike '%customer_self%' or policyname ilike '%portal%');

-- C6. Staff policies UNCHANGED — this must equal the Part A5 snapshot exactly.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
order by tablename, policyname;

-- C7. Base-table grants UNCHANGED — this must equal the Part A6 snapshot exactly.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('customers','quotes','quote_line_items','jobs','invoices','invoice_line_items','invoice_payments')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;

-- C8. Function dependencies: confirm the 8 client RPCs reference the internal
--     resolver (proves the identity gate is wired) — expect a row per RPC.
select dependent.proname as rpc
from pg_depend d
join pg_proc dependent on dependent.oid = d.objid
join pg_proc ref       on ref.oid = d.refobjid
join pg_namespace n     on n.oid = dependent.pronamespace
where n.nspname='public'
  and ref.proname='_portal_current_customer_id'
order by dependent.proname;
-- (If empty on your PG version, dependency tracking for SQL bodies may not be
--  recorded; C4/C3 + Part-C negative tests still prove the gate.)

-- C9. Data integrity: no auth user maps to more than one customer (expect 0).
select auth_user_id, count(*) as n
from public.customers
where auth_user_id is not null
group by auth_user_id having count(*) > 1;

-- C10. FAIL-CLOSED audit: portal_approve_quote must contain NO exception handler
--      that could suppress an audit failure. `has_exception_handler` must be
--      FALSE. (This matches a PL/pgSQL handler block `EXCEPTION WHEN ...`; it does
--      NOT match `RAISE EXCEPTION` guards, which are expected and fine.)
--      `references_activity_log` must be TRUE (the audit insert is present).
select p.proname,
       (pg_get_functiondef(p.oid) ~* 'exception[[:space:]]+when') as has_exception_handler,
       (pg_get_functiondef(p.oid) ~* 'insert into[[:space:]]+(public\.)?activity_log') as references_activity_log
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='portal_approve_quote';

-- C11. EXPIRED branch cannot roll back an intended status update: the function
--      must NOT raise on expiry (which would roll back the 'expired' flip) and
--      MUST return a persisted 'expired' result. Expect:
--        raises_on_expiry     = false   (no `raise exception ... expired`)
--        returns_expired      = true    (a `return ... 'expired'` path exists)
--        persists_expired_upd = true    (an UPDATE sets status='expired')
select p.proname,
       (pg_get_functiondef(p.oid) ~* 'raise[[:space:]]+exception[^;]*expired') as raises_on_expiry,
       (pg_get_functiondef(p.oid) ~* 'return[^;]*expired')                     as returns_expired,
       (pg_get_functiondef(p.oid) ~* 'set[[:space:]]+status[^;]*expired')      as persists_expired_upd
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='portal_approve_quote';


-- =====================================================================
-- PART D — OWNER LINKING (guarded, atomic; explicit IDs only, NO email match)
-- =====================================================================
-- Replace the two UUIDs below with values you have personally verified.
-- This transaction validates: both IDs exist, the auth user's profile is an
-- ACTIVE 'customer' in a NON-NULL company that MATCHES the customer's company,
-- there is no existing-link conflict, and EXACTLY ONE row is updated — else it
-- aborts with an error and changes nothing.
--
-- Pre-check (optional, read-only): confirm the pair you intend to link.
--   select id, company_id, first_name, last_name, email, auth_user_id
--   from public.customers where id = '<CUSTOMER_ID>';
--   select u.id as auth_user_id, u.email, p.company_id, p.role, p.is_active
--   from auth.users u join public.profiles p on p.id = u.id
--   where u.id = '<AUTH_USER_ID>';

do $$
declare
  v_customer_id uuid := '<CUSTOMER_ID>'::uuid;   -- <-- EDIT
  v_auth_user   uuid := '<AUTH_USER_ID>'::uuid;  -- <-- EDIT
  v_cust_company uuid;
  v_prof_company uuid;
  v_prof_role    text;
  v_prof_active  boolean;
  v_existing     uuid;
  v_rows         integer;
begin
  -- 1. customer exists
  select company_id, auth_user_id into v_cust_company, v_existing
  from public.customers where id = v_customer_id;
  if not found then
    raise exception 'Customer % not found', v_customer_id;
  end if;
  if v_existing is not null then
    raise exception 'Customer % is already linked to auth user %', v_customer_id, v_existing;
  end if;

  -- 2. auth user's profile exists, active, role=customer
  select company_id, role::text, is_active
    into v_prof_company, v_prof_role, v_prof_active
  from public.profiles where id = v_auth_user;
  if not found then raise exception 'No profile for auth user %', v_auth_user; end if;
  if v_prof_role <> 'customer' then raise exception 'Auth user % is role % (must be customer)', v_auth_user, v_prof_role; end if;
  if v_prof_active is not true then raise exception 'Auth user % profile is not active', v_auth_user; end if;

  -- 3. non-null, matching company
  if v_prof_company is null then raise exception 'Auth user % has no company', v_auth_user; end if;
  if v_prof_company <> v_cust_company then
    raise exception 'Company mismatch: customer=% profile=%', v_cust_company, v_prof_company;
  end if;

  -- 4. auth user not already linked to a different customer (belt & braces vs. unique index)
  if exists (select 1 from public.customers where auth_user_id = v_auth_user) then
    raise exception 'Auth user % is already linked to another customer', v_auth_user;
  end if;

  -- 5. atomic link; refuse to overwrite; require exactly one updated row
  update public.customers
     set auth_user_id = v_auth_user
   where id = v_customer_id and auth_user_id is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to update exactly 1 row, updated %', v_rows; end if;

  raise notice 'Linked customer % -> auth user %', v_customer_id, v_auth_user;
end $$;

-- Verify the link resolves (run while signed in AS that customer user):
--   select public._portal_current_customer_id();   -- must return <CUSTOMER_ID>
-- To relink, first set auth_user_id = null on the old customer row.


-- =====================================================================
-- PART E — ROLLBACK (removes ONLY objects created by 0026)
-- =====================================================================
-- Drops the 9 functions + the unique index. Optionally drops the column
-- (ONLY if you are certain no links exist / no data depends on it). Because
-- 0026 uses a NEW internal resolver name and adds NO base-table policies or
-- grants, this rollback restores the exact pre-0026 state — legacy
-- public.current_customer_id(), all staff policies, and all table grants are
-- untouched by both this migration AND this rollback.
--
-- begin;
--   drop function if exists public.portal_update_contact(text, text, text, text);
--   drop function if exists public.portal_approve_quote(uuid);
--   drop function if exists public.portal_get_invoice(uuid);
--   drop function if exists public.portal_list_invoices(integer, integer);
--   drop function if exists public.portal_get_job(uuid);
--   drop function if exists public.portal_list_jobs(integer, integer);
--   drop function if exists public.portal_get_quote(uuid);
--   drop function if exists public.portal_list_quotes(integer, integer);
--   drop function if exists public._portal_current_customer_id();
--   drop index if exists public.customers_auth_user_id_unique;
--   -- Only if you are certain nothing depends on it:
--   -- alter table public.customers drop column if exists auth_user_id;
-- commit;


-- =====================================================================
-- PART F — LEGACY-RESOLVER HARDENING (revoke EXECUTE; run separately from B)
-- =====================================================================
-- Policy decision (owner): the legacy email-based public.current_customer_id()
-- may NOT remain merely "dormant" indefinitely. This step positively REVOKES
-- EXECUTE from PUBLIC, anon, and authenticated (defense-in-depth; 0006 already
-- revoked it, so this both re-asserts and makes the intent explicit). It does
-- NOT drop the function.
--
-- GATE — run this ONLY after Part A3b/A3c evidence shows the function is safe to
-- restrict, i.e. A3c queries c1–c5 ALL return ZERO rows (nothing depends on it).
-- If any dependency exists, STOP: hardening the grants is still safe, but do NOT
-- proceed to any future drop until each dependent is migrated off it.
--
-- Run as its own statement (NOT inside the Part B transaction):
--   revoke execute on function public.current_customer_id() from public;
--   revoke execute on function public.current_customer_id() from anon;
--   revoke execute on function public.current_customer_id() from authenticated;
--
-- Verify (expect NO public/anon/authenticated EXECUTE rows):
--   select coalesce(array_to_string(p.proacl,' | '),'(default ACL)') as acl
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='current_customer_id';
--
-- DROP is intentionally NOT part of this step. Only after the A3c dependency
-- inventory proves removal is safe (all zero) AND you have saved the exact
-- definition from A3 for reversibility should a drop be considered in a later,
-- separately-approved migration:
--   -- drop function if exists public.current_customer_id();   -- deferred, not now
--
-- Reversal of the revokes (if ever needed): re-grant per the saved prior ACL
-- captured in Part A3b.

