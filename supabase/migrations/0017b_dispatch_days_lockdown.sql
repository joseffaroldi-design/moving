-- =====================================================================
-- 0017b_dispatch_days_lockdown.sql
-- Southern Magnolia Movers — Phase 6 (Dispatch) P0 SECURITY LOCKDOWN.
--
-- Closes the last open dispatch P0 (mirrors 0017a / 0016a):
--   * anon AND authenticated held DELETE/INSERT/REFERENCES/SELECT/TRIGGER/
--     TRUNCATE/UPDATE on public.dispatch_days.
--   * RLS was ENABLED but NOT FORCED.
--   * write policies (dispatch_days_dispatch_insert/update) call
--     can_dispatch_company(), which authenticated CANNOT execute -> broken
--     direct writes. All writes move to future SECURITY DEFINER RPCs (0017d).
--   * read policy used is_company_member() (any member) -> staff-only SELECT.
--
-- End state (ordinary table public.dispatch_days):
--   * anon + PUBLIC: NO privileges.
--   * authenticated: SELECT ONLY (RLS staff-scoped). No INSERT/UPDATE/
--     DELETE/TRUNCATE/TRIGGER/REFERENCES.
--   * ALL existing policies dropped; exactly ONE staff SELECT policy gated on
--     the table's own company_id via has_company_role
--     {owner, operations_manager, dispatcher, sales}. RLS ENABLED + FORCED.
--
-- Transactional, non-destructive: constraints, indexes, the
-- set_dispatch_days_updated_at trigger, columns, and rows are untouched.
-- Preserves the 1 existing dispatch_day and its linked assignment (FK
-- ON DELETE CASCADE is not exercised — no deletes here).
-- postgres / service_role administrative grants untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. GRANT LOCKDOWN
-- ---------------------------------------------------------------------
revoke all on table public.dispatch_days from anon;
revoke all on table public.dispatch_days from public;
revoke all on table public.dispatch_days from authenticated;
grant  select on table public.dispatch_days to authenticated;

-- ---------------------------------------------------------------------
-- 2. DROP ALL EXISTING POLICIES (deterministic clean slate)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'dispatch_days'
  loop
    execute format('drop policy if exists %I on public.dispatch_days', r.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ENABLE + FORCE RLS
-- ---------------------------------------------------------------------
alter table public.dispatch_days enable row level security;
alter table public.dispatch_days force  row level security;

-- ---------------------------------------------------------------------
-- 4. STAFF-ONLY SELECT POLICY (own company_id)
-- ---------------------------------------------------------------------
create policy dispatch_days_staff_select
  on public.dispatch_days
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

commit;
