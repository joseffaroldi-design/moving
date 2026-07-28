# RC1 — B1 (mvp-dashboard anonymous PII) — Owner Deployment & Verification Runbook

**Status:** B1 OPEN — REMEDIATION STAGED, NOT DEPLOYED.
Agent cannot deploy Edge Functions or run authenticated sessions. All steps below
are owner-executed. Do not paste raw JWTs/credentials into chat.

Preview URL: https://magnolia-movers-rc1.preview.emergentagent.com
Supabase project ref: yrvgovkkukmtdmgejtxc
Function endpoint: https://yrvgovkkukmtdmgejtxc.supabase.co/functions/v1/mvp-dashboard

---

## STEP 1 — Baseline (BEFORE deploy) — proves the current hole
Run in a terminal (no secrets needed):

```bash
FN="https://yrvgovkkukmtdmgejtxc.supabase.co/functions/v1/mvp-dashboard"
ANON="sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb"
# No auth header:
curl -s -o /dev/null -w "no-auth: %{http_code}\n" "$FN"
# anon key as bearer:
curl -s -o /dev/null -w "anon-key: %{http_code}\n" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$FN"
```
Expected NOW (vulnerable): both return **200** with company data + PII.

## STEP 2 — Deploy the secure function
Option A — Supabase CLI (from repo root, where `supabase/functions/mvp-dashboard/index.ts` lives):
```bash
supabase functions deploy mvp-dashboard --project-ref yrvgovkkukmtdmgejtxc
```
Option B — Supabase Dashboard → Edge Functions → mvp-dashboard → paste the contents
of `/app/supabase/functions/mvp-dashboard/index.ts` → Deploy.

No secrets/config changes are required (SUPABASE_URL + SUPABASE_ANON_KEY are auto-injected).

## STEP 3 — Probe matrix (AFTER deploy)
`$TOKEN` = a real user access_token (get it from the browser: DevTools → Application →
Local Storage → the `...-auth-token` entry → `access_token`; or `supabase.auth.getSession()`).
Do NOT paste tokens into chat — just record the HTTP codes.

```bash
FN="https://yrvgovkkukmtdmgejtxc.supabase.co/functions/v1/mvp-dashboard"
ANON="sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb"
STAFF_TOKEN="<owner or staff access_token>"
CUST_TOKEN="<customer-role access_token>"

curl -s -o /dev/null -w "A no-auth:        %{http_code}\n" "$FN"
curl -s -o /dev/null -w "B anon-key:       %{http_code}\n" -H "Authorization: Bearer $ANON" "$FN"
curl -s -o /dev/null -w "C invalid-jwt:    %{http_code}\n" -H "Authorization: Bearer not.a.jwt" "$FN"
curl -s -o /dev/null -w "E customer:       %{http_code}\n" -H "Authorization: Bearer $CUST_TOKEN" "$FN"
curl -s        -w "\nG staff body ^ (%{http_code})\n"      -H "Authorization: Bearer $STAFF_TOKEN" "$FN"
```

| Case | Request | Expected |
|------|---------|----------|
| A | No Authorization header | **401** |
| B | Publishable anon key as bearer | **401** |
| C | Invalid / expired user JWT | **401** |
| D | Authenticated **customer** | **403** |
| E | Authenticated **inactive** user | **403** |
| F | Authenticated user **without company** | **403** |
| G | Approved active **staff** | **200**, scoped to their company only |
| H | Staff from **another company** | Cannot see company #1's records (only their own) |

Staff 200 body must contain: `company_id`, `role`, `counts{customers,leads,quotes,jobs,dispatch_assignments,trucks}`,
`recent_leads[]`, `recent_quotes[]`, `upcoming_jobs[]`.
Body must NOT contain: customer `email`, `phone`, internal `notes`, or any other company's rows.

## STEP 4 — Post-deploy app smoke test (logged in as owner)
| Check | Pass = |
|-------|--------|
| Login / bootstrap (/me) | Loads, role resolves |
| Dashboard counts | customers/leads/quotes/jobs/dispatch/trucks render |
| Recent leads | list renders with names + route |
| Recent quotes | list renders with totals + status |
| Upcoming jobs | list renders |
| /mobile/jobs | job cards render |
| Onboarding card | shows neutral "Setup status unavailable" (NOT a false "Setup complete") |
| Browser console | no errors |
| Network tab | mvp-dashboard call returns 200 with Authorization: Bearer <user JWT> (not the anon key) |
| Cross-company | staff sees only their company's data |

## STEP 5 — Rollback (if the app breaks post-deploy)
Redeploy the previous function version:
- Supabase Dashboard → Edge Functions → mvp-dashboard → **Deployments** → select the prior
  version → **Restore/Redeploy**, or
- `git checkout <previous-commit> -- supabase/functions/mvp-dashboard/index.ts && supabase functions deploy mvp-dashboard --project-ref yrvgovkkukmtdmgejtxc`.
Note: the frontend now REQUIRES the secure (token) function. If you roll the function back to
the old public one, also revert the frontend commit, or the dashboard will 401.

---

**Do not mark B1 fixed until Cases A–H pass AND Step 4 smoke test passes with owner evidence.**
B2: MITIGATED WITH DOCUMENTED PLATFORM RESIDUAL. B3: NOT RECONCILED. Production: NO. Phase 8: LOCKED.
