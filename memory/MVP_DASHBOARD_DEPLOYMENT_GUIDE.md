# MVP Dashboard — Secure Edge Function Deployment Guide (B1)

Deploys the secure replacement at `supabase/functions/mvp-dashboard/index.ts`. No real secrets appear
here; the function reads platform-injected `SUPABASE_URL` and `SUPABASE_ANON_KEY` at runtime.

## What the new function enforces
- Requires `Authorization: Bearer <token>`; verifies the JWT (getUser). Missing/malformed/expired/invalid → **401**.
- Loads the caller's profile server-side; must be `is_active=true` and role ∈ {owner, operations_manager,
  dispatcher, sales}; otherwise → **403** (customers/unauthorized rejected).
- Derives `company_id` from the verified profile; ignores any client-supplied tenant id.
- Reads with a **user-scoped** client (caller's JWT) so RLS blocks cross-company access. **No service role.**
- Returns only counts + minimal recent lists (id/status/number/total/dates). **No email/phone/address/notes.**
- Explicit CORS + OPTIONS handling; structured errors; never logs tokens/keys/PII or DB error text.

## PRE-DEPLOY (mandatory rollback capture)
1. Dashboard → **Edge Functions** → `mvp-dashboard` → view code → copy ALL current code into a private
   local file `mvp-dashboard.PREVIOUS.txt`. This is your rollback artifact. Do not commit it.

## Option A — Supabase Dashboard (no CLI)
1. Dashboard → **Edge Functions** → `mvp-dashboard`.
2. Click **Edit** (or "Deploy a new version").
3. Replace the entire editor contents with the contents of `supabase/functions/mvp-dashboard/index.ts`.
4. Ensure **"Verify JWT" / "Enforce JWT"** setting: it is fine either ON or OFF because the function
   verifies the token itself; if a toggle exists, ON is acceptable and adds a second gate.
5. Click **Deploy**. Record the new **version id / timestamp**.
   - PASS: deploy succeeds. FAIL: fix the reported error; the previous version keeps serving until a new
     deploy succeeds (safe).

## Option B — Supabase CLI (optional)
```
# one-time: install CLI + login (uses YOUR access token via browser; never paste it in chat)
supabase login
supabase link --project-ref PROJECT_REF
# deploy (run from the repo root where supabase/functions/mvp-dashboard/index.ts lives)
supabase functions deploy mvp-dashboard
```
- PASS: CLI prints a successful deploy + version. FAIL: read the error; re-run after fixing.

## POST-DEPLOY VERIFICATION (B1 not "fixed" until all pass)
Run these (or `audit_probe.sh`). `$SUPABASE_URL`, `$ANON` from Dashboard → Settings → API.
```
# 1) anonymous -> MUST be 401
curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/functions/v1/mvp-dashboard" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# 2) invalid token -> MUST be 401
curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/functions/v1/mvp-dashboard" \
  -H "apikey: $ANON" -H "Authorization: Bearer not.a.jwt"
```
Optional (with a real login token obtained by signing in to the app — never paste it in chat):
- Staff token → **200** and the JSON contains NO `email`/`phone`/`address`/`notes` fields.
- Customer token → **403**.

## ROLLBACK
Redeploy `mvp-dashboard.PREVIOUS.txt` as a new version (Dashboard Edit → paste → Deploy, or
`supabase functions deploy mvp-dashboard` from the restored source). Instant; safe.

## NOTES
- If the app's dashboard page expected fields removed for privacy (e.g. `invoices`), that's expected — the
  UI should render counts/recent lists only. Adjust the client later if needed (not part of B1).
- Do NOT embed the service-role key in this function.
