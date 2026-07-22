-- =====================================================================
-- 0006_leads_customers_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 3 prerequisite.
--   PART A: grant hardening for public.leads and public.customers.
--   PART B: helper-function EXECUTE grants (defense in depth).
--   PART C: staff-only RLS for public.leads (SELECT/INSERT/UPDATE).
--   PART D: staff-only RLS for public.customers; drop weak self-select.
--
-- Rationale:
--  * anon/authenticated held destructive/DDL + TRUNCATE (RLS does not gate
--    TRUNCATE) -> strip to SELECT/INSERT/UPDATE only.
--  * has_company_role / current_customer_id are SECURITY DEFINER w/ pinned
--    search_path but authenticated lacked EXECUTE on has_company_role.
--  * leads_company_select used is_company_member -> ANY member (incl.
--    customer/mover/crew_lead) could read every lead. Replace with staff-only.
--  * customers_customer_self_select relied on email + LIMIT 1 (weak). Drop it;
--    keep current_customer_id NON-executable by clients until the Customer
--    Portal phase introduces a verified user<->customer mapping.
--
-- Transactional, non-destructive to rows/columns/triggers.
-- =====================================================================

begin;

-- =====================================================================
-- PART A — grant hardening
-- =====================================================================
revoke all on table public.leads from anon;
revoke all on table public.leads from public;
revoke delete, truncate, trigger, references on table public.leads from authenticated;
grant  select, insert, update on table public.leads to authenticated;

revoke all on table public.customers from anon;
revoke all on table public.customers from public;
revoke delete, truncate, trigger, references on table public.customers from authenticated;
grant  select, insert, update on table public.customers to authenticated;

-- =====================================================================
-- PART B — helper-function EXECUTE grants
--   has_company_role: read-only, checks auth.uid() + active membership,
--   SECURITY DEFINER with pinned search_path -> safe for authenticated.
--   current_customer_id: keep OFF from clients (email+LIMIT 1 is too weak);
--   revoke from PUBLIC/anon as defense in depth; do NOT grant authenticated.
-- =====================================================================
revoke execute on function public.has_company_role(uuid, public.user_role[]) from public;
revoke execute on function public.has_company_role(uuid, public.user_role[]) from anon;
grant  execute on function public.has_company_role(uuid, public.user_role[]) to authenticated;

revoke execute on function public.current_customer_id() from public;
revoke execute on function public.current_customer_id() from anon;
-- (No grant to authenticated: intentionally unavailable until the Portal phase.)

-- =====================================================================
-- PART C — public.leads staff-only RLS (SELECT/INSERT/UPDATE)
--   Approved staff: owner, operations_manager, dispatcher, sales.
-- =====================================================================
drop policy if exists "leads_company_select" on public.leads;
create policy "leads_company_select"
on public.leads for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

drop policy if exists "leads_staff_insert" on public.leads;
create policy "leads_staff_insert"
on public.leads for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

drop policy if exists "leads_staff_update" on public.leads;
create policy "leads_staff_update"
on public.leads for update to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
)
with check (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

-- =====================================================================
-- PART D — public.customers staff-only RLS; drop weak self-select
--   SELECT: owner, operations_manager, dispatcher, sales
--   INSERT/UPDATE: owner, operations_manager, sales
-- =====================================================================
drop policy if exists "customers_customer_self_select" on public.customers;

drop policy if exists "customers_company_select" on public.customers;
create policy "customers_company_select"
on public.customers for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

drop policy if exists "customers_company_insert" on public.customers;
create policy "customers_company_insert"
on public.customers for insert to authenticated
with check (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','sales']::public.user_role[]
  )
);

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

-- No DELETE policy on leads or customers; no client DELETE grant.

commit;
