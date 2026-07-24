-- =====================================================================
-- verify_0017c_job_status_transitions.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0017c. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- PASS CRITERIA (summary):
--   require_setter_is_definer                = true
--   require_setter_pinned_search_path        = true
--   require_setter_client_execute_count      = 0
--   set_job_status_is_definer                = true
--   set_job_status_pinned_search_path        = true
--   set_job_status_authenticated_execute     = true
--   set_job_status_anon_or_public_exec_count = 0
--   jobs_authenticated_nonselect_priv_count  = 0   (jobs still SELECT-only)
--   jobs_rls_forced                          = true
-- =====================================================================

with fns as (
  select p.oid, p.proname, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('_require_job_status_setter','set_job_status')
),
setter_oid as (select oid from fns where proname='set_job_status' limit 1),
guard_oid  as (select oid from fns where proname='_require_job_status_setter' limit 1)
select jsonb_pretty(jsonb_build_object(
  'summary', jsonb_build_object(
    'require_setter_is_definer', (select prosecdef from fns where proname='_require_job_status_setter'),
    'require_setter_pinned_search_path', (select cfg like '%search_path=public, pg_temp%' from fns where proname='_require_job_status_setter'),
    'require_setter_client_execute_count', (
       select (has_function_privilege('public',(select oid from guard_oid),'EXECUTE'))::int
            + (has_function_privilege('anon',(select oid from guard_oid),'EXECUTE'))::int
            + (has_function_privilege('authenticated',(select oid from guard_oid),'EXECUTE'))::int),
    'set_job_status_is_definer', (select prosecdef from fns where proname='set_job_status'),
    'set_job_status_pinned_search_path', (select cfg like '%search_path=public, pg_temp%' from fns where proname='set_job_status'),
    'set_job_status_authenticated_execute', (select has_function_privilege('authenticated',(select oid from setter_oid),'EXECUTE')),
    'set_job_status_anon_or_public_exec_count', (
       select (has_function_privilege('public',(select oid from setter_oid),'EXECUTE'))::int
            + (has_function_privilege('anon',(select oid from setter_oid),'EXECUTE'))::int),
    'jobs_authenticated_nonselect_priv_count', (select count(*) from information_schema.role_table_grants
       where table_schema='public' and table_name='jobs' and grantee='authenticated' and privilege_type<>'SELECT'),
    'jobs_rls_forced', (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='jobs')
  ),
  'functions', coalesce((select jsonb_agg(jsonb_build_object(
      'name',proname,'security_definer',prosecdef,'config',cfg,
      'exec_public',has_function_privilege('public',oid,'EXECUTE'),
      'exec_anon',has_function_privilege('anon',oid,'EXECUTE'),
      'exec_authenticated',has_function_privilege('authenticated',oid,'EXECUTE')) order by proname) from fns),'[]'::jsonb)
)) as verify_0017c;
