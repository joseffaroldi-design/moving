-- =====================================================================
-- 0006_leads_customers_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 3 prerequisite: grant hardening for
-- public.leads and public.customers.
--
-- WHY: both tables grant anon INSERT/UPDATE/DELETE/TRUNCATE/SELECT and grant
-- authenticated DELETE/TRUNCATE/TRIGGER/REFERENCES. RLS is enabled (not forced)
-- and blocks anon row access + there are no delete policies, BUT TRUNCATE is a
-- table-level command NOT subject to RLS -> any anon/authenticated caller could
-- wipe these tables. We strip anon/public entirely and remove destructive/DDL
-- privileges from authenticated, keeping ONLY SELECT/INSERT/UPDATE (which the
-- existing RLS policies already gate correctly).
--
-- Additive-safe: existing RLS policies, rows, columns, triggers unchanged.
-- Transactional. Non-destructive.
-- =====================================================================

begin;

-- ---- public.leads ----------------------------------------------------
revoke all on table public.leads from anon;
revoke all on table public.leads from public;
revoke delete, truncate, trigger, references on table public.leads from authenticated;
grant  select, insert, update on table public.leads to authenticated;

-- ---- public.customers ------------------------------------------------
revoke all on table public.customers from anon;
revoke all on table public.customers from public;
revoke delete, truncate, trigger, references on table public.customers from authenticated;
grant  select, insert, update on table public.customers to authenticated;

commit;
