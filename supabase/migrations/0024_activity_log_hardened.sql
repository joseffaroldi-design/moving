-- =====================================================================
-- 0024_activity_log_hardened.sql   [Phase 9 — cross-cutting audit sink]
-- OWNER-EXECUTED ONLY. The author does NOT run this. Additive & idempotent.
--
-- WHY THIS MIGRATION EXISTS
--   The original 0003_activity_log.sql was NEVER applied to this database
--   (confirmed: to_regclass('public.activity_log') is null). Rather than apply
--   that legacy shape, this migration creates a HARDENED activity_log because
--   the legacy design had two security gaps:
--     (1) NO company_id  -> staff SELECT could not be tenant-scoped, so a staff
--         member of company A could read company B's audit rows.
--     (2) A direct-INSERT RLS policy that only checked actor_id = auth.uid()
--         -> actor_email / actor_role / metadata / action were all forgeable.
--
-- DEPENDENCY ORDER: this is 0024; the customer-portal migration is 0025 and
-- REQUIRES this table to already exist (0025's portal_approve_quote inserts an
-- audit row in the SAME transaction as quote acceptance; with check_function_
-- bodies on, 0025's CREATE FUNCTION would abort if this table were absent).
--
-- TRUST MODEL — NO client may write this table.
--   * anon / PUBLIC          : nothing.
--   * authenticated          : SELECT only (company-scoped, active-staff-only).
--   * writes                 : ONLY from SECURITY DEFINER functions (owned by
--                              postgres) that derive actor_id/actor_email/
--                              actor_role/company_id server-side from auth.uid()
--                              + the active profile. No client INSERT/UPDATE/
--                              DELETE grant exists, so the table is append-only
--                              from every browser's perspective and no identity/
--                              tenant field can be forged.
--   This migration does NOT add a client-facing log RPC (none is needed yet —
--   the only writer is 0025's portal_approve_quote). Any FUTURE staff-side
--   logging must use a dedicated SECURITY DEFINER RPC that likewise derives
--   identity + company server-side; direct browser INSERT must never be granted.
--
-- RUN ORDER: Part A (read-only) -> review -> Part B -> Part C (read-only).
--            Part D is the rollback.
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT (READ-ONLY; run first, paste every result)
-- =====================================================================

-- A1. activity_log must NOT exist yet (expect null).
select to_regclass('public.activity_log') as activity_log_regclass;

-- A2. companies + profiles (referenced by FK / read policy) must exist with the
--     columns this migration relies on (expect both rows present).
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public' and (
      (table_name='companies' and column_name in ('id'))
   or (table_name='profiles'  and column_name in ('id','company_id','role','is_active')) )
group by table_name order by table_name;

-- A3. No pre-existing policy / object name collision (expect 0 rows).
select tablename, policyname from pg_policies
where schemaname='public' and tablename='activity_log';

-- A4. Confirm the staff role labels used by the read policy exist in user_role
--     (expect all four true).
select
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='owner') as owner,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='operations_manager') as operations_manager,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='dispatcher') as dispatcher,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='sales') as sales;


-- =====================================================================
-- PART B — MIGRATION (single transaction)
-- =====================================================================
begin;

-- B1. Table (hardened shape: tenant-scoped, server-written identity fields).
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role  text,
  action      text not null,               -- e.g. 'quote.approved'
  entity_type text,                         -- e.g. 'quote','job','invoice'
  entity_id   text,
  summary     text,
  metadata    jsonb not null default '{}'::jsonb,  -- NEVER secrets/tokens/pw
  created_at  timestamptz not null default now()
);

-- B2. Indexes for the expected query shapes.
create index if not exists activity_log_company_created_idx
  on public.activity_log (company_id, created_at desc);
create index if not exists activity_log_entity_idx
  on public.activity_log (entity_type, entity_id);
create index if not exists activity_log_actor_idx
  on public.activity_log (actor_id);
create index if not exists activity_log_created_idx
  on public.activity_log (created_at desc);

-- B3. GRANT LOCKDOWN — append-only from every client; reads for authenticated.
--     No INSERT/UPDATE/DELETE/TRUNCATE grant to any client role.
revoke all on table public.activity_log from anon, public;
revoke all on table public.activity_log from authenticated;
grant select on table public.activity_log to authenticated;

-- B4. RLS — enable (NOT forced; see note). Only a company-scoped, active-staff
--     SELECT policy. No INSERT/UPDATE/DELETE policy exists, and no client holds
--     those grants, so the table is append-only for clients.
--
--     WHY NOT `FORCE ROW LEVEL SECURITY` HERE (and why it is safe):
--       * FORCE only changes behaviour for the TABLE OWNER's own statements.
--         Every client (anon/authenticated) is already subject to RLS the moment
--         it is ENABLED, so FORCE adds no client-facing protection.
--       * Clients have ZERO write grant (B3), so there is no client write path
--         for RLS to police regardless of FORCE.
--       * Writes come exclusively from SECURITY DEFINER functions that execute
--         as the table owner (postgres). With RLS *not forced*, that owner
--         context bypasses RLS and the audit INSERT always succeeds WITHOUT
--         depending on the BYPASSRLS role attribute or on adding a permissive
--         INSERT policy. Enabling FORCE would make the owner subject to RLS and,
--         with no INSERT policy present, could BLOCK the intended DEFINER insert
--         on a database whose owner lacks BYPASSRLS. Not forcing is therefore
--         both simpler and strictly safer for the intended write path.
--       * SELECT is still fully governed by the enabled RLS policy below.
alter table public.activity_log enable row level security;

drop policy if exists "activity_log_staff_read" on public.activity_log;
create policy "activity_log_staff_read"
on public.activity_log for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active is true
      and p.company_id = activity_log.company_id
      and p.role::text in ('owner','operations_manager','dispatcher','sales')
  )
);

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste every result)
-- =====================================================================

-- C1. Table exists with company_id NOT NULL + FK to companies.
select
  to_regclass('public.activity_log') is not null as table_exists,
  (select is_nullable from information_schema.columns
     where table_schema='public' and table_name='activity_log' and column_name='company_id') as company_id_nullable;

select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.activity_log'::regclass and contype='f'
order by conname;

-- C2. All 4 indexes exist.
select indexname from pg_indexes
where schemaname='public' and tablename='activity_log'
order by indexname;

-- C3. Grants: authenticated = SELECT only; anon/PUBLIC = none;
--     NO insert/update/delete/truncate to any client (expect only the SELECT row).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='activity_log'
  and grantee in ('anon','authenticated','public','PUBLIC')
order by grantee, privilege_type;

-- C4. RLS enabled; exactly one SELECT policy; forced = false (by design).
select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where oid='public.activity_log'::regclass;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='activity_log'
order by policyname;

-- C5. Negative — as an authenticated CUSTOMER (role=customer), a direct
--     `select * from public.activity_log` must return 0 rows (read policy
--     excludes non-staff). As a STAFF user it returns only own-company rows.
--     (Run manually while signed in as each role.)


-- =====================================================================
-- PART D — ROLLBACK (removes ONLY objects created by 0024)
-- =====================================================================
-- Drops the read policy, the 4 indexes, and the table. NOTE: 0025's
-- portal_approve_quote references this table, so DROP THIS ONLY AFTER 0025 has
-- been rolled back (or before 0025 is ever applied). Dropping the table
-- destroys all audit rows.
--
-- begin;
--   drop policy if exists "activity_log_staff_read" on public.activity_log;
--   drop index  if exists public.activity_log_company_created_idx;
--   drop index  if exists public.activity_log_entity_idx;
--   drop index  if exists public.activity_log_actor_idx;
--   drop index  if exists public.activity_log_created_idx;
--   drop table  if exists public.activity_log;
-- commit;
