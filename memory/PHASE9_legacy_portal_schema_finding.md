# Phase 9 BLOCKER — legacy portal schema discovered in live DB (2026-06)

## Summary
`0025` (portal) Part A **aborted at A3**: the live Supabase DB contains 5 tables +
7 RLS policies that are NOT defined by any repo migration. 5 policies depend on
the **unsafe email-based `current_customer_id()`** (SECURITY DEFINER, owner
postgres, reads auth.users email, `LIMIT 1`). This BLOCKS `0025` Part B and blocks
revoking/replacing/dropping the legacy resolver until reconciled.

## Objects (from live A3 policy scan)
- `customer_deposits`  — policy `customer_deposits_customer_self_select` (SELECT, authenticated, USING customer_id = current_customer_id())
- `document_signatures`— policy `document_signatures_customer_self_select` (same shape)
- `documents`          — policy `documents_customer_self_select` (same shape)
- `portal_activity`    — `portal_activity_member_insert` (INSERT, WITH CHECK is_company_member(company_id) OR customer_id = current_customer_id());
                         `portal_activity_member_select` (SELECT, USING same)
- `portal_tokens`      — `portal_tokens_manager_select` (SELECT, USING can_manage_company(company_id));
                         `portal_tokens_manager_write` (ALL, USING/WITH CHECK can_manage_company(company_id))

## Provenance (why earlier inspection missed them)
- These belong to the ORIGINAL pre-existing MoveOps backend (handoff: "preserve
  existing Supabase backend + seeded data"). They are enumerated in
  `RC1_R1_object_matrix*.sql` and `RC1_R2_pre_snapshot.sql` alongside damage_reports,
  inventory_items, pricing_rules, rooms, sales_commissions, etc.
- They were never created by the numbered repo migrations (0001–0025), so a
  repo-migration grep for policies found nothing.
- RC1_R3 emergency anon lockdown DID revoke anon grants on them (incl. documents,
  customer_deposits, document_signatures) but did NOT touch their RLS policies.
- The RC1 object-matrix RESULTS were returned to the owner (not committed), so the
  committed repo never captured these live policies.

## Application usage
- NO frontend/backend/RPC/Edge/print code reads or writes these 5 tables.
- `/portal/documents` and `/portal/payments` are STATIC stubs (PageHeader +
  EmptyState only). nav.ts links to them. Portal is UI scaffold, no data path.

## current_customer_id() (live A3 def)
owner postgres; sig `current_customer_id()`; SECURITY DEFINER; search_path public;
email-based; reads auth.users email; uses LIMIT 1. NOT dormant — 5 live policies
call it. (0006 revoked client EXECUTE, but RLS policy expressions still invoke it
as the definer regardless of client EXECUTE grant.)

## Status
- 0024_activity_log_hardened: APPLIED + VERIFIED (complete).
- 0025 portal: Part B NO-GO until legacy customer-self policies + resolver
  reconciled. Do not drop/replace/revoke the resolver while these depend on it.
