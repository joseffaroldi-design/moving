-- =====================================================================
-- preflight_0017b_dispatch_days_schema.sql   (READ-ONLY — no writes, no DDL)
-- dispatch_days is the hard dependency of dispatch_assignments
-- (dispatch_assignments.dispatch_day_id NOT NULL FK -> dispatch_days.id).
-- Confirm its exact structure + security BEFORE any assignment RPC.
--
-- Returns ONE pretty-printed JSON blob. Paste the single result back.
-- =====================================================================

select jsonb_pretty(jsonb_build_object(

  'exists', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='dispatch_days'),

  'relation_kind', coalesce((
    select jsonb_agg(jsonb_build_object('relation',c.relname,'relkind',c.relkind,
      'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='dispatch_days'
  ), '[]'::jsonb),

  'columns', coalesce((
    select jsonb_agg(jsonb_build_object('ordinal',c.ordinal_position,'column',c.column_name,
      'data_type',c.data_type,'udt',c.udt_name,'nullable',c.is_nullable,'default',c.column_default)
      order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='dispatch_days'
  ), '[]'::jsonb),

  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,
      'definition',pg_get_constraintdef(con.oid)) order by con.conname)
    from pg_constraint con join pg_class rel on rel.oid=con.conrelid
    join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and rel.relname='dispatch_days'
  ), '[]'::jsonb),

  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object('name',indexname,'def',indexdef) order by indexname)
    from pg_indexes where schemaname='public' and tablename='dispatch_days'
  ), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object('policy',policyname,'permissive',permissive,
      'roles',roles,'cmd',cmd,'using',qual,'with_check',with_check) order by policyname)
    from pg_policies where schemaname='public' and tablename='dispatch_days'
  ), '[]'::jsonb),

  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type)
      order by grantee,privilege_type)
    from information_schema.role_table_grants
    where table_schema='public' and table_name='dispatch_days'
      and grantee in ('anon','authenticated','public','PUBLIC')
  ), '[]'::jsonb),

  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object('name',tg.tgname,'def',pg_get_triggerdef(tg.oid)) order by tg.tgname)
    from pg_trigger tg join pg_class rel on rel.oid=tg.tgrelid join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and rel.relname='dispatch_days' and not tg.tgisinternal
  ), '[]'::jsonb),

  -- inbound FKs (who references dispatch_days) for completeness
  'referenced_by', coalesce((
    select jsonb_agg(jsonb_build_object('table',rel.relname,'constraint',con.conname,
      'definition',pg_get_constraintdef(con.oid)) order by rel.relname,con.conname)
    from pg_constraint con join pg_class rel on rel.oid=con.conrelid
    join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and con.contype='f'
      and con.confrelid = 'public.dispatch_days'::regclass
  ), '[]'::jsonb),

  'row_count', (select count(*) from public.dispatch_days),

  -- any existing dispatch_day-related functions
  'day_functions', coalesce((
    select jsonb_agg(jsonb_build_object('name',p.proname,
      'args',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),
      'security_definer',p.prosecdef,
      'exec_anon',has_function_privilege('anon',p.oid,'EXECUTE'),
      'exec_authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%dispatch_day%'
  ), '[]'::jsonb)

)) as dispatch_days_preflight;
