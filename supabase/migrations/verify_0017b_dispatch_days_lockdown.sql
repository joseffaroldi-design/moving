-- =====================================================================
-- verify_0017b_dispatch_days_lockdown.sql   (READ-ONLY — no writes, no DDL)
-- Run AFTER 0017b. Returns ONE pretty-printed JSON blob. Paste it back.
--
-- PASS CRITERIA (summary):
--   anon_or_public_privilege_count      = 0
--   authenticated_non_select_priv_count = 0
--   rls_enabled                         = true
--   rls_forced                          = true
--   select_policy_count                 = 1
--   non_select_policy_count             = 0
--   trigger_count                       = 1   (set_dispatch_days_updated_at preserved)
--   index_count                         = 4   (pkey + unique + 2 idx preserved)
--   dispatch_days_row_count             = 1   (preserved)
--   dispatch_assignments_row_count      = 1   (linked row preserved)
-- =====================================================================

select jsonb_pretty(jsonb_build_object(

  'summary', jsonb_build_object(
    'anon_or_public_privilege_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name='dispatch_days'
        and grantee in ('anon','public','PUBLIC')
    ),
    'authenticated_non_select_priv_count', (
      select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name='dispatch_days'
        and grantee='authenticated' and privilege_type <> 'SELECT'
    ),
    'rls_enabled', (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relname='dispatch_days'),
    'rls_forced', (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname='dispatch_days'),
    'select_policy_count', (select count(*) from pg_policies
      where schemaname='public' and tablename='dispatch_days' and cmd='SELECT'),
    'non_select_policy_count', (select count(*) from pg_policies
      where schemaname='public' and tablename='dispatch_days' and cmd<>'SELECT'),
    'trigger_count', (select count(*) from pg_trigger tg join pg_class rel on rel.oid=tg.tgrelid
      join pg_namespace n on n.oid=rel.relnamespace
      where n.nspname='public' and rel.relname='dispatch_days' and not tg.tgisinternal),
    'index_count', (select count(*) from pg_indexes where schemaname='public' and tablename='dispatch_days'),
    'dispatch_days_row_count', (select count(*) from public.dispatch_days),
    'dispatch_assignments_row_count', (select count(*) from public.dispatch_assignments)
  ),

  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type)
      order by grantee,privilege_type)
    from information_schema.role_table_grants
    where table_schema='public' and table_name='dispatch_days'
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  'rls_state', (
    select jsonb_build_object('relation',c.relname,'relkind',c.relkind,
      'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='dispatch_days'
  ),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object('policy',policyname,'permissive',permissive,
      'roles',roles,'cmd',cmd,'using',qual,'with_check',with_check) order by policyname)
    from pg_policies where schemaname='public' and tablename='dispatch_days'
  ), '[]'::jsonb),

  'indexes_preserved', coalesce((
    select jsonb_agg(indexname order by indexname)
    from pg_indexes where schemaname='public' and tablename='dispatch_days'
  ), '[]'::jsonb),

  'triggers_preserved', coalesce((
    select jsonb_agg(tg.tgname order by tg.tgname)
    from pg_trigger tg join pg_class rel on rel.oid=tg.tgrelid join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and rel.relname='dispatch_days' and not tg.tgisinternal
  ), '[]'::jsonb)

)) as verify_0017b;
