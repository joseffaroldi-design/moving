# Phase 8 — Invoices & Payments (UI) — STATUS: IN REVIEW (not complete)

Unlocked by owner (preview only; Production approval remains NO). Built against the
verified DB state (0018 schema/RPCs, 0021 reconciliation, 0022 secure views, 0023
service_role-only view access). NO schema/migration/Edge Function/RLS/grant changes.

## Data + security model (unchanged DB)
- Reads: authenticated, RLS-scoped SELECT on invoices / invoice_line_items / invoice_payments.
- Writes: SECURITY DEFINER RPCs only (company + role enforced server-side):
  generate_invoice_for_job, update_draft_invoice_with_items, mark_invoice_sent,
  record_invoice_payment, void_invoice. Mutator roles = owner, operations_manager, sales.
- "Overdue" is a DERIVED display state (sent/partially_paid + past due_date + balance>0), never
  a stored status.
- Dashboard unpaid summary reads the invoices TABLE (authenticated RLS), NOT the service-role-only
  views (0023 preserved).

## Files created
- src/lib/invoices.ts (service layer + RPC wrappers + preview math + role/overdue helpers)
- src/app/dashboard/invoices/[id]/page.tsx (detail route page)
- src/components/invoices/InvoiceEditorDrawer.tsx (edit draft)
- src/components/invoices/RecordPaymentDialog.tsx (manual payment)
- src/components/invoices/NewInvoiceFromJobDialog.tsx (create from completed job)
- src/components/invoices/UnpaidInvoicesCard.tsx (dashboard summary)
- src/app/print/invoice/[id]/page.tsx (branded printable invoice, server RLS read)
- src/components/print/InvoiceDocument.tsx (branded invoice document)

## Files modified
- src/app/dashboard/invoices/page.tsx (placeholder -> authenticated RLS list + filters + New button)
- src/lib/status.ts (added partially_paid tone)
- src/app/dashboard/page.tsx (added UnpaidInvoicesCard)
- src/lib/nav.ts (Invoices nav roles += sales, dispatcher — matches DB RLS)
- src/app/dashboard/jobs/page.tsx (completed-job Generate/View invoice; idempotent, role-gated)

## Deviation from plan
- None functionally. Detail is a dedicated route page (approved 3A). Job-detail button added
  (approved 1B). One trivial cleanup: removed an unused lucide import.

## Verification status
- tsc --noEmit: PASS. yarn build: PASS (28 routes incl. /dashboard/invoices, /dashboard/invoices/[id],
  /print/invoice/[id]).
- Route protection: /dashboard/invoices -> 307 /login unauthenticated (middleware).
- ⚠️ Authenticated UI flows + multi-role/cross-company authorization NOT auto-tested: no owner/test
  credentials are stored (per owner policy; test_credentials.md confirms none seeded). Behavioral +
  role/isolation verification is owner-executed via PHASE8_owner_test_runbook.md.
- DB-level invariants (server totals, one-invoice-per-job, duplicate-payment block, transitions,
  non-fan-out) are structurally verified (0018 Step D / 0022 Grid F); runbook has owner confirm E2E.

## NOT changed
- No SQL migrations, RLS, grants, functions, Edge Functions, production/hosting settings, or
  unrelated features. Service-role-only views untouched.

## To mark COMPLETE
Owner returns Checkpoint 4 evidence from PHASE8_owner_test_runbook.md (all sections pass).
