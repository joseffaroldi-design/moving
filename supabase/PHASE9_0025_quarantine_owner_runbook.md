# Phase 9 — Quarantine Legacy Portal Policies (0025) — Owner Runbook

Author-and-review only. Nothing executed. No UI.
Migration file: `/app/supabase/migrations/0025_quarantine_legacy_portal_policies.sql`
Dependency position: run AFTER `0024_activity_log_hardened.sql`, BEFORE
`0026_customer_portal_access.sql`.

## Why
The live DB carries 13 RLS policies across `customer_deposits`,
`document_signatures`, `documents`, `portal_activity`, `portal_tokens`. **Five**
depend on the unsafe email-based `public.current_customer_id()`; a wrapper
`public.is_current_customer(uuid)` also calls it. These are LATENT (the 5 tables
have no anon/authenticated/PUBLIC grants, so they are not reachable via the Data
API today) but are a re-exposure risk and block hardening the resolver. This
migration removes exactly those 6 objects (5 policies + 1 helper), NO CASCADE,
preserving the 8 unrelated staff/manager policies and postgres/service_role access.

## Present reachability vs latent risk
- **Present:** NOT reachable by clients — no client grants on any of the 5 tables
  (D2/D3), and D8 shows zero Auth users whose email matches a customer + zero
  duplicate customer emails. So no live exploit path today.
- **Latent:** if any client grant is ever restored, or a matching/edited email
  appears, the email-based `LIMIT 1` resolver (no active/role/company checks)
  could expose financial (`customer_deposits.amount`), PII/e-sign
  (`document_signatures.signature_data/signed_ip`), storage paths
  (`documents.storage_path`), and forgeable audit (`portal_activity`) rows,
  potentially cross-company. Quarantine removes that latent path.

## Objects treated
DROP (quarantine): `customer_deposits_customer_self_select`,
`document_signatures_customer_self_select`, `documents_customer_self_select`,
`portal_activity_member_insert`, `portal_activity_member_select`,
and function `is_current_customer(uuid)`.
PRESERVE (untouched): the 8 staff/manager policies
(`customer_deposits_company_select/manager_insert/manager_update`,
`documents_company_insert/company_select/company_update`,
`portal_tokens_manager_select/manager_write`).

## Run steps
1. **Part A (read-only).** Run A1–A7; paste + SAVE. Pass: A1=5 rows; A2 emits 5
   restore statements (SAVE for rollback); A3=8 rows (SAVE); A4 shows the helper
   exists + `calls_resolver=true` (SAVE its definition); A5 a/b/c all 0 rows
   (helper is safe to drop); A6=0 rows; A7 lists exactly the 5 policies + the
   helper. **Abort** if A5 returns any dependent, or A1/A7 differ from expected.
2. **Part B (migration).** Run the `begin … commit;` block once. Expected:
   “Success. No rows returned.”
3. **Part C (verification).** C1=0 rows (policies gone); C2 == A3 (8 preserved);
   C3=0 rows (helper gone); C4 all `rls_enabled=true`; C5=0 rows (still no client
   grants); C6 shows postgres/service_role intact.
4. **Part D (resolver dependency re-inventory).** d1–d6 must **all** return 0
   rows — proves `current_customer_id()` now has ZERO dependents. This is the
   gate that unblocks `0026` Part F (resolver hardening).
5. Proceed to `0026_customer_portal_access.sql` (re-run its Part A first).

## Rollback (Part E)
Restores ONLY the 5 policies (from saved A2) + the helper (from saved A4). Does
not re-add client grants. Reverts to the pre-quarantine (unsafe) state — use only
on unexpected regression.

## Constraints honored
No CASCADE; the 8 unrelated policies are not named/altered; `current_customer_id()`
is not dropped/altered/revoked here (deferred to 0026 Part F, gated on Part D
zero-result); postgres/service_role grants untouched; no app/Auth/Edge changes.
