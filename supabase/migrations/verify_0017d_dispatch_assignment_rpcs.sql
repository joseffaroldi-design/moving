-- =====================================================================
-- verify_0017d_dispatch_assignment_rpcs.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0017d. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- PASS CRITERIA (summary):
--   guard_client_execute_count               = 0   (_require_dispatcher internal)
--   rpc_count                                = 3   (assign/set_job_crew/set_job_trucks)
--   all_rpcs_definer                         = true
--   all_rpcs_pinned_search_path              = true
--   all_rpcs_authenticated_execute           = true
--   rpcs_anon_or_public_execute_count        = 0
--   locked_tables_authenticated_nonselect    = 0   (job_crew/job_trucks/dispatch_assignments/dispatch_days)
--   locked_tables_rls_forced_count           = 4
-- =====================================================================

with fns as (
  select p.oid, p.proname, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('_require_dispatcher','assign_job_to_dispatch','set_job_crew','set_job_trucks')
),
rpcs as (select * from fns where proname <> '_require_dispatcher'),
guard as (select oid from fns where proname='_require_dispatcher' limit 1),
locked(relname) as (values ('job_crew'),('job_trucks'),('dispatch_assignments'),('dispatch_days'))
select jsonb_pretty(jsonb_build_object(
  'summary', jsonb_build_object(
    'guard_client_execute_count', (
       select (has_function_privilege('public',(select oid from guard),'EXECUTE'))::int
            + (has_function_privilege('anon',(select oid from guard),'EXECUTE'))::int
            + (has_function_privilege('authenticated',(select oid from guard),'EXECUTE'))::int),
    'rpc_count', (select count(*) from rpcs),
    'all_rpcs_definer', (select bool_and(prosecdef) from rpcs),
    'all_rpcs_pinned_search_path', (select bool_and(cfg like '%search_path=public, pg_temp%') from rpcs),
    'all_rpcs_authenticated_execute', (select bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) from rpcs),
    'rpcs_anon_or_public_execute_count', (
       select coalesce(sum( (has_function_privilege('public',oid,'EXECUTE'))::int
                          + (has_function_privilege('anon',oid,'EXECUTE'))::int ),0) from rpcs),
    'locked_tables_authenticated_nonselect', (
       select count(*) from information_schema.role_table_grants
       where table_schema='public' and table_name in (select relname from locked)
         and grantee='authenticated' and privilege_type <> 'SELECT'),
    'locked_tables_rls_forced_count', (
       select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname in (select relname from locked) and c.relforcerowsecurity)
  ),
  'functions', coalesce((select jsonb_agg(jsonb_build_object(
      'name',proname,'security_definer',prosecdef,'config',cfg,
      'exec_public',has_function_privilege('public',oid,'EXECUTE'),
      'exec_anon',has_function_privilege('anon',oid,'EXECUTE'),
      'exec_authenticated',has_function_privilege('authenticated',oid,'EXECUTE')) order by proname) from fns),'[]'::jsonb)
)) as verify_0017d;
