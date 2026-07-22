-- =====================================================================
-- 0006_leads_customers_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 3 prerequisite.
--   PART A: grant hardening for public.leads and public.customers.
--   PART B: tighten public.customers RLS to staff roles (leads RLS is already
--           staff-scoped and is left unchanged).
--
-- WHY (grants): both tables grant anon INSERT/UPDATE/DELETE/TRUNCATE/SELECT and
-- grant authenticated DELETE/TRUNCATE/TRIGGER/REFERENCES. TRUNCATE is a
-- table-level command NOT gated by RLS -> any anon/authenticated caller could
-- wipe these tables. We strip anon/public entirely and remove destructive/DDL
-- privileges from authenticated, keeping ONLY SELECT/INSERT/UPDATE.
--
-- WHY (customers RLS): current customers_company_* policies use is_company_member,
-- so ANY active member (incl. customer/mover/crew_lead) can read/insert/update
-- every internal customer record. We replace them with has_company_role checks
-- using the EXACT existing enum labels. The direct-relationship portal policy
-- customers_customer_self_select (id = current_customer_id()) is PRESERVED.
--
-- Same-company scoping preserved. UPDATE has USING + WITH CHECK. No DELETE policy.
-- Transactional, non-destructive to rows/columns/triggers.
-- =====================================================================

begin;

-- =====================================================================
-- PART A — grant hardening
-- =====================================================================

-- ---- public.leads ----
revoke all on table public.leads from anon;
revoke all on table public.leads from public;
revoke delete, truncate, trigger, references on table public.leads from authenticated;
grant  select, insert, update on table public.leads to authenticated;

-- ---- public.customers ----
revoke all on table public.customers from anon;
revoke all on table public.customers from public;
revoke delete, truncate, trigger, references on table public.customers from authenticated;
grant  select, insert, update on table public.customers to authenticated;

-- =====================================================================
-- PART B — tighten public.customers RLS (staff-role scoped)
--   SELECT: owner, operations_manager, dispatcher, sales
--   INSERT: owner, operations_manager, sales
--   UPDATE: owner, operations_manager, sales
--   PRESERVE customers_customer_self_select (portal direct relationship).
--   No client DELETE policy.
-- =====================================================================

-- Replace broad-membership SELECT with staff-role SELECT.
drop policy if exists "customers_company_select" on public.customers;
create policy "customers_company_select"
on public.customers for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

-- Replace broad-membership INSERT with staff-role INSERT.
drop policy if exists "customers_company_insert" on public.customers;
create policy "customers_company_insert"
on public.customers for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','sales']::public.user_role[]
  )
);

-- Replace broad-membership UPDATE with staff-role UPDATE (USING + WITH CHECK).
drop policy if exists "customers_company_update" on public.customers;
create policy "customers_company_update"
on public.customers for update to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','sales']::public.user_role[]
  )
)
with check (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','sales']::public.user_role[]
  )
);

-- NOTE: customers_customer_self_select is intentionally NOT modified.

commit;
