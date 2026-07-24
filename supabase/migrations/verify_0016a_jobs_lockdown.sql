-- =====================================================================
-- verify_0016a_jobs_lockdown.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0016a. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- Confirms the end state:
--   * anon + PUBLIC: ZERO privileges on all 8 tables AND the view.
--   * authenticated: SELECT ONLY on the 8 tables; ZERO on the view.
--   * RLS enabled AND forced on all 8 tables.
--   * exactly one SELECT-only policy per table (no INSERT/UPDATE/DELETE/ALL).
--   * each policy's roles + USING expression.
--   * rows preserved (counts) and no job_expenses/company mismatches remain.
--
-- PASS CRITERIA (quick read):
--   summary.anon_or_public_privilege_count            = 0
--   summary.authenticated_non_select_table_priv_count = 0
--   summary.authenticated_view_privilege_count        = 0
--   summary.tables_rls_forced_count                   = 8
--   summary.tables_rls_enabled_count                  = 8
--   summary.select_policy_count                       = 8
--   summary.non_select_policy_count                   = 0
--   summary.job_expenses_company_mismatch_count       = 0
-- =====================================================================

with tbls(relname) as (
  values
    ('jobs'), ('job_checklists'), ('job_crew'), ('job_expenses'),
    ('job_photos'), ('job_status_events'), ('job_stops'), ('job_trucks')
),
allrels(relname) as (
  select relname from tbls
  union all
  select 'job_profitability'
)
select jsonb_pretty(jsonb_build_object(

  -- ---- Machine-checkable summary (all must equal the PASS values) ----
  'summary', jsonb_build_object(

    'anon_or_public_privilege_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (select relname from allrels)
        and grantee in ('anon','public','PUBLIC')
    ),

    'authenticated_non_select_table_priv_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (select relname from tbls)
        and grantee = 'authenticated'
        and privilege_type <> 'SELECT'
    ),

    'authenticated_view_privilege_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'job_profitability'
        and grantee = 'authenticated'
    ),

    'tables_rls_enabled_count', (
      select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (select relname from tbls)
        and c.relrowsecurity
    ),

    'tables_rls_forced_count', (
      select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (select relname from tbls)
        and c.relforcerowsecurity
    ),

    'select_policy_count', (
      select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (select relname from tbls)
        and cmd = 'SELECT'
    ),

    'non_select_policy_count', (
      select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in (select relname from tbls)
        and cmd <> 'SELECT'
    ),

    'job_expenses_company_mismatch_count', (
      select count(*) from public.job_expenses e
      join public.jobs j on j.id = e.job_id
      where e.job_id is not null and e.company_id <> j.company_id
    )
  ),

  -- ---- Full detail for auditing ----
  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'grantee', grantee, 'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (select relname from allrels)
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  'rls_state', coalesce((
    select jsonb_agg(jsonb_build_object(
      'relation', c.relname, 'relkind', c.relkind,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (select relname from allrels)
  ), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in (select relname from tbls)
  ), '[]'::jsonb),

  'row_counts', jsonb_build_object(
    'jobs',              (select count(*) from public.jobs),
    'job_checklists',    (select count(*) from public.job_checklists),
    'job_crew',          (select count(*) from public.job_crew),
    'job_expenses',      (select count(*) from public.job_expenses),
    'job_photos',        (select count(*) from public.job_photos),
    'job_status_events', (select count(*) from public.job_status_events),
    'job_stops',         (select count(*) from public.job_stops),
    'job_trucks',        (select count(*) from public.job_trucks),
    'job_profitability', (select count(*) from public.job_profitability)
  )

)) as verify_0016a;
