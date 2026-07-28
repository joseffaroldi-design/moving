-- =====================================================================
-- RC1_R5_default_privileges_addendum.sql   [CONDITIONAL — only if M4 shows rows]
-- Southern Magnolia Movers — RC1.  SEPARATE from RC1_R3. EXECUTE NOTHING here.
--
-- WHY: If M4 (RC1_R1) shows ALTER DEFAULT PRIVILEGES granting to anon /
-- authenticated / PUBLIC, then every NEW object created by that grantor
-- re-opens the exposure — so RC1_R3 alone is not durable. Default privileges
-- are scoped PER GRANTOR (role that creates the object) + schema + object type;
-- revoking one grantor's defaults does NOT touch another grantor's. This file
-- therefore GENERATES the precise statements from the live catalog rather than
-- assuming a single grantor.
--
-- THIS FILE DOES NOT EXECUTE ANY CHANGE. It contains:
--   PART A — read-only GENERATOR that prints exact REVOKE statements (review these).
--   PART B — read-only SNAPSHOT capture (run before applying A's output).
--   PART C — read-only ROLLBACK GENERATOR that prints exact restore statements.
-- You paste/run the generated statements yourself, only after review + approval.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — GENERATOR: exact "revoke default privileges" statements, per
--          grantor/schema/object-type, for grantees anon/authenticated/PUBLIC.
--          Output is TEXT to review; running THIS select changes nothing.
-- ---------------------------------------------------------------------
select 'A_GENERATED_REVOKE' as block,
       format(
         'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s;',
         pg_get_userbyid(d.defaclrole),
         case when d.defaclnamespace is null or d.defaclnamespace = 0
              then '' else ' IN SCHEMA ' || quote_ident(n.nspname) end,
         case d.defaclobjtype when 'r' then 'TABLES' when 'S' then 'SEQUENCES'
              when 'f' then 'FUNCTIONS' when 'T' then 'TYPES' when 'n' then 'SCHEMAS'
              else d.defaclobjtype::text end,
         case when a.grantee = 0 then 'PUBLIC' else quote_ident(a.grantee::regrole::text) end
       ) as statement_to_run
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where (a.grantee = 0 or a.grantee::regrole::text in ('anon','authenticated'))
group by d.defaclrole, d.defaclnamespace, n.nspname, d.defaclobjtype, a.grantee
order by 2;
-- If this returns ZERO rows, NO default-privilege remediation is needed (skip B/C).

-- ---------------------------------------------------------------------
-- PART B — SNAPSHOT the exact pre-change default ACLs so C can restore them.
--          (This is the ONLY statement here that writes — a backup table.
--           Run it ONLY when you are ready to apply Part A's output.)
-- ---------------------------------------------------------------------
-- begin;
-- create schema if not exists rc1_backup;
-- drop table if exists rc1_backup.default_acl_snapshot;
-- create table rc1_backup.default_acl_snapshot as
-- select d.defaclrole,
--        pg_get_userbyid(d.defaclrole)        as grantor,
--        d.defaclnamespace,
--        n.nspname                            as schema,
--        d.defaclobjtype,
--        case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
--        a.privilege_type,
--        a.is_grantable
-- from pg_default_acl d
-- left join pg_namespace n on n.oid = d.defaclnamespace
-- cross join lateral aclexplode(d.defaclacl) a;
-- commit;

-- ---------------------------------------------------------------------
-- PART C — ROLLBACK GENERATOR: prints exact GRANT statements to restore the
--          captured default privileges (run against rc1_backup.default_acl_snapshot
--          AFTER Part B was captured). Prints text only — changes nothing.
--          ⚠️ Restoring re-adds anon/authenticated defaults (reopens the drift).
-- ---------------------------------------------------------------------
-- select 'C_GENERATED_RESTORE' as block,
--        format(
--          'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s;',
--          s.grantor,
--          case when s.schema is null then '' else ' IN SCHEMA ' || quote_ident(s.schema) end,
--          s.privilege_type,
--          case s.defaclobjtype when 'r' then 'TABLES' when 'S' then 'SEQUENCES'
--               when 'f' then 'FUNCTIONS' when 'T' then 'TYPES' when 'n' then 'SCHEMAS'
--               else s.defaclobjtype::text end,
--          case when s.grantee = 'PUBLIC' then 'PUBLIC' else quote_ident(s.grantee) end,
--          case when s.is_grantable then ' WITH GRANT OPTION' else '' end
--        ) as statement_to_run
-- from rc1_backup.default_acl_snapshot s
-- where s.grantee in ('anon','authenticated','PUBLIC')
-- order by s.grantor, s.schema, s.defaclobjtype, s.grantee, s.privilege_type;

-- ---------------------------------------------------------------------
-- DRIFT NOTE: before restoring, compare rc1_backup.default_acl_snapshot to the
-- CURRENT pg_default_acl; if they differ, someone changed defaults after the
-- snapshot — investigate before running C so you don't clobber newer intent.
-- ---------------------------------------------------------------------
