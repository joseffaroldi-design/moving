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
  Open owner decisions before drafting the rebuild migration:
    D1: owner_dashboard_metrics.invoiced_this_month date basis — created_at (draft) vs sent_at (issued).
    D2: unpaid_invoice_queue issue_date column source — created_at vs sent_at (or expose both).
    D3: money metrics correctness — scalar-subquery rewrite (recommended) vs faithful multi-join restore.

## Current status
B3: SCHEMA + RPCs VERIFIED (Step D PASS). Not fully closed until Step E views are rebuilt with
security_invoker and re-verified.

## Boundary
All DDL/verification is owner-executed via Supabase SQL editor. Agent authors SQL only; executes nothing.
