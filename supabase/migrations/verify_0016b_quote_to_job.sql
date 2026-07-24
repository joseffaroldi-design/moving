-- =====================================================================
-- verify_0016b_quote_to_job.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0016b. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- Confirms:
--   * partial UNIQUE index on jobs.quote_id (WHERE quote_id IS NOT NULL).
--   * zero existing duplicate quote_id -> job mappings.
--   * next_job_number + _require_job_converter: SECURITY DEFINER, pinned
--     search_path, EXECUTE UNAVAILABLE to public/anon/authenticated.
--   * convert_quote_to_job: SECURITY DEFINER, pinned search_path, EXECUTE
--     granted to authenticated ONLY (not public/anon).
--   * job tables remain locked (jobs authenticated = SELECT only; still forced RLS).
--
-- PASS CRITERIA (summary):
--   quote_id_unique_index_present            = 1
--   quote_id_index_is_partial                = true
--   jobs_quote_id_duplicate_count            = 0
--   next_job_number_is_definer               = true
--   next_job_number_pinned_search_path       = true
--   next_job_number_client_execute_count     = 0
--   require_converter_is_definer             = true
--   require_converter_pinned_search_path     = true
--   require_converter_client_execute_count   = 0
--   convert_rpc_is_definer                   = true
--   convert_rpc_pinned_search_path           = true
--   convert_rpc_authenticated_execute        = true
--   convert_rpc_anon_or_public_execute_count = 0
--   jobs_authenticated_nonselect_priv_count  = 0
--   jobs_rls_forced                          = true
-- =====================================================================

with fns as (
  select p.oid, p.proname, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('next_job_number','_require_job_converter','convert_quote_to_job')
),
convert_oid as (select oid from fns where proname = 'convert_quote_to_job' limit 1),
nextnum_oid as (select oid from fns where proname = 'next_job_number' limit 1),
require_oid as (select oid from fns where proname = '_require_job_converter' limit 1)
select jsonb_pretty(jsonb_build_object(

  'summary', jsonb_build_object(

    'quote_id_unique_index_present', (
      select count(*) from pg_indexes
      where schemaname = 'public' and tablename = 'jobs' and indexname = 'jobs_quote_id_unique'
    ),
    'quote_id_index_is_partial', (
      select coalesce(bool_or(indexdef ilike '%where%quote_id is not null%'), false)
      from pg_indexes
      where schemaname = 'public' and tablename = 'jobs' and indexname = 'jobs_quote_id_unique'
    ),
    'jobs_quote_id_duplicate_count', (
      select count(*) from (
        select quote_id from public.jobs where quote_id is not null
        group by quote_id having count(*) > 1
      ) d
    ),

    'next_job_number_is_definer', (select prosecdef from fns where proname='next_job_number'),
    'next_job_number_pinned_search_path', (select cfg like '%search_path=public, pg_temp%' from fns where proname='next_job_number'),
    'next_job_number_client_execute_count', (
      select (has_function_privilege('public',      (select oid from nextnum_oid), 'EXECUTE'))::int
           + (has_function_privilege('anon',        (select oid from nextnum_oid), 'EXECUTE'))::int
           + (has_function_privilege('authenticated',(select oid from nextnum_oid), 'EXECUTE'))::int
    ),

    'require_converter_is_definer', (select prosecdef from fns where proname='_require_job_converter'),
    'require_converter_pinned_search_path', (select cfg like '%search_path=public, pg_temp%' from fns where proname='_require_job_converter'),
    'require_converter_client_execute_count', (
      select (has_function_privilege('public',      (select oid from require_oid), 'EXECUTE'))::int
           + (has_function_privilege('anon',        (select oid from require_oid), 'EXECUTE'))::int
           + (has_function_privilege('authenticated',(select oid from require_oid), 'EXECUTE'))::int
    ),

    'convert_rpc_is_definer', (select prosecdef from fns where proname='convert_quote_to_job'),
    'convert_rpc_pinned_search_path', (select cfg like '%search_path=public, pg_temp%' from fns where proname='convert_quote_to_job'),
    'convert_rpc_authenticated_execute', (select has_function_privilege('authenticated', (select oid from convert_oid), 'EXECUTE')),
    'convert_rpc_anon_or_public_execute_count', (
      select (has_function_privilege('public', (select oid from convert_oid), 'EXECUTE'))::int
           + (has_function_privilege('anon',   (select oid from convert_oid), 'EXECUTE'))::int
    ),

    'jobs_authenticated_nonselect_priv_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name='jobs'
        and grantee='authenticated' and privilege_type <> 'SELECT'
    ),
    'jobs_rls_forced', (
      select c.relforcerowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='jobs'
    )
  ),

  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', proname, 'security_definer', prosecdef, 'config', cfg,
      'exec_public', has_function_privilege('public', oid, 'EXECUTE'),
      'exec_anon', has_function_privilege('anon', oid, 'EXECUTE'),
      'exec_authenticated', has_function_privilege('authenticated', oid, 'EXECUTE')
    ) order by proname)
    from fns
  ), '[]'::jsonb),

  'jobs_quote_id_index_def', (
    select indexdef from pg_indexes
    where schemaname='public' and tablename='jobs' and indexname='jobs_quote_id_unique'
  )

)) as verify_0016b;
