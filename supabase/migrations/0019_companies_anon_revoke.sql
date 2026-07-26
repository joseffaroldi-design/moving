-- =====================================================================
-- 0019_companies_anon_revoke.sql   (B4 — MEDIUM, least-privilege)
-- Southern Magnolia Movers — RC1 hardening.
--
-- FINDING (verified): the `anon` role holds a table-level SELECT grant on
-- public.companies (GET /rest/v1/companies -> HTTP 200). RLS currently returns
-- 0 rows to anon, so no data leaks TODAY — but the grant is defense-in-depth
-- drift: a future permissive policy would immediately expose company records
-- with no second barrier. Least privilege = anon should have NO grant.
--
-- SCOPE: intentionally SEPARATE from the invoice emergency lockdown. Idempotent.
-- Does NOT touch authenticated's staff-scoped SELECT. Does NOT change RLS/policies.
--
-- ⚠️ PRE-CHECK BEFORE RUNNING: confirm the public homepage and mvp-dashboard do
-- NOT read companies via the anon REST endpoint. (The homepage uses no company
-- data; mvp-dashboard runs under the service role, which is unaffected by this.)
-- Run RC1_diag first and confirm anon companies rows = 0.
-- =====================================================================

begin;
revoke select on table public.companies from anon;
revoke all    on table public.companies from anon;   -- belt-and-suspenders
commit;

-- ---------------------------------------------------------------------
-- VERIFY (read-only) — expect NO 'anon' row for companies.
-- ---------------------------------------------------------------------
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public' and table_name='companies' and grantee='anon';

-- Live check (should now be 401, not 200):
--   curl -s -o /dev/null -w "%{http_code}" \
--     "$SUPABASE_URL/rest/v1/companies?select=id&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"    # expect 401

-- ---------------------------------------------------------------------
-- ROLLBACK (only if a legitimate anon read of companies is later required):
--   grant select on table public.companies to anon;
-- (Prefer instead exposing a minimal, explicitly-public view.)
-- ---------------------------------------------------------------------
