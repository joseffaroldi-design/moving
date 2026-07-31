# Production Deployment Plan — Southern Magnolia Movers

Frontend = Next.js 15 (App Router, `next start`, SSR). Backend/data = Supabase (Auth + Postgres +
Edge Functions + Storage). Migrations 0001–0026 (portal) applied; 0027 (crew reads) is authored,
owner-run. Nothing here is executed automatically — deploy/DNS/migrations need owner approval.

## Legend
[AGENT] I can do in-repo · [OWNER] you do · [EMERGENT] Emergent support/deploy · [SUPABASE] Supabase dashboard · [REGISTRAR] domain registrar

## 1. Create / confirm production deployment
- [OWNER][EMERGENT] Use the Emergent "Deploy" flow for this app to create the production deployment. Confirm it builds (the app already passes `yarn build`).

## 2. Production environment variables
- [OWNER] In the deployment env, set (names as used by the app):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon/publishable — never service-role in the client)
  - Anything the backend `.env` needs (kept server-side).
- [AGENT] I keep code reading these from env only (no hardcoded secrets) — verified.

## 3. Connect the production Supabase project
- [OWNER][SUPABASE] Point the production env vars at the production Supabase project (the one holding your real data). Confirm the URL/key match that project.

## 4. Redirect URLs
- [OWNER][SUPABASE] Authentication → URL Configuration → set **Site URL** to your production domain and add it to **Redirect URLs** (needed for password-reset/magic links).

## 5. Auth email URLs
- [OWNER][SUPABASE] Authentication → Emails → confirm templates use the production Site URL. Configure custom SMTP for reliable delivery.

## 6. Production domain
- [OWNER][EMERGENT][REGISTRAR] In the Emergent deploy, add your custom domain; at your registrar add the CNAME/records Emergent provides.

## 7. SSL
- [EMERGENT] SSL is issued automatically once DNS resolves. [OWNER] confirm `https://` loads with a valid certificate.

## 8. Run migrations in approved order
- [OWNER][SUPABASE] Against the production DB, run 0001 → 0026 in order if not already applied, then 0027 (Part A preflight → Part B → Part C verify). Use the runbooks in `/app/supabase/`.
- [AGENT] I author/verify SQL; I never execute it.

## 9. Read-only preflight checks
- [OWNER][SUPABASE] Run each migration's Part A preflight and the RC1/security verification queries; confirm expected results before applying changes.

## 10. Post-deployment verification (smoke)
- [OWNER] On the production URL: `/` loads; `/login` + `/portal/login` load; sign in as owner → `/dashboard`; run **Settings → health check**; create a throwaway quote and open its PDF.

## 11. Rollback plan
- [OWNER][EMERGENT] Keep the previous deployment available; if the new deploy misbehaves, roll back via Emergent (or the platform "rollback" option) — no code reset needed.
- [OWNER][SUPABASE] Each migration ships a Part E rollback (drops only its own objects). Restore from a backup only as a last resort.

## 12. Backups
- [OWNER][SUPABASE] Database → Backups: enable daily backups / PITR; confirm a fresh backup exists immediately before applying migrations.

## 13. Error logs
- [OWNER][SUPABASE] Logs → Postgres/Auth/Edge Functions. [EMERGENT] deploy/runtime logs in the deploy dashboard.

## 14. Production smoke test
- [OWNER] Run the Final Owner Acceptance test (`FINAL_OWNER_ACCEPTANCE.md`) end-to-end on production with a throwaway customer, then delete the test data.

## Data export & recovery
- [OWNER][SUPABASE] Table/CSV export via the dashboard or `pg_dump`; recovery via backups/PITR. Keep an off-platform copy of a recent export.
