-- =====================================================================
-- preflight_0011_quotes.sql  (READ-ONLY — no writes, no DDL)
-- Phase 4 (Quotes) comprehensive schema inspection. Returns ONE
-- pretty-printed JSON blob. Run in Supabase SQL Editor and paste the
-- single result back.
--
-- Revision: every jsonb_agg wrapped in coalesce(..., '[]'::jsonb) so
-- missing optional tables/functions yield [] not null. Direct row counts
-- kept ONLY for confirmed tables (quotes, jobs); everything else is
-- discovered via pg_stat_user_tables (no reference to possibly-missing
-- relations). No customer PII selected.
-- =====================================================================

select jsonb_pretty(jsonb_build_object(

  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'ordinal', c.ordinal_position,
      'column', c.column_name, 'data_type', c.data_type,
      'udt', c.udt_name, 'nullable', c.is_nullable,
      'default', c.column_default, 'char_max_len', c.character_maximum_length
    ) order by c.table_name, c.ordinal_position)
    from information_schema.columns c
    where c.table_schema = 'public'
      and (c.table_name like '%quote%' or c.table_name in ('jobs','job_crew')
           or c.table_name like '%approval%' or c.table_name like '%activity%')
  ), '[]'::jsonb),

  'enums', coalesce((
    select jsonb_agg(jsonb_build_object('enum', s.typname, 'labels', s.labels) order by s.typname)
    from (
      select tp.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type tp
      join pg_enum e on e.enumtypid = tp.oid
      join pg_namespace n on n.oid = tp.typnamespace
      where n.nspname = 'public'
      group by tp.typname
    ) s
  ), '[]'::jsonb),

  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', con.conname, 'type', con.contype,
      'definition', pg_get_constraintdef(con.oid)
    ) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and (rel.relname like '%quote%' or rel.relname in ('jobs','job_crew')
           or rel.relname like '%approval%' or rel.relname like '%activity%')
  ), '[]'::jsonb),

  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef)
                     order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public'
      and (tablename like '%quote%' or tablename in ('jobs','job_crew')
           or tablename like '%approval%' or tablename like '%activity%')
  ), '[]'::jsonb),

  'rls', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'rls_enabled', rel.relrowsecurity, 'rls_forced', rel.relforcerowsecurity
    ) order by rel.relname)
    from pg_class rel
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relkind = 'r'
      and (rel.relname like '%quote%' or rel.relname in ('jobs','job_crew')
           or rel.relname like '%approval%' or rel.relname like '%activity%')
  ), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and (tablename like '%quote%' or tablename in ('jobs','job_crew')
           or tablename like '%approval%' or tablename like '%activity%')
  ), '[]'::jsonb),

  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'grantee', grantee, 'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and (table_name like '%quote%' or table_name in ('jobs','job_crew')
           or table_name like '%approval%' or table_name like '%activity%')
  ), '[]'::jsonb),

  'column_grants_quote_tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name, 'grantee', grantee, 'privilege', privilege_type
    ) order by table_name, column_name, grantee)
    from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name like '%quote%'
  ), '[]'::jsonb),

  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', tg.tgname, 'def', pg_get_triggerdef(tg.oid)
    ) order by rel.relname, tg.tgname)
    from pg_trigger tg
    join pg_class rel on rel.oid = tg.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal
      and (rel.relname like '%quote%' or rel.relname in ('jobs','job_crew')
           or rel.relname like '%approval%' or rel.relname like '%activity%')
  ), '[]'::jsonb),

  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'acl', p.proacl::text,
      'definition', pg_get_functiondef(p.oid)
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '%quote%' or p.proname like '%total%'
           or p.proname like '%recalc%' or p.proname like '%convert%'
           or p.proname like '%number%' or p.proname like '%approve%')
  ), '[]'::jsonb),

  'table_inventory', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', s.relname, 'estimated_rows', s.n_live_tup
    ) order by s.relname)
    from pg_stat_user_tables s
    where s.schemaname = 'public'
      and (s.relname like '%quote%' or s.relname in ('jobs','job_crew')
           or s.relname like '%approval%' or s.relname like '%activity%')
  ), '[]'::jsonb),

  'confirmed_row_counts', jsonb_build_object(
    'quotes', (select count(*) from public.quotes),
    'jobs', (select count(*) from public.jobs)
  ),

  'quote_status_distribution', coalesce((
    select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.c) order by s.status)
    from (select status::text as status, count(*) c from public.quotes group by status) s
  ), '[]'::jsonb)

)) as quotes_preflight;
