# RC1 Security Probe — Usage Guide

Script: `supabase/verification/audit_probe.sh`. Black-box checks of the LIVE security posture. It never
prints tokens/keys, never prints full PII responses (emails/phones/addresses are redacted), prints
PASS/FAIL/BLOCKED per check, and exits nonzero if any confirmed security failure is found.

## Required environment (public values; still not printed)
- `SUPABASE_URL`  = `https://PROJECT_REF.supabase.co`
- `ANON_KEY`      = Dashboard → Settings → API → `anon` `public` key

## Optional environment (enable deeper checks; NEVER commit)
- `STAFF_JWT`     = a valid staff access token (owner/ops/dispatch/sales)
- `CUSTOMER_JWT`  = a valid customer access token
- `APP_BASE_URL`  = your web origin (to smoke-test the public `/q/<token>` route)

### How to get a JWT safely (do NOT paste it into chat)
1. Sign in to the app in a browser.
2. DevTools → Application → Local Storage → the Supabase auth entry → copy the `access_token` value.
3. Export it locally only: `export STAFF_JWT=...` (or `.env.test`, untracked). Delete when done.

## Run
```
# anonymous-only (always safe; the core B1/B2 regression)
SUPABASE_URL=... ANON_KEY=... ./supabase/verification/audit_probe.sh

# with optional role checks
SUPABASE_URL=... ANON_KEY=... STAFF_JWT=... CUSTOMER_JWT=... APP_BASE_URL=https://... \
  ./supabase/verification/audit_probe.sh
```

## What each result means
- **PASS**  — the secure behavior was observed.
- **FAIL**  — a confirmed security problem (e.g. anon dashboard/invoices returned 200). Script exits 1.
- **BLOCKED** — a check could not run because an optional credential/URL wasn't provided (NOT a failure).
- **WARN**  — non-blocking note (e.g. B4 companies grant still open before 0020 is applied).

## Interpreting for the release gates
- B1 PASS requires: anon → 401, invalid JWT → 401, customer JWT → 403, staff JWT → 200 with no PII.
- B2 PASS requires: anon SELECT on invoices AND invoice_line_items → 401/403/404, anon INSERT denied.
- Protected business tables must all stay denied to anon (regression guard).

## Safety
- Read-only probes; no writes except one deliberately-denied anon INSERT attempt to `invoices` (expected to
  fail with 401/403/404; if it ever returns 2xx that itself is a FAIL).
- Copy the final PASS/FAIL/BLOCKED block into `RC1_OWNER_EVIDENCE_TEMPLATE.md`.
