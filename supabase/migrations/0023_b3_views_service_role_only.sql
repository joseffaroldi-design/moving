-- =====================================================================
-- 0023_b3_views_service_role_only.sql   [RC1 B3 — Step E access model]
-- DRAFT — owner-executed manually. Executes nothing automatically.
--
-- DECISION (owner): the supported application path for these metrics is the
-- SECURED EDGE FUNCTION (service_role). Direct browser/authenticated reads of
-- these views are NOT supported and must NOT drive a broadening of authenticated
-- access to companies / payroll_entries. So: restrict all three B3 views to
-- service_role only.
--
-- SCOPE — GRANTS ONLY. This script:
--   * does NOT drop/recreate or redefine any view (definitions preserved),
--   * does NOT touch security_invoker=true (preserved on all three),
--   * does NOT alter any table, RLS policy, function, data, enum, or ownership,
--   * only changes role privileges on the three views.
--
-- EFFECT
--   REVOKE ALL from anon, PUBLIC, authenticated  (removes the authenticated
--     SELECT that 0022 granted).
--   GRANT  SELECT to service_role                 (the Edge Function path).
--   NOTE: service_role also carries broad platform-default privileges on these
--   views; those are Supabase-managed and intentionally left untouched (harmless
--   on read-only views). We only assert the SELECT it needs.
--
-- Transactional; idempotent; aborts if any of the three views is missing.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.owner_dashboard_metrics') is null then
    raise exception 'ABORT: public.owner_dashboard_metrics missing (run 0022 first)'; end if;
  if to_regclass('public.unpaid_invoice_queue') is null then
    raise exception 'ABORT: public.unpaid_invoice_queue missing (run 0022 first)'; end if;
  if to_regclass('public.job_profitability') is null then
    raise exception 'ABORT: public.job_profitability missing (run 0022 first)'; end if;
end $$;

-- Revoke every app-facing read path except the supported one.
revoke all on table public.owner_dashboard_metrics from anon, public, authenticated;
revoke all on table public.unpaid_invoice_queue    from anon, public, authenticated;
revoke all on table public.job_profitability       from anon, public, authenticated;

-- Grant only the SELECT the Edge Function (service_role) needs.
grant select on table public.owner_dashboard_metrics to service_role;
grant select on table public.unpaid_invoice_queue    to service_role;
grant select on table public.job_profitability       to service_role;

commit;
