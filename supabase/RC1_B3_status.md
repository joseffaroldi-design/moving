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
- **Step E — Rebuild dependent views securely**: NOT STARTED (pending owner authorization).
  Plan: new migration restoring `owner_dashboard_metrics`, `unpaid_invoice_queue`,
  `job_profitability` from `rc1_backup.b3_views` snapshot, enforcing `security_invoker = true`.

## Current status
B3: SCHEMA + RPCs VERIFIED (Step D PASS). Not fully closed until Step E views are rebuilt with
security_invoker and re-verified.

## Boundary
All DDL/verification is owner-executed via Supabase SQL editor. Agent authors SQL only; executes nothing.
