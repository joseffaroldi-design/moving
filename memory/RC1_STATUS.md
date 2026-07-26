# RC1 — Production Readiness Status (Southern Magnolia Movers / MoveOps)

Engineer constraints: PREVIEW only. NO production access. NO DB DDL rights (all DDL
authored as SQL for owner to run + read-only verify). Live DB reachable ONLY via public
REST/functions with the anon publishable key (non-destructive probes) unless owner supplies
staff creds.

Legend: [VERIFIED] evidence-backed · [LIKELY] strong inference · [ASSUMED] unconfirmed · [BLOCKED] needs live access

## Evidence captured (2026-07-24, anon publishable key probes)
- [VERIFIED][CRITICAL] B1 mvp-dashboard exposes FULL customer PII to anonymous callers.
  `GET /functions/v1/mvp-dashboard` with anon key (no user JWT) → HTTP 200 with 6 leads incl.
  names/emails/phones/addresses/move dates, quotes, jobs, counts. Company "MoveOps Demo Company".
  Client (frontend/src/lib/api.ts getDashboard → baseHeaders(undefined)) intentionally calls it
  anonymously. Edge Function SOURCE IS NOT IN REPO → owner must fix in Supabase.
- [VERIFIED][CRITICAL] B2 legacy `invoices` + `invoice_line_items` tables have anon SELECT via
  PostgREST. `GET /rest/v1/invoices` and `/invoice_line_items` → HTTP 200 (content-range */0, 0 rows).
  Contrast: customers/leads/quotes/quote_line_items/jobs/trucks/dispatch_assignments/profiles all
  → 401 42501 (correctly locked). `invoice_payments` → 404 (does not exist).
- [VERIFIED][MEDIUM] B4 `companies` → anon SELECT grant present (HTTP 200, RLS yields 0 rows).
- [VERIFIED] `me()` with no token → 401 Unauthorized (good).
- [VERIFIED][HIGH] B3 schema drift: legacy invoices/invoice_line_items exist OUTSIDE migration
  history (0001–0017 don't create them; 0018 not applied). Their real columns are UNKNOWN.
  => `0018_invoices.sql` is UNSAFE as-is: `create table if not exists` would skip the drifted
  tables and bind grants/RPCs to the wrong schema. DO NOT RUN 0018 until reconciled.
- [BLOCKED] Tenant isolation, customer isolation, storage isolation: need ≥2 tenants or owner
  staff creds to prove cross-tenant SELECT/RPC denial with a live JWT.
- [BLOCKED] SSR production deploy: platform pipeline missing `/workspace/build-frontend-artifacts.sh`
  (Emergent Support ticket; job id a1cea123-32ab-4df6-b7fb-3d7b106e3374). App is build-ready
  (output:standalone, next build passes, 0 npm vulns).

## Pending owner actions (evidence needed before remediation)
1. Run `supabase/migrations/RC1_diag_invoices_and_exposure.sql` (read-only) → paste full output.
2. Provide the mvp-dashboard Edge Function source (Supabase Dashboard → Edge Functions → mvp-dashboard,
   or `supabase functions download mvp-dashboard`) so B1 fix can be authored/reviewed.
3. Provide a staff (owner) test login (or confirm a second tenant) for tenant-isolation proof.

## RC1 Release Gates (current)
Security: FAIL (B1, B2 open) · Database: BLOCKED (drift dx pending) · Deployment: BLOCKED (platform) ·
Reliability: NOT ASSESSED · Auth: PASS (me 401; locked tables 401) partial · Authorization: PARTIAL ·
Tenant Isolation: BLOCKED · Regression: NOT RUN · Monitoring: NOT ASSESSED · Recovery: NOT ASSESSED ·
Rollback: NOT DOCUMENTED · PRODUCTION READY: **NO**
