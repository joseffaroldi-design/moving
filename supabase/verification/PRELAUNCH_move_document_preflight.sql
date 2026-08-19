-- =====================================================================
-- PRELAUNCH_move_document_preflight.sql
-- READ-ONLY discovery for Southern Magnolia V1 move-document foundation.
-- Changes NOTHING. Returns schema/security metadata only; no customer PII.
-- =====================================================================

with target_tables(relname) as (
  values ('documents'), ('document_signatures'), ('jobs'), ('customers'), ('job_crew')
),
cols as (
  select c.table_name, c.ordinal_position, c.column_name, c.data_type,
         c.udt_name, c.is_nullable, c.column_default
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name in (select relname from target_tables)
),
fks as (
  select tc.table_name,
         tc.constraint_name,
         kcu.column_name,
         ccu.table_name as references_table,
         ccu.column_name as references_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_schema=tc.constraint_schema
   and kcu.constraint_name=tc.constraint_name
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_schema=tc.constraint_schema
   and ccu.constraint_name=tc.constraint_name
  where tc.table_schema='public'
    and tc.constraint_type='FOREIGN KEY'
    and tc.table_name in (select relname from target_tables)
)
select jsonb_pretty(jsonb_build_object(
  'relations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', t.relname,
      'exists', to_regclass('public.'||t.relname) is not null,
      'kind', (select case c.relkind
                  when 'r' then 'table' when 'v' then 'view'
                  when 'm' then 'matview' else c.relkind::text end
               from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname=t.relname),
      'rls_enabled', (select c.relrowsecurity
                      from pg_class c join pg_namespace n on n.oid=c.relnamespace
                      where n.nspname='public' and c.relname=t.relname),
      'rls_forced', (select c.relforcerowsecurity
                     from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname=t.relname)
    ) order by t.relname) from target_tables t), '[]'::jsonb),

  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'ordinal', ordinal_position,
      'column', column_name,
      'data_type', data_type,
      'udt_name', udt_name,
      'nullable', is_nullable,
      'has_default', column_default is not null
    ) order by table_name, ordinal_position)
    from cols), '[]'::jsonb),

  'foreign_keys', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'constraint', constraint_name,
      'column', column_name,
      'references', references_table||'.'||references_column
    ) order by table_name, constraint_name, column_name)
    from fks), '[]'::jsonb),

  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_get_constraintdef(con.oid)
    ) order by c.relname, con.conname)
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (select relname from target_tables)), '[]'::jsonb),

  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    ) order by tablename, indexname)
    from pg_indexes
    where schemaname='public'
      and tablename in (select relname from target_tables)), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'cmd', cmd,
      'roles', roles,
      'using', qual,
      'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname='public'
      and tablename in (select relname from target_tables)), '[]'::jsonb),

  'client_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'grantee', grantee,
      'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (select relname from target_tables)
      and grantee in ('anon','authenticated','public','PUBLIC')), '[]'::jsonb),

  'document_type_enum', coalesce((
    select jsonb_agg(e.enumlabel order by e.enumsortorder)
    from pg_enum e
    join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='document_type'), '[]'::jsonb),

  'signature_related_enums', coalesce((
    select jsonb_object_agg(x.typname, x.labels order by x.typname)
    from (
      select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_enum e
      join pg_type t on t.oid=e.enumtypid
      join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public'
        and (t.typname ilike '%signature%' or t.typname ilike '%document%')
      group by t.typname
    ) x), '{}'::jsonb),

  'document_signature_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'owner', pg_get_userbyid(p.proowner),
      'execute_acl', coalesce(array_to_string(p.proacl,' | '),'(default ACL)')
    ) order by p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind in ('f','p')
      and (p.proname ilike '%document%' or p.proname ilike '%signature%' or p.proname ilike '%sign%')), '[]'::jsonb),

  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table,
      'trigger', trigger_name,
      'timing', action_timing,
      'event', event_manipulation,
      'statement', action_statement
    ) order by event_object_table, trigger_name, event_manipulation)
    from information_schema.triggers
    where trigger_schema='public'
      and event_object_table in (select relname from target_tables)), '[]'::jsonb),

  'row_counts', jsonb_build_object(
    'documents', case when to_regclass('public.documents') is not null then (select count(*) from public.documents) else null end,
    'document_signatures', case when to_regclass('public.document_signatures') is not null then (select count(*) from public.document_signatures) else null end,
    'jobs', case when to_regclass('public.jobs') is not null then (select count(*) from public.jobs) else null end
  ),

  'storage', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'public', public,
      'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types
    ) order by id)
    from storage.buckets
    where id in ('documents','job-photos') or name in ('documents','job-photos')), '[]'::jsonb)
)) as move_document_preflight;
