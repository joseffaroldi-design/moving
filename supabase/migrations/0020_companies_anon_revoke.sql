-- =====================================================================
-- 0020_companies_anon_revoke.sql   (B4 — MEDIUM, least-privilege)
-- (Renamed from 0019_companies_anon_revoke.sql so 0019 is the invoice lockdown.)
--
-- FINDING (verified): the `anon` role holds a table-level SELECT grant on
-- public.companies (GET /rest/v1/companies -> HTTP 200). RLS currently returns
-- 0 rows to anon, so no data leaks TODAY — but the grant is defense-in-depth
-- drift: a future permissive policy would immediately expose company records
-- with no second barrier. Least privilege = anon should have NO grant.
--
-- SEPARATE from the invoice emergency (0019). Idempotent. Does NOT touch
-- authenticated's staff-scoped SELECT. Does NOT change RLS/policies.
--
-- ⚠️ PRE-CHECK: confirm the public homepage + mvp-dashboard do NOT read
-- companies via the anon REST endpoint. (Homepage uses no company data;
-- mvp-dashboard runs under a verified user/service context, unaffected.)
-- =====================================================================

begin;
revoke all on table public.companies from anon;   -- includes SELECT
commit;

-- VERIFY (read-only) — expect NO 'anon' row for companies:
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='companies' and grantee='anon';

-- Live check (should now be 401, not 200):
--   curl -s -o /dev/null -w "%{http_code}" \
--     "$SUPABASE_URL/rest/v1/companies?select=id&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"    # expect 401

-- ROLLBACK (only if a legitimate anon read is later required — prefer a
-- dedicated public VIEW instead of reopening the base table):
--   grant select on table public.companies to anon;
