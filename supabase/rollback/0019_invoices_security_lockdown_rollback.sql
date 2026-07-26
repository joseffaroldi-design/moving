-- =====================================================================
-- 0019_invoices_security_lockdown_rollback.sql
-- ROLLBACK for 0019_invoices_security_lockdown.sql.
--
-- ⚠️⚠️  DANGER — THIS REOPENS PREVIOUSLY EXPOSED ACCESS.  ⚠️⚠️
-- Running this restores the INSECURE pre-lockdown state (anonymous SELECT on the
-- legacy invoice tables — release blocker B2). Use ONLY during a controlled
-- incident-response window if the lockdown is proven to break a required flow,
-- and re-lock immediately after. Do NOT leave the system in this state.
--
-- It restores ONLY the privileges the lockdown changed, based on the VERIFIED
-- pre-lockdown evidence (anon held SELECT on invoices + invoice_line_items;
-- invoice_payments did not exist). authenticated's pre-lockdown grants were
-- NOT positively enumerated — consult RC1_diag §9 output BEFORE running and
-- adjust the authenticated grants below to match the captured baseline.
-- =====================================================================

begin;

do $$
begin
  -- Reopen anon SELECT (the original exposure) on tables that exist.
  if to_regclass('public.invoices') is not null then
    execute 'grant select on table public.invoices to anon';
    -- Restore forced-RLS off ONLY if it was off before (0006/legacy: unknown).
    -- Leaving RLS enabled is safer; uncomment ONLY if a flow demands it:
    -- execute 'alter table public.invoices no force row level security';
  end if;

  if to_regclass('public.invoice_line_items') is not null then
    execute 'grant select on table public.invoice_line_items to anon';
  end if;

  -- invoice_payments had NO pre-existing exposure — intentionally NOT reopened.

  -- If RC1_diag §9 showed authenticated previously had SELECT, restore it, e.g.:
  -- execute 'grant select on table public.invoices to authenticated';
  -- execute 'grant select on table public.invoice_line_items to authenticated';
end $$;

commit;

-- Verify what was reopened (read-only):
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('invoices','invoice_line_items','invoice_payments')
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by table_name, grantee;
