-- =====================================================================
-- 0025_quarantine_legacy_portal_policies.sql   [Phase 9 — dependency-ordered]
-- OWNER-EXECUTED ONLY. The author does NOT run this. Removal-focused; NO CASCADE.
--
-- WHY: the live DB (original MoveOps backend, not repo-created) carries FIVE RLS
-- policies + ONE helper function that all depend on the UNSAFE email-based
-- public.current_customer_id() (SECURITY DEFINER, auth.users email, LIMIT 1, no
-- active/role/company checks). No application code uses the five affected tables,
-- and the tables carry NO client (anon/authenticated/PUBLIC) grants — so these
-- policies are LATENT (not reachable via the Data API today) but a re-exposure
-- risk. This migration quarantines them so the resolver reaches ZERO
-- dependencies, unblocking 0026 (portal) and any later resolver hardening.
--
-- SCOPE — this migration ONLY:
--   * DROPs exactly the 5 current_customer_id()-dependent policies.
--   * DROPs the wrapper public.is_current_customer(uuid) (also calls the resolver).
--   * Defensively RE-REVOKEs anon/authenticated/PUBLIC grants on the 5 tables
--     (idempotent; postgres/service_role untouched).
-- IT DOES NOT: touch the 8 unrelated staff/manager policies; use CASCADE; alter,
--   revoke, or drop public.current_customer_id() (deferred to 0026 Part F, gated
--   on zero dependencies proven here); change any table's RLS enabled/forced
--   state; change app code / Auth / Edge Functions.
--
-- RUN ORDER (dependency chain): 0024_activity_log_hardened (done) -> THIS (0025)
--   -> 0026_customer_portal_access. RLS stays ENABLED on all 5 tables; with the
--   customer-self policies gone and no client grants, they remain default-deny.
--
-- Parts: A preflight -> B migration -> C verification -> D post-drop dependency
--   re-inventory (must be ZERO) -> E rollback (restores ONLY the 5 policies + helper).
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT (READ-ONLY; run first, paste + SAVE every result)
-- =====================================================================

-- A1. The FIVE target policies exist and each references current_customer_id()
--     (expect exactly these 5 rows).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and policyname in (
    'customer_deposits_customer_self_select',
    'document_signatures_customer_self_select',
    'documents_customer_self_select',
    'portal_activity_member_insert',
    'portal_activity_member_select')
order by tablename, policyname;

-- A2. SAVE exact restore statements for those 5 policies (used verbatim by Part E
--     rollback). Copy this output and keep it with the run log.
select
  case
    when cmd = 'INSERT' then
      format('create policy %I on public.%I for insert to %s with check (%s);',
             policyname, tablename, array_to_string(roles, ', '), with_check)
    else
      format('create policy %I on public.%I for %s to %s using (%s)%s;',
             policyname, tablename, lower(cmd), array_to_string(roles, ', '), qual,
             case when with_check is not null then ' with check ('||with_check||')' else '' end)
  end as restore_stmt
from pg_policies
where schemaname='public'
  and policyname in (
    'customer_deposits_customer_self_select',
    'document_signatures_customer_self_select',
    'documents_customer_self_select',
    'portal_activity_member_insert',
    'portal_activity_member_select')
order by tablename, policyname;

-- A3. The 8 UNRELATED staff/manager policies that MUST remain untouched
--     (expect exactly these 8; SAVE — Part C must match identically).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
  and policyname not in (
    'customer_deposits_customer_self_select',
    'document_signatures_customer_self_select',
    'documents_customer_self_select',
    'portal_activity_member_insert',
    'portal_activity_member_select')
order by tablename, policyname;

-- A4. Helper public.is_current_customer(uuid): confirm it exists, calls the
--     resolver, and SAVE its exact definition for Part E rollback.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proacl,' | '),'(default ACL)') as execute_acl,
       (pg_get_functiondef(p.oid) ~* '\mcurrent_customer_id\M') as calls_resolver,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_current_customer';

-- A5. Anything depending on is_current_customer(uuid)? It must be safe to drop
--     (expect 0 rows for each). If ANY row appears, STOP and reconcile.
--   a) other function bodies referencing it:
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname<>'is_current_customer'
  and pg_get_functiondef(p.oid) ~* '\mis_current_customer\M';
--   b) policies referencing it:
select tablename, policyname from pg_policies
where coalesce(qual,'') ~* '\mis_current_customer\M' or coalesce(with_check,'') ~* '\mis_current_customer\M';
--   c) views/matviews referencing it:
select schemaname, viewname, 'view' from pg_views where definition ~* '\mis_current_customer\M'
union all select schemaname, matviewname, 'matview' from pg_matviews where definition ~* '\mis_current_customer\M';

-- A6. Baseline: the 5 tables carry NO anon/authenticated/PUBLIC grants
--     (expect 0 rows). SAVE — Part C must remain 0 rows.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;

-- A7. Baseline resolver dependency count (expect 5 policies + is_current_customer).
--     Part D must show ZERO after the migration.
select 'policy' as kind, tablename||'.'||policyname as obj from pg_policies
where coalesce(qual,'') ~* '\mcurrent_customer_id\M' or coalesce(with_check,'') ~* '\mcurrent_customer_id\M'
union all
select 'function', p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname<>'current_customer_id'
  and pg_get_functiondef(p.oid) ~* '\mcurrent_customer_id\M'
order by 1,2;


-- =====================================================================
-- PART B — MIGRATION (single transaction; NO CASCADE anywhere)
-- =====================================================================
begin;

-- B1. Drop ONLY the five current_customer_id()-dependent policies. The eight
--     unrelated staff/manager policies are NOT named here and are untouched.
drop policy if exists "customer_deposits_customer_self_select"   on public.customer_deposits;
drop policy if exists "document_signatures_customer_self_select" on public.document_signatures;
drop policy if exists "documents_customer_self_select"           on public.documents;
drop policy if exists "portal_activity_member_insert"            on public.portal_activity;
drop policy if exists "portal_activity_member_select"            on public.portal_activity;

-- B2. Retire the wrapper that also calls the unsafe resolver, so the resolver
--     reaches ZERO dependencies. NO CASCADE. (Part A5 must have shown no
--     dependents; A4 captured its definition for rollback.)
drop function if exists public.is_current_customer(uuid);

-- B3. Defensive re-revoke of client grants on the 5 tables (idempotent; the
--     baseline already shows none). postgres/service_role are NOT touched.
revoke all on table public.customer_deposits   from anon, authenticated, public;
revoke all on table public.document_signatures from anon, authenticated, public;
revoke all on table public.documents           from anon, authenticated, public;
revoke all on table public.portal_activity     from anon, authenticated, public;
revoke all on table public.portal_tokens       from anon, authenticated, public;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste every result)
-- =====================================================================

-- C1. The 5 target policies are GONE (expect 0 rows).
select tablename, policyname from pg_policies
where schemaname='public'
  and policyname in (
    'customer_deposits_customer_self_select',
    'document_signatures_customer_self_select',
    'documents_customer_self_select',
    'portal_activity_member_insert',
    'portal_activity_member_select')
order by tablename, policyname;

-- C2. The 8 unrelated staff/manager policies are UNCHANGED (must equal Part A3).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
order by tablename, policyname;

-- C3. is_current_customer(uuid) is GONE (expect 0 rows).
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_current_customer';

-- C4. RLS still ENABLED on all 5 tables (forced state unchanged; expect enabled=t).
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
order by c.relname;

-- C5. Still NO anon/authenticated/PUBLIC grants on the 5 tables (expect 0 rows) —
--     proves the tables remain inaccessible to every client after quarantine.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;

-- C6. postgres/service_role grants preserved (sanity; expect their rows present).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('customer_deposits','document_signatures','documents','portal_activity','portal_tokens')
  and grantee in ('postgres','service_role')
order by table_name, grantee, privilege_type;


-- =====================================================================
-- PART D — POST-DROP RESOLVER DEPENDENCY RE-INVENTORY (READ-ONLY; must be ZERO)
-- =====================================================================
-- Complete inventory of everything still referencing current_customer_id().
-- EVERY query below must return 0 rows before 0026 Part F may harden/replace it.
--   d1) policies:
select tablename, policyname from pg_policies
where coalesce(qual,'') ~* '\mcurrent_customer_id\M' or coalesce(with_check,'') ~* '\mcurrent_customer_id\M';
--   d2) functions/procedures:
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname<>'current_customer_id'
  and pg_get_functiondef(p.oid) ~* '\mcurrent_customer_id\M';
--   d3) pg_depend catalog deps:
select classid::regclass as dep_catalog, objid, deptype from pg_depend
where refobjid=(select oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='current_customer_id' order by oid limit 1)
  and deptype not in ('i');
--   d4) views/matviews:
select schemaname, viewname, 'view' from pg_views where definition ~* '\mcurrent_customer_id\M'
union all select schemaname, matviewname, 'matview' from pg_matviews where definition ~* '\mcurrent_customer_id\M';
--   d5) triggers:
select event_object_table, trigger_name from information_schema.triggers
where action_statement ~* '\mcurrent_customer_id\M';
--   d6) defaults/check constraints:
select conrelid::regclass as "table", conname from pg_constraint
where pg_get_constraintdef(oid) ~* '\mcurrent_customer_id\M';


-- =====================================================================
-- PART E — ROLLBACK (restores ONLY the 5 policies + the retired helper)
-- =====================================================================
-- Prefer the exact statements you SAVED from Part A2 (policies) and Part A4
-- (function definition); the reconstructions below match the observed live
-- definitions. Nothing else is touched. Does NOT re-add any client grant.
--
-- begin;
--   -- 5 policies (verbatim from live A1/A2):
--   create policy customer_deposits_customer_self_select   on public.customer_deposits
--     for select to authenticated using (customer_id = current_customer_id());
--   create policy document_signatures_customer_self_select on public.document_signatures
--     for select to authenticated using (customer_id = current_customer_id());
--   create policy documents_customer_self_select           on public.documents
--     for select to authenticated using (customer_id = current_customer_id());
--   create policy portal_activity_member_insert            on public.portal_activity
--     for insert to authenticated
--     with check (is_company_member(company_id) OR customer_id = current_customer_id());
--   create policy portal_activity_member_select            on public.portal_activity
--     for select to authenticated
--     using (is_company_member(company_id) OR customer_id = current_customer_id());
--
--   -- helper: re-create from the exact Part A4 definition you saved, then restore its ACL:
--   --   <paste saved CREATE FUNCTION public.is_current_customer(uuid) ...>
--   --   revoke all on function public.is_current_customer(uuid) from public, anon, authenticated;
--   --   grant execute on function public.is_current_customer(uuid) to service_role;   -- if it had it
-- commit;
--
-- NOTE: rollback restores the PRE-quarantine (unsafe) state. Only use it if the
-- quarantine caused an unexpected regression; otherwise leave quarantined and
-- proceed to 0026.
