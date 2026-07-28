-- =====================================================================
-- verify_0022_rebuild_b3_views.sql   [RC1 B3 Step E verification]
-- READ-ONLY. Run AFTER 0022 in the Supabase SQL Editor. Modifies nothing.
-- Produces 7 grids (A–G). If your editor only shows the last result, run
-- each grid separately and paste all 7.
-- =====================================================================

-- ---- GRID A: existence, kind, security_invoker, owner ----
select
  v.view_name,
  (c.oid is not null)                                   as exists_in_public,
  c.relkind = 'v'                                       as is_ordinary_view,
  exists (
    select 1 from unnest(coalesce(c.reloptions,'{}'::text[])) o
    where o ~* '^security_invoker\s*=\s*(true|on)$'
  )                                                     as security_invoker_true,
  pg_get_userbyid(c.relowner)                           as view_owner
from (values ('owner_dashboard_metrics'),('unpaid_invoice_queue'),('job_profitability')) v(view_name)
left join pg_class c     on c.relname = v.view_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by v.view_name;

-- ---- GRID B: definition-safety flags (all *_bad columns must be false) ----
with d as (
  select v.view_name,
         pg_get_viewdef(('public.'||v.view_name)::regclass, true) as def
  from (values ('owner_dashboard_metrics'),('unpaid_invoice_queue'),('job_profitability')) v(view_name)
)
select
  view_name,
  (def ~* '\mpayments\M')                              as refs_legacy_payments_bad,
  (def ~* '[a-z_]+\.issue_date')                       as refs_issue_date_source_bad,
  (def ~* '\mbalance_due\M')                           as refs_balance_due_bad,
  (position('quote_line_item_id' in def) > 0)          as refs_quote_line_item_id_bad,
  (position('i.paid_at' in def) > 0)                   as refs_invoices_paid_at_bad,
  -- unpaid_invoice_queue only: must expose issue_date sourced from sent_at
  case when view_name='unpaid_invoice_queue'
       then (def ~* 'sent_at AS issue_date') else null end
                                                        as unpaid_exposes_sent_at_as_issue_date,
  def                                                  as definition
from d
order by view_name;

-- ---- GRID C: role grants on the views (anon/PUBLIC must be empty; authenticated=SELECT) ----
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('owner_dashboard_metrics','unpaid_invoice_queue','job_profitability')
order by table_name, grantee, privilege_type;

-- ---- GRID D: authenticated SELECT on UNDERLYING base tables ----
-- security_invoker=true means a staff caller needs SELECT on each base table
-- (RLS then filters rows). has_select=false => that view errors for staff.
select t.tbl,
       has_table_privilege('authenticated', 'public.'||t.tbl, 'SELECT') as authenticated_has_select
from (values
  ('invoices'),('invoice_payments'),('companies'),('leads'),('quotes'),
  ('jobs'),('customers'),('job_expenses'),('payroll_entries')
) t(tbl)
order by t.tbl;

-- ---- GRID E: dependency list per view (base relations each view reads) ----
select v.relname as view_name,
       string_agg(distinct dep.relname, ', ' order by dep.relname) as depends_on
from pg_rewrite rw
join pg_class v   on v.oid = rw.ev_class
join pg_namespace nv on nv.oid = v.relnamespace and nv.nspname='public'
join pg_depend d  on d.objid = rw.oid and d.classid='pg_rewrite'::regclass
                 and d.refclassid='pg_class'::regclass
join pg_class dep on dep.oid = d.refobjid and dep.relkind in ('r','v','m')
where v.relname in ('owner_dashboard_metrics','unpaid_invoice_queue','job_profitability')
  and dep.relname <> v.relname
group by v.relname
order by v.relname;

-- ---- GRID F: fan-out correctness — view money metrics vs independent recompute ----
-- Proves owner_dashboard_metrics is NOT inflated: each pair must be equal.
select
  m.company_id,
  m.invoiced_this_month,
  chk.invoiced_recomputed,
  (m.invoiced_this_month = chk.invoiced_recomputed)   as invoiced_matches,
  m.payments_this_month,
  chk.payments_recomputed,
  (m.payments_this_month = chk.payments_recomputed)   as payments_matches,
  m.outstanding_amount,
  chk.outstanding_recomputed,
  (m.outstanding_amount = chk.outstanding_recomputed) as outstanding_matches
from public.owner_dashboard_metrics m
join lateral (
  select
    coalesce((select sum(i.total) from public.invoices i
       where i.company_id = m.company_id and i.sent_at is not null
         and i.sent_at >= date_trunc('month', now())), 0::numeric) as invoiced_recomputed,
    coalesce((select sum(ip.amount) from public.invoice_payments ip
       where ip.company_id = m.company_id
         and ip.paid_at >= date_trunc('month', now())), 0::numeric) as payments_recomputed,
    coalesce((select sum(i.balance) from public.invoices i
       where i.company_id = m.company_id
         and i.status in ('sent'::public.invoice_status,'partially_paid'::public.invoice_status)
         and i.balance > 0), 0::numeric) as outstanding_recomputed
) chk on true
order by m.company_id;

-- ---- GRID G: read-only smoke selects (owner session) ----
select 'owner_dashboard_metrics' as view_name, count(*) as row_count from public.owner_dashboard_metrics
union all
select 'unpaid_invoice_queue', count(*) from public.unpaid_invoice_queue
union all
select 'job_profitability',    count(*) from public.job_profitability
order by view_name;
