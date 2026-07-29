# RC1 — B3 (Legacy Invoice Schema Drift) Status

## Summary
Legacy invoice objects reconciled and new invoice schema/RPCs deployed and verified.

## Steps
- **Step A/B — Reconciliation drops (`0021_reconcile_legacy_invoices.sql`)**: EXECUTED & VERIFIED.
  Dropped legacy `invoices`, `invoice_line_items`, `payments`, and dependent views
  (`owner_dashboard_metrics`, `unpaid_invoice_queue`, `job_profitability`); snapshots captured in `rc1_backup`.
- **Step C — Apply new schema (`0018_invoices.sql`)**: EXECUTED ("Success. No rows returned").
- **Step D — Deployment verification (owner-run, read-only)**: **PASS** (owner-executed).
  Evidence row (all true, owner = `postgres`):
  - set_job_status_exists: true
  - set_job_status_owner: postgres  (trusted admin role, not anon/authenticated)
  - set_job_status_security_definer: true
  - set_job_status_safe_search_path: true  (search_path = public, pg_temp)
  - has_transition_guard: true
  - has_auto_draft_hook: true
  - fires_draft_on_completion: true  (gated on p_status = 'completed')
  - draft_creator_exists: true
  - draft_creator_security_definer: true
  - draft_creator_idempotent_lookup: true  (where job_id = p_job)
  - one_invoice_per_job_index: true  (partial unique index invoices_job_id_unique)
- **Step E — Rebuild dependent views securely**: PRE-FLIGHT DONE (owner-run, read-only). Rebuild pending owner authorization + 2 semantic decisions.
  Pre-flight findings (rc1_backup.b3_views):
  - All 3 views captured, defs readable, absent from public (as expected), no extras.
  - job_profitability: CLEAN — references only i.total; RESTORE AS-IS + add security_invoker=true.
  - owner_dashboard_metrics: STALE — references dropped public.payments (status/paid_at, payment_status enum)
    and retired i.issue_date. REWRITE: payments -> invoice_payments (no status filter),
    collected via sum(ip.amount) by ip.paid_at; invoiced date source = owner decision (created_at vs sent_at).
    Also fix money fan-out via per-company scalar subqueries.
  - unpaid_invoice_queue: STALE — i.balance_due -> i.balance (and WHERE), i.issue_date display -> owner decision
    (created_at vs sent_at). Rest maps cleanly.
  Owner decisions taken: D1=sent_at, D2=sent_at AS issue_date, D3=scalar-subquery (non-fan-out).

- **0022_rebuild_b3_views.sql**: DRAFTED + EXECUTED by owner. verify_0022 run (Grids A-G).
  Verification result = PARTIAL:
   - Grid A PASS: all 3 ordinary views, security_invoker=true, owner=postgres.
   - Grid B PASS: no legacy payments/issue_date-source/balance_due/quote_line_item_id/i.paid_at;
                  unpaid exposes sent_at AS issue_date.
   - Grid C PASS: only authenticated(SELECT)/postgres/service_role. NO anon/PUBLIC.
   - Grid E PASS: dependency lists exactly as intended.
   - Grid F PASS: view metrics == independent recompute (fan-out inflation ruled out).
   - Grid D GAP: authenticated lacks SELECT on companies + payroll_entries -> owner_dashboard_metrics
                 and job_profitability error for direct authenticated sessions.
  Assessment: likely NON-BREAKING today (dashboard reads via secured Edge Function/service_role;
  direct authenticated reads of these views are Phase 8, LOCKED). payroll_entries is sensitive -
  do NOT grant authenticated SELECT without confirming its RLS is company- AND role-scoped.
  Open decision: RESOLVED (owner) -> access model = service_role ONLY (Edge Function path).
  Do NOT broaden authenticated access to companies/payroll_entries.

- **0023_b3_views_service_role_only.sql**: DRAFTED (grants-only; view defs + security_invoker preserved).
  REVOKE ALL from anon/PUBLIC/authenticated; GRANT SELECT to service_role only.
  No table/RLS/function/data/ownership change. verify_0023 (Grids A-C) authored. Owner-executed; NOT run yet.

- **0023_b3_views_service_role_only.sql**: DRAFTED + EXECUTED by owner. verify_0023 Grid C = PASS.
  REVOKE ALL from anon/PUBLIC/authenticated; GRANT SELECT to service_role only.
  Grid C (owner-executed) for all 3 views: anon_select=false, authenticated_select=false,
  service_role_select=true. View defs + security_invoker=true preserved (grants-only migration).
  Access model locked to the secured Edge Function (service_role) path.

## Current status
B3: **CLOSED**. Legacy invoice objects reconciled (0021), new invoice schema + RPCs deployed &
verified (0018/Step D PASS), dependent views rebuilt securely with security_invoker=true and
non-fan-out metrics (0022), and locked to service_role-only access (0023). No anon/PUBLIC/
authenticated exposure. R2 rollback baseline preserved (588 grant rows / 42 relations,
48 default-priv rows); R4 not executed.

## Boundary
All DDL/verification is owner-executed via Supabase SQL editor. Agent authors SQL only; executes nothing.
