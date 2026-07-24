-- =====================================================================
-- 0017a_trucks_dispatch_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 6 (Dispatch) P0 SECURITY LOCKDOWN.
--
-- Closes the gap found in the dispatch preflight (mirrors 0016a):
--   * anon AND authenticated held DELETE/INSERT/REFERENCES/SELECT/TRIGGER/
--     TRUNCATE/UPDATE on public.trucks AND public.dispatch_assignments.
--   * RLS was ENABLED but NOT FORCED on both.
--   * write policies (trucks_dispatch_insert/update,
--     dispatch_assignments_dispatch_insert/update) call
--     can_dispatch_company(), which authenticated CANNOT execute -> those
--     direct writes error anyway. All writes move to future SECURITY DEFINER
--     RPCs (0017b/0017c), so these broken policies are dropped.
--   * read policies used is_company_member() (any member incl.
--     customer/mover/crew_lead) -> replaced with staff-only SELECT.
--
-- End state (both ORDINARY TABLES: trucks, dispatch_assignments):
--   * anon + PUBLIC: NO privileges.
--   * authenticated: SELECT ONLY (RLS staff-scoped). No INSERT/UPDATE/
--     DELETE/TRUNCATE/TRIGGER/REFERENCES.
--   * ALL existing policies dropped; exactly ONE staff SELECT policy per
--     table gated on the table's own company_id via has_company_role
--     {owner, operations_manager, dispatcher, sales}. RLS ENABLED + FORCED.
--
-- Transactional, non-destructive: no columns/rows/triggers/enums changed.
-- Preserves the 3 trucks and the 1 existing dispatch assignment.
-- postgres / service_role administrative grants untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. GRANT LOCKDOWN
-- ---------------------------------------------------------------------
revoke all on table public.trucks               from anon;
revoke all on table public.trucks               from public;
revoke all on table public.trucks               from authenticated;
grant  select on table public.trucks             to authenticated;

revoke all on table public.dispatch_assignments from anon;
revoke all on table public.dispatch_assignments from public;
revoke all on table public.dispatch_assignments from authenticated;
grant  select on table public.dispatch_assignments to authenticated;

-- ---------------------------------------------------------------------
-- 2. DROP ALL EXISTING POLICIES (deterministic clean slate)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('trucks', 'dispatch_assignments')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ENABLE + FORCE RLS
-- ---------------------------------------------------------------------
alter table public.trucks               enable row level security;
alter table public.trucks               force  row level security;
alter table public.dispatch_assignments enable row level security;
alter table public.dispatch_assignments force  row level security;

-- ---------------------------------------------------------------------
-- 4. STAFF-ONLY SELECT POLICIES (own company_id; exactly one per table)
-- ---------------------------------------------------------------------
create policy trucks_staff_select
  on public.trucks
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

create policy dispatch_assignments_staff_select
  on public.dispatch_assignments
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

commit;
