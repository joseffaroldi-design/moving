# Public Estimate Intake — Owner Activation Runbook

All code is authored and build-verified. The remaining steps are **owner-gated**
(SQL execution + Edge Function deploy are not performed by the agent). Nothing
below changes the live homepage until the final flag is set.

Artifacts delivered:
- `supabase/migrations/preflight_0029_public_estimate_intake.sql` (READ-ONLY)
- `supabase/migrations/0029_public_estimate_intake.sql` (write; owner-executed)
- `supabase/functions/public-estimate-intake/index.ts` (Edge Function)
- `frontend/src/lib/publicIntake.ts` + `frontend/src/components/marketing/EstimateForm.tsx`
  (wired behind `NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED`, default OFF)

## Step 1 — Run Part A preflight (read-only)
Supabase → SQL Editor → paste SECTION 1 of `preflight_0029_...sql` → Run → paste
the `preflight` JSON back for review. Confirm NO stop condition (created_by
nullable on customers+leads, actor_id nullable, actor_role not constrained, no
name collision, no blocking trigger, exactly one business_profile row).

## Step 2 — Apply the write migration (only if Part A is clean)
Supabase → SQL Editor → run Part B of `0029_public_estimate_intake.sql`.
Then run the Part C verification queries and confirm:
- function is SECURITY DEFINER, owner = a BYPASSRLS role (postgres)
- EXECUTE grant = `service_role` ONLY
- `public_intake_idempotency` has no client grant + RLS enabled

## Step 3 — Deploy the Edge Function
```
supabase functions deploy public-estimate-intake --no-verify-jwt
supabase secrets set INTAKE_ALLOWED_ORIGINS="https://YOUR-PROD-DOMAIN,https://magnolia-movers-rc1.preview.emergentagent.com"
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
Smoke test (should create one lead + return the generic success):
```
curl -s -X POST "$SUPABASE_URL/functions/v1/public-estimate-intake" \
  -H "content-type: application/json" -H "apikey: $ANON" \
  -d '{"first_name":"Test","last_name":"Intake","phone":"5045550123","idempotency_key":"'"$(uuidgen)"'"}'
# -> {"ok":true,"message":"Your estimate request was received."}
```
Re-send with the SAME idempotency_key → still `ok:true` but NO second lead
(DB idempotency). Delete the test customer/lead afterward.

## Step 4 — Enable the frontend
Add to `frontend/.env` (single new key; do not touch existing keys):
```
NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED=true
```
Rebuild + restart the frontend. The homepage form now submits to the endpoint,
shows success ONLY after the server confirms, keeps entered values on failure,
and offers the call/text fallback.

## Step 5 — Post-activation verification (evidence)
- Valid anonymous submit → exactly one customer + one lead (status `new`,
  source `website`) + one `activity_log` row (`lead.public_intake`), visible in
  the staff Leads pipeline.
- anon still cannot call `create_public_lead` / `create_lead_with_customer` and
  cannot read/write base tables.
- Client-sent company/status/created_by are ignored; cross-tenant impossible.
- Oversized/invalid/whitespace payloads fail generically; no rows.
- Honeypot submissions → silent success, no rows.
- Double-click / same idempotency key → single record.
- No orphan customer on forced lead failure.
- Response never contains ids/DB detail.
- Existing staff/portal/auth/security tests pass; `tsc` + prod build pass;
  homepage appearance + responsive behavior unchanged.

## Rollback
- Frontend: remove/false the env flag, rebuild (instant revert to frontend-only).
- Edge Function: `supabase functions delete public-estimate-intake`.
- DB: run Part D of `0029_...sql` (drops function + idempotency table only).
