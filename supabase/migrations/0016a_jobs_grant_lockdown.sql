-- =====================================================================
-- 0016a_jobs_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 5 (Jobs) P0 SECURITY LOCKDOWN.
--
-- Closes the critical gap found in the Jobs preflight:
--   * anon AND authenticated held DELETE/INSERT/REFERENCES/SELECT/TRIGGER/
--     TRUNCATE/UPDATE on ALL job tables (incl. TRUNCATE, which RLS does NOT
--     gate) and on the job_profitability VIEW.
--   * RLS was ENABLED but NOT FORCED on the 8 job tables.
--   * broad policies used is_company_member(...) / can_dispatch_company(...)
--     / can_manage_company(...) and FOR ALL write policies, letting ANY
--     company member (incl. customer/mover/crew_lead) read/mutate job data.
--
-- End state (this migration), on exactly 8 ORDINARY TABLES:
--     jobs, job_checklists, job_crew, job_expenses, job_photos,
--     job_status_events, job_stops, job_trucks
--   * anon + PUBLIC: NO privileges.
--   * authenticated: SELECT ONLY (RLS staff-scoped). No INSERT/UPDATE/
--     DELETE/TRUNCATE/TRIGGER/REFERENCES. All writes go through future
--     SECURITY DEFINER RPCs (0016b+), mirroring the quotes model (0014).
--   * ALL existing policies dropped and replaced with exactly ONE staff-only
--     SELECT policy per table. RLS ENABLED and FORCED on all 8.
--   * Operational reads (jobs + 5 non-financial children): staff roles
--     owner, operations_manager, dispatcher, sales.
--   * job_crew + job_trucks (no own company_id) authorize via parent jobs.
--   * job_expenses (financial): owner + operations_manager only, gated on
--     its OWN company_id; when job_id is non-null the parent job's
--     company_id must match (company-level expenses with job_id NULL stay
--     visible to authorized financial users).
--
-- job_profitability is a VIEW (owner postgres, security_invoker=true) that
-- depends on jobs, quotes, invoices, job_expenses, payroll_entries. invoices
-- and payroll_entries are NOT security-audited in this phase, so we do NOT
-- recreate/alter the view here. We ONLY strip all client access (anon,
-- PUBLIC, authenticated) to prevent partial/misleading financials via
-- underlying RLS. Access is restored in a later phase after invoices +
-- payroll_entries get their own grant/RLS lockdown.
--
-- Transactional. Additive/non-destructive: no columns, no rows, no view
-- definition or owner changes. Aborts if any existing job_expenses row with
-- a non-null job_id points to a job in a DIFFERENT company (must be resolved
-- explicitly, never silently hidden). postgres / service_role administrative
-- grants are left untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. TRANSACTIONAL SAFETY CHECK — job_expenses / parent-job company match
--    Aborts the whole migration if any non-null job_id references a job in
--    a different company. We never silently hide or modify such rows.
-- ---------------------------------------------------------------------
do $$
declare
  mismatch_count integer;
begin
  select count(*)
    into mismatch_count
  from public.job_expenses e
  join public.jobs j on j.id = e.job_id
  where e.job_id is not null
    and e.company_id <> j.company_id;

  if mismatch_count > 0 then
    raise exception
      'ABORT 0016a: % job_expenses row(s) have company_id <> parent job.company_id. Resolve these explicitly before lockdown.',
      mismatch_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. GRANT LOCKDOWN — 8 ordinary tables
--    Strip anon + PUBLIC entirely; reduce authenticated to SELECT only.
-- ---------------------------------------------------------------------
-- jobs
revoke all on table public.jobs               from anon;
revoke all on table public.jobs               from public;
revoke all on table public.jobs               from authenticated;
grant  select on table public.jobs             to authenticated;

-- job_checklists
revoke all on table public.job_checklists     from anon;
revoke all on table public.job_checklists     from public;
revoke all on table public.job_checklists     from authenticated;
grant  select on table public.job_checklists   to authenticated;

-- job_crew
revoke all on table public.job_crew           from anon;
revoke all on table public.job_crew           from public;
revoke all on table public.job_crew           from authenticated;
grant  select on table public.job_crew         to authenticated;

-- job_expenses
revoke all on table public.job_expenses       from anon;
revoke all on table public.job_expenses       from public;
revoke all on table public.job_expenses       from authenticated;
grant  select on table public.job_expenses     to authenticated;

-- job_photos
revoke all on table public.job_photos         from anon;
revoke all on table public.job_photos         from public;
revoke all on table public.job_photos         from authenticated;
grant  select on table public.job_photos       to authenticated;

-- job_status_events
revoke all on table public.job_status_events  from anon;
revoke all on table public.job_status_events  from public;
revoke all on table public.job_status_events  from authenticated;
grant  select on table public.job_status_events to authenticated;

-- job_stops
revoke all on table public.job_stops          from anon;
revoke all on table public.job_stops          from public;
revoke all on table public.job_stops          from authenticated;
grant  select on table public.job_stops        to authenticated;

-- job_trucks
revoke all on table public.job_trucks         from anon;
revoke all on table public.job_trucks         from public;
revoke all on table public.job_trucks         from authenticated;
grant  select on table public.job_trucks       to authenticated;

-- ---------------------------------------------------------------------
-- 1b. GRANT LOCKDOWN — job_profitability VIEW (revoke only; no re-grant)
--     Deferred: authenticated SELECT + guarded RPC restored in a later
--     phase after invoices + payroll_entries lockdown.
-- ---------------------------------------------------------------------
revoke all on table public.job_profitability  from anon;
revoke all on table public.job_profitability  from public;
revoke all on table public.job_profitability  from authenticated;

-- ---------------------------------------------------------------------
-- 2. DROP ALL EXISTING POLICIES on the 8 tables (deterministic clean slate)
--    Removes is_company_member / can_dispatch_company / can_manage_company
--    SELECT policies and every FOR ALL write policy. Writes are already
--    impossible for authenticated after step 1, regardless of policies.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'jobs','job_checklists','job_crew','job_expenses',
        'job_photos','job_status_events','job_stops','job_trucks'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ENABLE + FORCE RLS on all 8 tables
-- ---------------------------------------------------------------------
alter table public.jobs               enable row level security;
alter table public.jobs               force  row level security;
alter table public.job_checklists     enable row level security;
alter table public.job_checklists     force  row level security;
alter table public.job_crew           enable row level security;
alter table public.job_crew           force  row level security;
alter table public.job_expenses       enable row level security;
alter table public.job_expenses       force  row level security;
alter table public.job_photos         enable row level security;
alter table public.job_photos         force  row level security;
alter table public.job_status_events  enable row level security;
alter table public.job_status_events  force  row level security;
alter table public.job_stops          enable row level security;
alter table public.job_stops          force  row level security;
alter table public.job_trucks         enable row level security;
alter table public.job_trucks         force  row level security;

-- ---------------------------------------------------------------------
-- 4. STAFF-ONLY SELECT POLICIES (exactly one per table)
-- ---------------------------------------------------------------------

-- 4.1 jobs: staff of the owning company.
create policy jobs_staff_select
  on public.jobs
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- 4.2 job_checklists: has own company_id (NOT NULL) -> gate directly.
create policy job_checklists_staff_select
  on public.job_checklists
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- 4.3 job_crew: NO own company_id -> authorize via parent job.
create policy job_crew_staff_select
  on public.job_crew
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_crew.job_id
        and public.has_company_role(
              j.company_id,
              array['owner','operations_manager','dispatcher','sales']::public.user_role[]
            )
    )
  );

-- 4.4 job_photos: has own company_id (NOT NULL) -> gate directly.
create policy job_photos_staff_select
  on public.job_photos
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- 4.5 job_status_events: has own company_id (NOT NULL) -> gate directly.
create policy job_status_events_staff_select
  on public.job_status_events
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- 4.6 job_stops: has own company_id (NOT NULL) -> gate directly.
create policy job_stops_staff_select
  on public.job_stops
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- 4.7 job_trucks: NO own company_id -> authorize via parent job.
create policy job_trucks_staff_select
  on public.job_trucks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_trucks.job_id
        and public.has_company_role(
              j.company_id,
              array['owner','operations_manager','dispatcher','sales']::public.user_role[]
            )
    )
  );

-- 4.8 job_expenses (FINANCIAL): owner + operations_manager only, gated on
--     its OWN company_id. When job_id is non-null, the parent job's
--     company_id must match (guaranteed non-mismatch by step 0). Rows with
--     job_id NULL (company-level expenses) remain visible to these roles.
create policy job_expenses_finance_select
  on public.job_expenses
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager']::public.user_role[]
    )
    and (
      job_expenses.job_id is null
      or exists (
        select 1
        from public.jobs j
        where j.id = job_expenses.job_id
          and j.company_id = job_expenses.company_id
      )
    )
  );

commit;
