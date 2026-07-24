-- =====================================================================
-- preflight_0017_dispatch_schema.sql   (READ-ONLY — no writes, no DDL)
-- Phase 6 (Job Status Transitions + Dispatch) pre-authoring inspection.
--
-- Scope relations:
--   jobs, job_status_events, job_crew, job_trucks,
--   dispatch_assignments, trucks
-- Plus: enums (job_status, dispatch_status, user_role, + any others used),
--   authz helper functions (has_company_role, is_company_member,
--   can_dispatch_company, can_manage_company, current_customer_id),
--   and any status/dispatch/assignment RPCs already present.
--
-- Returns ONE pretty-printed JSON blob. Paste the single result back.
-- No customer PII selected.
-- =====================================================================

with rels(relname) as (
  values
    ('jobs'), ('job_status_events'), ('job_crew'), ('job_trucks'),
    ('dispatch_assignments'), ('trucks')
)
select jsonb_pretty(jsonb_build_object(

  -- 1. relation kind + RLS state
  'relation_kind', coalesce((
    select jsonb_agg(jsonb_build_object(
      'relation', c.relname, 'relkind', c.relkind,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (select relname from rels)
  ), '[]'::jsonb),

  'missing_relations', coalesce((
    select jsonb_agg(r.relname order by r.relname)
    from rels r
    where not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = r.relname
    )
  ), '[]'::jsonb),

  -- 2. columns
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'ordinal', c.ordinal_position,
      'column', c.column_name, 'data_type', c.data_type, 'udt', c.udt_name,
      'nullable', c.is_nullable, 'default', c.column_default
    ) order by c.table_name, c.ordinal_position)
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (select relname from rels)
  ), '[]'::jsonb),

  -- 3. enums (all public enums + labels; we care about job_status,
  --    dispatch_status, user_role, and any assignment/stop types)
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

  -- 4. constraints (PK/FK/unique/check) on the scope relations
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', con.conname, 'type', con.contype,
      'definition', pg_get_constraintdef(con.oid)
    ) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname in (select relname from rels)
  ), '[]'::jsonb),

  -- 5. indexes
  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef)
                     order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public' and tablename in (select relname from rels)
  ), '[]'::jsonb),

  -- 6. RLS policies
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public' and tablename in (select relname from rels)
  ), '[]'::jsonb),

  -- 7. table grants (client roles only)
  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'grantee', grantee, 'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name in (select relname from rels)
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  -- 8. triggers on the scope relations
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', tg.tgname, 'def', pg_get_triggerdef(tg.oid)
    ) order by rel.relname, tg.tgname)
    from pg_trigger tg
    join pg_class rel on rel.oid = tg.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal
      and rel.relname in (select relname from rels)
  ), '[]'::jsonb),

  -- 9. authz helper functions (signature + security + acl, NOT full body)
  'authz_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'acl', p.proacl::text,
      'exec_anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'exec_authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('has_company_role','is_company_member','can_dispatch_company',
                        'can_manage_company','current_customer_id')
  ), '[]'::jsonb),

  -- 10. existing status/dispatch/assignment RPCs (signature + security + acl)
  'domain_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'exec_anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'exec_authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '%dispatch%' or p.proname like '%assign%'
        or p.proname like '%status%' or p.proname like '%job%'
        or p.proname like '%crew%' or p.proname like '%truck%'
        or p.proname like '%clock%' or p.proname like '%checkin%')
  ), '[]'::jsonb),

  -- 11. row counts + status distributions
  'row_counts', jsonb_build_object(
    'jobs',                 (select count(*) from public.jobs),
    'job_status_events',    (select count(*) from public.job_status_events),
    'job_crew',             (select count(*) from public.job_crew),
    'job_trucks',           (select count(*) from public.job_trucks),
    'dispatch_assignments', (select count(*) from public.dispatch_assignments),
    'trucks',               (select count(*) from public.trucks)
  ),

  'jobs_status_distribution', coalesce((
    select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.c) order by s.status)
    from (select status::text as status, count(*) c from public.jobs group by status) s
  ), '[]'::jsonb),

  'dispatch_status_distribution', coalesce((
    select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.c) order by s.status)
    from (select status::text as status, count(*) c from public.dispatch_assignments group by status) s
  ), '[]'::jsonb)

)) as dispatch_preflight;
