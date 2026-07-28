-- =====================================================================
-- 0022_rebuild_b3_views.sql   [RC1 B3 — Step E: rebuild dependent views]
-- DRAFT — owner-executed manually via Supabase SQL Editor. Executes nothing
-- automatically. Additive/idempotent for the 3 named views only.
--
-- CONTEXT
--   0021 dropped 3 views that depended on the legacy invoice objects and
--   snapshotted their exact defs into rc1_backup.b3_views. Pre-flight
--   (owner-run, read-only) showed:
--     * job_profitability        -> CLEAN (only i.total); restore as-is.
--     * owner_dashboard_metrics  -> STALE (dropped public.payments, i.issue_date).
--     * unpaid_invoice_queue     -> STALE (i.issue_date, i.balance_due).
--
-- DECISIONS (owner): D1=sent_at basis, D2=sent_at aliased as issue_date,
--   D3=non-fan-out scalar subqueries for money metrics.
--
-- SECURITY (R3 remediation)
--   * All 3 rebuilt as ORDINARY views WITH (security_invoker = true) so they
--     evaluate under the CALLER's RLS — never the view owner's. This closes
--     the R3-class "view bypasses RLS" exposure.
--   * REVOKE ALL from anon, public. GRANT SELECT to authenticated only.
--   * No SECURITY DEFINER helper is used to source rows.
--
-- SAFETY
--   * Transactional. Aborts unless the current invoice schema + every column
--     these views need is present. Touches ONLY the 3 named views.
--   * Does NOT alter tables/data/policies/functions/enums/RPCs.
--   * Does NOT modify 0018 or 0021. Does NOT start Phase 8.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. PRECONDITIONS — abort fast if the post-0018 schema isn't present.
-- ---------------------------------------------------------------------
do $$
declare missing text;
begin
  -- Required tables.
  if to_regclass('public.invoices')         is null then raise exception 'ABORT: public.invoices missing'; end if;
  if to_regclass('public.invoice_line_items') is null then raise exception 'ABORT: public.invoice_line_items missing'; end if;
  if to_regclass('public.invoice_payments') is null then raise exception 'ABORT: public.invoice_payments missing'; end if;
  if to_regclass('public.companies')        is null then raise exception 'ABORT: public.companies missing'; end if;
  if to_regclass('public.leads')            is null then raise exception 'ABORT: public.leads missing'; end if;
  if to_regclass('public.quotes')           is null then raise exception 'ABORT: public.quotes missing'; end if;
  if to_regclass('public.jobs')             is null then raise exception 'ABORT: public.jobs missing'; end if;
  if to_regclass('public.customers')        is null then raise exception 'ABORT: public.customers missing'; end if;
  if to_regclass('public.job_expenses')     is null then raise exception 'ABORT: public.job_expenses missing'; end if;
  if to_regclass('public.payroll_entries')  is null then raise exception 'ABORT: public.payroll_entries missing'; end if;

  -- Required current invoice / payment columns (the ones the rewrite depends on).
  select string_agg(t.col, ', ') into missing
  from (values
    ('invoices','company_id'), ('invoices','job_id'), ('invoices','customer_id'),
    ('invoices','invoice_number'), ('invoices','status'), ('invoices','total'),
    ('invoices','amount_paid'), ('invoices','balance'), ('invoices','due_date'),
    ('invoices','sent_at'),
    ('invoice_payments','company_id'), ('invoice_payments','amount'), ('invoice_payments','paid_at')
  ) as t(tbl, col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.tbl and c.column_name=t.col
  );
  if missing is not null then
    raise exception 'ABORT: required current column(s) missing: %', missing;
  end if;

  -- Guard against retired columns sneaking back / wrong assumptions.
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='invoices'
               and column_name in ('issue_date','balance_due')) then
    raise exception 'ABORT: invoices unexpectedly still has issue_date/balance_due — reconcile before rebuild';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. DROP the three target views only (safe if absent). No CASCADE:
--    an unexpected dependent aborts the txn instead of silent removal.
-- ---------------------------------------------------------------------
drop view if exists public.owner_dashboard_metrics;
drop view if exists public.unpaid_invoice_queue;
drop view if exists public.job_profitability;

-- ---------------------------------------------------------------------
-- 2. owner_dashboard_metrics — REWRITTEN.
--    Every money/count metric is an INDEPENDENT per-company scalar
--    subquery, so no join can fan out and inflate totals. All money
--    aggregates COALESCE to 0. Scoped strictly by c.id (company).
-- ---------------------------------------------------------------------
create view public.owner_dashboard_metrics
with (security_invoker = true) as
select
  c.id as company_id,
  (select count(*) from public.leads l
     where l.company_id = c.id
       and l.created_at >= date_trunc('month', now()))                     as leads_this_month,
  (select count(*) from public.quotes q
     where q.company_id = c.id
       and q.status = 'accepted'::public.quote_status
       and q.accepted_at >= date_trunc('month', now()))                    as quotes_accepted_this_month,
  (select count(*) from public.jobs j
     where j.company_id = c.id
       and j.scheduled_start::date = current_date)                         as jobs_today,
  (select count(*) from public.jobs j
     where j.company_id = c.id
       and j.status = 'completed'::public.job_status
       and j.updated_at >= date_trunc('month', now()))                     as jobs_completed_this_month,
  coalesce((select sum(i.total) from public.invoices i
     where i.company_id = c.id
       and i.sent_at is not null
       and i.sent_at >= date_trunc('month', now())), 0::numeric)           as invoiced_this_month,
  coalesce((select sum(ip.amount) from public.invoice_payments ip
     where ip.company_id = c.id
       and ip.paid_at >= date_trunc('month', now())), 0::numeric)          as payments_this_month,
  coalesce((select sum(i.balance) from public.invoices i
     where i.company_id = c.id
       and i.status in ('sent'::public.invoice_status,
                        'partially_paid'::public.invoice_status)
       and i.balance > 0), 0::numeric)                                     as outstanding_amount
from public.companies c;

-- ---------------------------------------------------------------------
-- 3. unpaid_invoice_queue — REWRITTEN for invoices + invoice_payments.
--    * issue_date output alias sourced from invoices.sent_at (D2).
--    * balance from invoices.balance (legacy balance_due removed).
--    * "unpaid" = sent | partially_paid with positive balance (consistent
--      with owner_dashboard_metrics.outstanding_amount; drafts excluded,
--      void/paid naturally excluded).
-- ---------------------------------------------------------------------
create view public.unpaid_invoice_queue
with (security_invoker = true) as
select
  i.company_id,
  i.id            as invoice_id,
  i.invoice_number,
  i.status,
  i.sent_at       as issue_date,
  i.due_date,
  i.total,
  i.amount_paid,
  i.balance,
  (c.first_name || ' '::text) || c.last_name as customer_name,
  c.email         as customer_email,
  c.phone         as customer_phone,
  j.job_number
from public.invoices i
  left join public.customers c on c.id = i.customer_id
  left join public.jobs j       on j.id = i.job_id
where i.balance > 0::numeric
  and i.status in ('sent'::public.invoice_status,
                   'partially_paid'::public.invoice_status);

-- ---------------------------------------------------------------------
-- 4. job_profitability — RESTORED from the clean snapshot definition,
--    verbatim except for the security_invoker hardening. References only
--    current objects (jobs, quotes.total, invoices.total, job_expenses,
--    payroll_entries) — confirmed clean by pre-flight.
-- ---------------------------------------------------------------------
create view public.job_profitability
with (security_invoker = true) as
select
  j.id           as job_id,
  j.company_id,
  j.job_number,
  j.status,
  coalesce(i.total, q.total, 0::numeric)                                    as revenue,
  coalesce(exp.expense_total, 0::numeric)                                   as expenses,
  coalesce(pay.gross_pay_total, 0::numeric)                                 as labor_cost,
  coalesce(i.total, q.total, 0::numeric)
    - coalesce(exp.expense_total, 0::numeric)
    - coalesce(pay.gross_pay_total, 0::numeric)                            as estimated_profit
from public.jobs j
  left join public.quotes q   on q.id = j.quote_id
  left join public.invoices i on i.job_id = j.id
  left join (
    select job_expenses.job_id, sum(job_expenses.amount) as expense_total
    from public.job_expenses group by job_expenses.job_id
  ) exp on exp.job_id = j.id
  left join (
    select payroll_entries.job_id, sum(payroll_entries.gross_pay) as gross_pay_total
    from public.payroll_entries group by payroll_entries.job_id
  ) pay on pay.job_id = j.id;

-- ---------------------------------------------------------------------
-- 5. GRANT LOCKDOWN — anon/PUBLIC nothing; authenticated SELECT only.
--    (security_invoker=true still forces per-caller RLS on base tables.)
-- ---------------------------------------------------------------------
revoke all on table public.owner_dashboard_metrics from anon, public;
revoke all on table public.unpaid_invoice_queue    from anon, public;
revoke all on table public.job_profitability       from anon, public;

grant select on table public.owner_dashboard_metrics to authenticated;
grant select on table public.unpaid_invoice_queue    to authenticated;
grant select on table public.job_profitability       to authenticated;

commit;
