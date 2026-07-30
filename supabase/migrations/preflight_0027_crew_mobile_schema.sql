-- =====================================================================
-- preflight_0027_crew_mobile_schema.sql   [Phase 9 P2 — Crew Mobile]
-- READ-ONLY DISCOVERY. Run this in the Supabase SQL Editor and paste the
-- single JSON result back. Selects NO customer PII. Changes NOTHING.
--
-- WHY: the crew-mobile write/read RPCs (assigned jobs, clock in/out, job
-- status, checklist, photos, signature) must be authored against the ACTUAL
-- columns / FKs / grants / RLS of these tables — which originate from the
-- legacy MoveOps backend and are not defined in this repo. This inventories:
--   job_crew, jobs, job_status_events, job_checklists, job_photos,
--   crew_time_entries, document_signatures
-- plus the storage bucket for job photos, existing crew-related functions,
-- and the profiles role enum values for crew.
-- =====================================================================

with rels(relname) as (
  values
    ('job_crew'), ('jobs'), ('job_status_events'), ('job_checklists'),
    ('job_photos'), ('crew_time_entries'), ('document_signatures')
)
select jsonb_pretty(jsonb_build_object(

  -- 1. Does each relation exist, and is it a table/view?
  'relation_kind', coalesce((
    select jsonb_agg(jsonb_build_object(
      'relation', r.relname,
      'exists', to_regclass('public.'||r.relname) is not null,
      'kind', (select case c.relkind when 'r' then 'table' when 'v' then 'view'
                       when 'm' then 'matview' else c.relkind::text end
               from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname=r.relname)
    ) order by r.relname)
    from rels r), '[]'::jsonb),

  -- 2. Full column inventory (name, type, nullable, default present?).
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'column', c.column_name,
      'type', c.data_type, 'nullable', c.is_nullable,
      'has_default', (c.column_default is not null),
      'ordinal', c.ordinal_position
    ) order by c.table_name, c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public'
      and c.table_name in (select relname from rels)), '[]'::jsonb),

  -- 3. Foreign keys (esp. job_id -> jobs, profile_id -> profiles/auth.users).
  'foreign_keys', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tc.table_name, 'constraint', tc.constraint_name,
      'column', kcu.column_name,
      'references', ccu.table_name||'.'||ccu.column_name
    ) order by tc.table_name, tc.constraint_name)
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
      and tc.table_name in (select relname from rels)), '[]'::jsonb),

  -- 4. RLS enabled / forced per table.
  'rls', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.relname, 'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (select relname from rels)), '[]'::jsonb),

  -- 5. Existing policies (name, cmd, roles, using/withcheck).
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', p.tablename, 'policy', p.policyname, 'cmd', p.cmd,
      'roles', p.roles, 'using', p.qual, 'with_check', p.with_check
    ) order by p.tablename, p.policyname)
    from pg_policies p
    where p.schemaname='public' and p.tablename in (select relname from rels)), '[]'::jsonb),

  -- 6. Grants for anon / authenticated / public (P0 exposure check).
  'grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege_type
    ) order by g.table_name, g.grantee, g.privilege_type)
    from information_schema.role_table_grants g
    where g.table_schema='public'
      and g.table_name in (select relname from rels)
      and g.grantee in ('anon','authenticated','public','PUBLIC')), '[]'::jsonb),

  -- 7. Row counts (sanity only; no PII).
  'row_counts', jsonb_build_object(
    'job_crew',            (select count(*) from public.job_crew),
    'jobs',                (select count(*) from public.jobs),
    'job_status_events',   (select count(*) from public.job_status_events),
    'job_checklists',      (select count(*) from public.job_checklists),
    'job_photos',          (select count(*) from public.job_photos),
    'crew_time_entries',   (select count(*) from public.crew_time_entries),
    'document_signatures', (select count(*) from public.document_signatures)
  ),

  -- 8. Existing crew-related functions (so we don't collide / overwrite).
  'crew_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef, 'owner', pg_get_userbyid(p.proowner)
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p')
      and (p.proname ~* 'crew' or p.proname ~* 'clock' or p.proname ~* 'photo'
           or p.proname ~* 'checklist' or p.proname ~* 'signature'
           or p.proname ~* 'time_entr')), '[]'::jsonb),

  -- 9. job_status enum labels + user_role labels relevant to crew.
  'enums', jsonb_build_object(
    'job_status', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                   from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='job_status'),
    'user_role',  (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                   from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role')
  ),

  -- 10. Storage bucket(s) for job photos + their storage.objects policies.
  'storage_buckets', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'public', b.public))
    from storage.buckets b
    where b.id ~* 'job' or b.id ~* 'photo' or b.name ~* 'job' or b.name ~* 'photo'), '[]'::jsonb),
  'storage_object_policies', coalesce((
    select jsonb_agg(jsonb_build_object('policy', p.policyname, 'cmd', p.cmd, 'roles', p.roles))
    from pg_policies p
    where p.schemaname='storage' and p.tablename='objects'), '[]'::jsonb)

)) as preflight_0027;
