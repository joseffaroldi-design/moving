# RC1 Owner Runbook — Live Security Remediation (B1 + B2) & Evidence Collection

Audience: the business owner (non-specialist). Follow steps IN ORDER. Each step says whether it
**changes production**. Paste requested outputs into `RC1_OWNER_EVIDENCE_TEMPLATE.md`.
Golden rule: never paste passwords, tokens, keys, or customer data into chat.

Placeholders used below (you already have these values in your Supabase project):
- `PROJECT_REF` = your Supabase project ref (the `xxxx` in `https://xxxx.supabase.co`)
- `$SUPABASE_URL` = `https://PROJECT_REF.supabase.co`
- `$ANON` = your project's anon/publishable key (Dashboard → Project Settings → API → Project API keys → `anon` `public`)

---
## SECTION A — Emergency preparation
A1. **Confirm you can reach the SQL Editor.** Supabase Dashboard → your project → left sidebar → **SQL Editor**.
   - PASS: the editor opens. FAIL: you're in the wrong project/org → switch project (top-left selector).
   - Changes production? No.
A2. **Confirm a database backup / PITR exists BEFORE any change.** Dashboard → **Database** → **Backups**.
   - PASS: a recent daily backup (and/or PITR enabled) is listed. Record the latest backup timestamp.
   - FAIL: no backups → on Free plan PITR may be unavailable; at minimum take a manual snapshot:
     Dashboard → Database → Backups → **"Create backup"/"Download"** if offered, OR export via
     `pg_dump` (see Section F). Do NOT proceed to Section D until you have a recovery point.
   - Changes production? No (creating a backup is safe).
A3. **Locate the mvp-dashboard function.** Dashboard → **Edge Functions** → confirm a function named
   `mvp-dashboard` exists. Note its current state (you will replace it in Section C).
   - Changes production? No.

---
## SECTION B — Read-only evidence collection (SAFE, no production change)
B1. Open **SQL Editor** → **New query**.
B2. Open the repo file `supabase/migrations/RC1_diag_invoices_and_exposure.sql`. Copy its ENTIRE contents
   into the editor and click **Run**. It is strictly read-only (SELECTs only).
   - Expected: 14 labeled result sets (columns, constraints, indexes, triggers, RLS state, grants, etc.).
   - PASS: results appear with no error. FAIL: a permission error on block 14 (migration history) is OK —
     that one table may be restricted; all other blocks must succeed.
   - Changes production? **No.**
B3. Copy each result set into `RC1_OWNER_EVIDENCE_TEMPLATE.md` (Diagnostic SQL output). It contains
   **metadata only** (no customer data), so it is safe to paste back into chat.
B4. Run the black-box probe (anonymous only) — see Section E, step E1 — and record the "before" HTTP codes.

> STOP POINT: paste Section B evidence back before running Section C/D if you want the engineer to
> confirm the plan against your real schema. (Recommended.)

---
## SECTION C — Secure mvp-dashboard deployment (CHANGES PRODUCTION)
Goal: replace the function so it requires a valid staff login and stops returning PII to anonymous callers [B1].
Full details in `MVP_DASHBOARD_DEPLOYMENT_GUIDE.md`. Summary:
C1. **First capture the CURRENT function code for rollback.** Dashboard → Edge Functions → `mvp-dashboard`
   → open the code view → copy ALL current code into a local file `mvp-dashboard.PREVIOUS.txt` (keep private).
   - PASS: you have saved the old code. FAIL: if you cannot view it, STOP and ask support — do not deploy
     without a rollback copy. Changes production? No (copying).
C2. **Deploy the new code** from `supabase/functions/mvp-dashboard/index.ts`:
   - Dashboard path: Edge Functions → `mvp-dashboard` → **Edit/Deploy new version** → paste the new file's
     contents → **Deploy**. (Optional CLI path in the deployment guide.)
   - Expected: deploy succeeds; a new version/timestamp is shown. Record the version + timestamp.
   - PASS: deploy success. FAIL: build/deploy error → do NOT leave a half-deployed state; if it won't
     deploy, the previous version keeps running (safe) — report the error text (no secrets).
   - Changes production? **Yes.** Rollback: redeploy `mvp-dashboard.PREVIOUS.txt` (C1) as a new version.
C3. Verify (Section E, steps E2–E5). B1 is NOT considered fixed until E2–E5 pass.

---
## SECTION D — Invoice emergency lockdown (CHANGES PRODUCTION)
Goal: immediately deny anonymous access to the legacy invoice tables [B2], safely, before schema reconciliation.
D1. **Confirm you completed Section A2 (backup).** If not, go back. Changes production? No.
D2. SQL Editor → New query → paste the ENTIRE contents of
   `supabase/migrations/0019_invoices_security_lockdown.sql` → **Run**.
   - Expected: NOTICES like "locked down: public.invoices ..."; then two verification result sets.
   - PASS: verification set 1 shows `rls_enabled=true` AND `rls_forced=true` for each existing table;
     verification set 2 returns **ZERO rows** (no anon/authenticated/public grants).
   - FAIL: any anon/public grant remains, or RLS not forced → re-run (it is idempotent); if still failing,
     capture the output and stop.
   - Changes production? **Yes.** Rollback: `supabase/rollback/0019_invoices_security_lockdown_rollback.sql`
     (⚠️ reopens exposure — incident-response use only).
D3. Verify externally (Section E, step E6). B2 is NOT fixed until anonymous invoices/invoice_line_items → 401.

> NOTE: This does NOT run migration `0018` and does NOT create invoice features. Phase 8 stays deferred until
> B3 reconciliation is planned from your Section B evidence.

---
## SECTION E — Post-change verification (mix of safe + confirming)
Use `supabase/verification/audit_probe.sh` OR the manual curls. All are read-only probes.
E1. **Baseline (anonymous, before changes):**
   ```
   curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/functions/v1/mvp-dashboard" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
   curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/rest/v1/invoices?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
   ```
   Record the codes (expected BEFORE fixes: 200 and 200 — the vulnerabilities).
E2. After Section C — anonymous dashboard: rerun the first curl. PASS = **401**. FAIL = 200.
E3. Invalid JWT: `-H "Authorization: Bearer not.a.jwt"` → PASS = **401**.
E4. (Optional) Customer login token → dashboard → PASS = **403**.
E5. (Optional) Staff login token → dashboard → PASS = **200** AND response has NO email/phone/address fields.
E6. After Section D — anonymous invoices/invoice_line_items curls → PASS = **401/403/404**. FAIL = 200.
   - Full run: see `RC1_SECURITY_PROBE_GUIDE.md`. The script prints PASS/FAIL/BLOCKED and exits nonzero on
     any confirmed security failure.
   - Changes production? No (probing only).

---
## SECTION F — Rollback procedures (summary)
- **Edge Function (C):** redeploy the saved `mvp-dashboard.PREVIOUS.txt` as a new version. Safe, instant.
- **Invoice lockdown (D):** run `supabase/rollback/0019_invoices_security_lockdown_rollback.sql`.
  ⚠️ This REOPENS anonymous invoice access (B2). Use only during a controlled incident, then re-lock.
- **companies revoke (0020, optional):** rollback is a single `grant select on public.companies to anon;`
  (prefer a dedicated public view instead).
- **Database (worst case):** Dashboard → Database → Backups → **Restore** to the timestamp from A2, or
  `pg_dump`/`pg_restore`. PITR restore if enabled. Test restores on a staging project first if possible.

---
## SECTION G — Evidence to paste back into Emergent
Fill and paste `RC1_OWNER_EVIDENCE_TEMPLATE.md`. Include: diag output (metadata only), Edge Function
version/timestamp, lockdown verification result sets, and the probe PASS/FAIL/BLOCKED output. NEVER paste
tokens, keys, passwords, or customer records.

---
## SECTION H — Actions that MUST NOT be performed yet
- Do NOT run `supabase/migrations/0018_invoices.sql` (unsafe until B3 schema reconciliation).
- Do NOT build/enable Phase 8 invoice features.
- Do NOT delete the FastAPI/Mongo backend (see Section J — containment recommendation only).
- Do NOT change Supabase Auth signup settings until you've read Section I and decided.
- Do NOT paste any secret/PII into chat.

---
## SECTION I — Public signup remediation (Workstream 6) — RECOMMENDATION (no change yet)
Current: public self-signup is ENABLED; the customer portal is incomplete; staff accounts must be controlled.
**Recommendation (least privilege): DISABLE public signups now; create staff via invite; add a controlled
customer signup later when the portal ships.**
Exact Dashboard steps (do when you approve):
  I1. Dashboard → **Authentication** → **Providers** → **Email** → turn **"Allow new users to sign up"** OFF
      (a.k.a. disable public sign-ups). PASS: new signups are rejected server-side.
  I2. Create staff users manually: Authentication → **Users** → **Add user** (set email; send invite / set
      temporary password). Their profile/company is provisioned by the existing signup trigger.
  I3. Frontend: the sign-up toggle on `/login` should be **hidden or converted to an "invite only" message**.
      A repo change is prepared conceptually but NOT applied (needs your go-ahead + confirmation that no
      self-serve onboarding is expected for RC1). Changes production? Frontend redeploy only.
Do NOT change this live until you confirm the account model.

---
## SECTION J — Vestigial FastAPI/Mongo backend containment (Workstream 7) — RECOMMENDATION (no change yet)
Findings (verified): the FastAPI service runs under supervisor (`uvicorn server:app :8001 --reload`), is
**publicly reachable** via the preview ingress (`/api/` and `/api/status` → 200), is **not used by the
frontend** (no `/api/*` or `REACT_APP_BACKEND_URL` calls), talks to MongoDB, and uses CORS `*` with
credentials. It is an unnecessary attack surface and may deploy under the react/fastapi/mongo image.
**Recommendation: DISABLE before production** (do not delete yet — deletion may affect Emergent preview/deploy
tooling or a platform health check). Options, safest first:
  J1. Restrict/disable: ask Emergent Support whether the deploy or any health check depends on `/api/status`
      before disabling the `backend` supervisor program. (Do NOT stop it blindly in preview — it may be part
      of platform tooling.)
  J2. If retained temporarily: harden CORS to a specific origin and remove `allow_credentials=True` with `*`.
      A minimal patch is described in `RC1_STATIC_AUDIT.md`; it is NOT applied and must be kept SEPARATE from
      B1/B2 remediation.
Do NOT combine J with Sections C/D.
