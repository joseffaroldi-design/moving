-- =====================================================================
-- RC1_R5_default_privileges_addendum.sql   (RUN AFTER R3 is verified)
--
-- ROOT-CAUSE FIX for B2. R1/M4 revealed that schema `public` carries
-- DEFAULT PRIVILEGES (from roles postgres AND supabase_admin) that
-- auto-grant anon + authenticated FULL DML on every FUTURE table, plus
-- EXECUTE on future functions and USAGE on future sequences. That is why
-- new tables (e.g. the upcoming Phase 8 invoice tables) would silently
-- re-expose themselves to anon.
--
-- This script stops that for FUTURE objects only. It does NOT touch any
-- existing object, so it CANNOT break the currently-running app. After
-- this, every new public object starts with NO anon/authenticated access;
-- each migration must GRANT explicitly (this project already does that
-- per phase — SELECT for staff + EXECUTE per RPC).
--
-- Scope is strictly schema `public`. The storage / graphql / graphql_public
-- defaults seen in M4 are Supabase-managed and are intentionally left alone.
-- =====================================================================
begin;

-- Part A — FOR ROLE postgres (the SQL editor runs as postgres; always allowed).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

commit;

-- Part B — FOR ROLE supabase_admin (attempted; needs membership in supabase_admin).
-- Wrapped so a permission error here does NOT abort Part A. If it prints the
-- SKIPPED notice, copy it back and we will handle supabase_admin defaults
-- through the Supabase dashboard / support path.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon, authenticated';
  raise notice 'R5 Part B OK: supabase_admin public-schema default privileges revoked for anon/authenticated';
exception when insufficient_privilege then
  raise notice 'R5 Part B SKIPPED (insufficient privilege to alter supabase_admin defaults) — report this line back to the agent';
end$$;

-- VERIFY (paste back): expect NO rows granting anon/authenticated as a public-schema
-- default from postgres. If Part B was skipped, supabase_admin rows may remain.
select pg_get_userbyid(d.defaclrole) as grantor,
       coalesce(n.nspname,'(all)') as schema,
       d.defaclobjtype::text as objtype,
       case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
       a.privilege_type
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where coalesce(n.nspname,'') = 'public'
  and a.grantee::regrole::text in ('anon','authenticated')
order by grantor, objtype, grantee, privilege_type;
