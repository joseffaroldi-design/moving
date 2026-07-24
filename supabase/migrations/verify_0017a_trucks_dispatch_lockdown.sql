-- =====================================================================
-- verify_0017a_trucks_dispatch_lockdown.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0017a. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- PASS CRITERIA (summary):
--   anon_or_public_privilege_count            = 0
--   authenticated_non_select_priv_count       = 0
--   tables_rls_enabled_count                  = 2
--   tables_rls_forced_count                   = 2
--   select_policy_count                       = 2
--   non_select_policy_count                   = 0
--   trucks_row_count                          = 3   (preserved)
--   dispatch_assignments_row_count            = 1   (preserved)
-- =====================================================================

with tbls(relname) as ( values ('trucks'), ('dispatch_assignments') )
select jsonb_pretty(jsonb_build_object(

  'summary', jsonb_build_object(
    'anon_or_public_privilege_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name in (select relname from tbls)
        and grantee in ('anon','public','PUBLIC')
    ),
    'authenticated_non_select_priv_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name in (select relname from tbls)
        and grantee='authenticated' and privilege_type <> 'SELECT'
    ),
    'tables_rls_enabled_count', (
      select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (select relname from tbls) and c.relrowsecurity
    ),
    'tables_rls_forced_count', (
      select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (select relname from tbls) and c.relforcerowsecurity
    ),
    'select_policy_count', (
      select count(*) from pg_policies
      where schemaname='public' and tablename in (select relname from tbls) and cmd='SELECT'
    ),
    'non_select_policy_count', (
      select count(*) from pg_policies
      where schemaname='public' and tablename in (select relname from tbls) and cmd<>'SELECT'
    ),
    'trucks_row_count', (select count(*) from public.trucks),
    'dispatch_assignments_row_count', (select count(*) from public.dispatch_assignments)
  ),

  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type)
      order by table_name,grantee,privilege_type)
    from information_schema.role_table_grants
    where table_schema='public' and table_name in (select relname from tbls)
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  'rls_state', coalesce((
    select jsonb_agg(jsonb_build_object('relation',c.relname,'relkind',c.relkind,
      'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (select relname from tbls)
  ), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'permissive',permissive,
      'roles',roles,'cmd',cmd,'using',qual,'with_check',with_check) order by tablename,policyname)
    from pg_policies
    where schemaname='public' and tablename in (select relname from tbls)
  ), '[]'::jsonb)

)) as verify_0017a;
