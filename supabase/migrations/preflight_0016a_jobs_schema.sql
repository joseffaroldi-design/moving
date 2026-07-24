-- =====================================================================
-- preflight_0016a_jobs_schema.sql   (READ-ONLY — no writes, no DDL)
-- Phase 5 (Jobs) LOCKDOWN pre-authoring schema confirmation.
--
-- Purpose: confirm — BEFORE any policy is written — the exact structure
-- of the 9 job relations so the 0016a lockdown does not guess:
--   1. relkind of each relation (r=table, v=view, m=matview, p=partitioned)
--      -> catches job_profitability being a VIEW/MATVIEW (cannot FORCE RLS
--         or grant like a table).
--   2. every FK on the 8 child relations: local column -> referenced
--      table.column  (confirms child -> jobs.id via job_id, or otherwise).
--   3. presence of a direct company_id column per relation.
--   4. current table grants, RLS enabled/forced, and existing policies.
--
-- Returns ONE pretty-printed JSON blob. Paste the single result back.
-- No customer PII selected.
-- =====================================================================

with rels(relname) as (
  values
    ('jobs'), ('job_checklists'), ('job_crew'), ('job_expenses'),
    ('job_photos'), ('job_status_events'), ('job_stops'),
    ('job_trucks'), ('job_profitability')
)
select jsonb_pretty(jsonb_build_object(

  -- 1. relation kind (is it a table, view, or matview?)
  'relation_kind', coalesce((
    select jsonb_agg(jsonb_build_object(
      'relation', c.relname,
      'relkind',  c.relkind,
      'kind_label', case c.relkind
        when 'r' then 'ordinary_table'
        when 'v' then 'view'
        when 'm' then 'materialized_view'
        when 'p' then 'partitioned_table'
        when 'f' then 'foreign_table'
        else c.relkind::text end,
      'rls_enabled', c.relrowsecurity,
      'rls_forced',  c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (select relname from rels)
  ), '[]'::jsonb),

  -- 2. missing relations (any of the 9 not present at all)
  'missing_relations', coalesce((
    select jsonb_agg(r.relname order by r.relname)
    from rels r
    where not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = r.relname
    )
  ), '[]'::jsonb),

  -- 3. foreign keys OUT of each of the 9 relations
  'foreign_keys', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname,
      'constraint', con.conname,
      'definition', pg_get_constraintdef(con.oid)
    ) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and con.contype = 'f'
      and rel.relname in (select relname from rels)
  ), '[]'::jsonb),

  -- 4. columns per relation (confirms job_id / company_id presence)
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'ordinal', c.ordinal_position,
      'column', c.column_name, 'data_type', c.data_type,
      'udt', c.udt_name, 'nullable', c.is_nullable, 'default', c.column_default
    ) order by c.table_name, c.ordinal_position)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in (select relname from rels)
  ), '[]'::jsonb),

  -- 5. current table grants (expect anon/public present today = the risk)
  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'grantee', grantee, 'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (select relname from rels)
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  -- 6. existing policies to be dropped/replaced
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in (select relname from rels)
  ), '[]'::jsonb),

  -- 7. row counts (confirm preservation before/after)
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

)) as jobs_schema_preflight;
