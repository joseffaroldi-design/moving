-- =====================================================================
-- RC1_R4_rollback.sql        [INCIDENT-RESPONSE ONLY]
-- Southern Magnolia Movers — RC1.
--
-- Restores the EXACT pre-lockdown grants + RLS state captured by
-- RC1_R2_pre_snapshot.sql. This is NOT a generic GRANT ALL — it replays only
-- the per-grantee / per-privilege rows that actually existed before RC1_R3.
--
-- ⚠️ WARNING: the captured pre-state granted FULL DML to `anon` on all 42
-- relations. Running this REOPENS the catastrophic exposure. Use ONLY during a
-- controlled incident (e.g., the lockdown broke something unexpected), then
-- re-lock with RC1_R3 as soon as possible.
--
-- Transactional. Requires the RC1_R2 snapshot tables to be present.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('rc1_backup.grants_snapshot') is null
     or to_regclass('rc1_backup.rls_snapshot') is null then
    raise exception 'Snapshot missing (rc1_backup.*). Cannot perform a precise rollback.';
  end if;
end $$;

-- 1) Restore RLS enable/force exactly as captured (tables + partitioned only).
do $$
declare rec record;
begin
  for rec in
    select relname, relkind, rls_enabled, rls_forced from rc1_backup.rls_snapshot
    where relkind in ('r','p')
  loop
    if to_regclass('public.' || rec.relname) is null then continue; end if;
    if rec.rls_enabled then
      execute format('alter table public.%I enable row level security', rec.relname);
    else
      execute format('alter table public.%I disable row level security', rec.relname);
    end if;
    if rec.rls_forced then
      execute format('alter table public.%I force row level security', rec.relname);
    else
      execute format('alter table public.%I no force row level security', rec.relname);
    end if;
  end loop;
end $$;

-- 2) Re-grant EXACTLY the captured privileges, per grantee, per privilege type.
--    PUBLIC is emitted as the unquoted keyword; named roles use quoted idents.
do $$
declare rec record;
begin
  for rec in
    select table_name, grantee, privilege_type, is_grantable
    from rc1_backup.grants_snapshot
  loop
    if to_regclass('public.' || rec.table_name) is null then continue; end if;
    if upper(rec.grantee) = 'PUBLIC' then
      execute format('grant %s on public.%I to public%s',
        rec.privilege_type, rec.table_name,
        case when rec.is_grantable = 'YES' then ' with grant option' else '' end);
    else
      execute format('grant %s on public.%I to %I%s',
        rec.privilege_type, rec.table_name, rec.grantee,
        case when rec.is_grantable = 'YES' then ' with grant option' else '' end);
    end if;
  end loop;
end $$;

commit;

-- Optional cleanup once you are certain rollback is no longer needed:
--   drop schema rc1_backup cascade;

-- VERIFICATION — anon grants should be BACK to the pre-lockdown state.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name, grantee
order by table_name;
