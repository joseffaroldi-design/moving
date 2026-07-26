# RC1 Static Production-Readiness Audit — Southern Magnolia Movers (MoveOps)

Date: 2026-07-24 · Auditor scope: repo + non-destructive anon-key probes ONLY.
Status legend: PASS · FAIL · PARTIAL · BLOCKED · NOT ASSESSED.
Established (do not re-litigate): B1 CRITICAL, B2 CRITICAL, B3 HIGH, B4 MEDIUM. Production Ready = NO.

## Workstream A — Static security review
- [PASS] No `.env`/secret/key files git-tracked (`git ls-files`); `.gitignore` covers `.env`, `.env.*`, `*.env`.
- [PASS] No service-role/`sk_*`/secret-key references in `frontend/src`.
- [PASS] No committed archives/build artifacts. No `dangerouslySetInnerHTML`/`eval`. Zero `console.*` in source.
- [PASS] Redirects use `window.location.origin` only (AuthProvider reset, quotes share link) — not user-controlled.
- [PASS] No browser-supplied company_id/role/pricing/status trusted for authZ: all money + status computed
  server-side in SECURITY DEFINER RPCs (0014/0016b/0017c); role read from server `/me`, not client.
- [PASS] Only 3 TS escape hatches; none security-relevant.
- [PARTIAL] `frontend/.env` holds NEXT_PUBLIC_ publishable (anon) key only — safe to be public. No secrets. OK,
  but this is the same project's live anon key committed to the preview env file (expected for Supabase).
- FALSE POSITIVE ruled out: owner email in PRD.md is the business's public contact email (also on homepage), not a secret.

## Workstream B — HTTP & browser security
- BEFORE: `next.config.js` set NO security headers. [FAIL → FIXED (non-CSP)]
- CHANGE APPLIED (this session, safe/non-breaking) — `next.config.js` `headers()`:
  X-Content-Type-Options:nosniff · Referrer-Policy:strict-origin-when-cross-origin · X-Frame-Options:DENY ·
  CSP `frame-ancestors 'none'` (clickjacking; does NOT restrict resource loading) ·
  Permissions-Policy `microphone=(), camera=(self), geolocation=(self), browsing-topics=()` ·
  HSTS `max-age=31536000; includeSubDomains` · `poweredByHeader:false` (no `X-Powered-By`) ·
  Cache-Control `no-store` on `/dashboard/*`, `/portal/*`, `/mobile/*` (PII surfaces).
- [DEFERRED — needs live testing] Full resource CSP (script/style/connect/img). Legitimate domains the app requires:
  - default-src 'self'
  - connect-src 'self' https://yrvgovkkukmtdmgejtxc.supabase.co (REST + /functions/v1 + realtime wss)
  - img-src 'self' data: https://images.unsplash.com https://images.pexels.com https://yrvgovkkukmtdmgejtxc.supabase.co
  - script-src 'self' + Next runtime (needs nonce or 'unsafe-inline' fallback — must test)
  - style-src 'self' 'unsafe-inline' (Tailwind/inline styles)
  - font-src 'self' data:
  - frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Enforce in a dedicated pass with regression on auth, /q/[token], and /print/quote.
- [PASS] Cookies: Supabase `@supabase/ssr` manages HttpOnly auth cookies via middleware forwarding.
- [PASS/N-A] CSRF: app auth is Bearer-token via fetch to Supabase (not cookie-form POST to our own mutating routes);
  the FastAPI backend's only mutating route is trivial (`/api/status`). Low CSRF surface. Re-check if cookie-based
  same-origin mutating endpoints are ever added.
- [PARTIAL] Source maps: Next default does not serve client source maps in prod (`productionBrowserSourceMaps` unset). OK.
- [NOTE] CORS: applies to the vestigial FastAPI backend (Workstream F), not Supabase. See F.

## Workstream C — Authentication & session
- [PASS] Middleware uses `supabase.auth.getUser()` (revalidates against Supabase) for protected-route decisions —
  NOT `getSession()`. Protects `/dashboard`, `/portal`, `/mobile`; forwards refreshed cookies to avoid redirect loops.
- [PASS] AuthProvider uses `getSession()` only for initial client UI state (not an authZ gate). Role via server `/me`.
- [PASS] `me()` requires a valid JWT (anon → 401 verified). Signout clears me. Reset uses origin redirect.
- [RISK — MEDIUM] Public self-signup is ENABLED (`supabase.auth.signUp` open on /login). Email confirmation is ON
  (mitigates), and profile/company provisioning is a server-side auth.users trigger (not client-manipulable), but
  unbounded anonymous account creation is undesirable for a staff ops tool. RECOMMEND: disable public signups in
  Supabase Auth (or invite-only) for production; keep the signup UI behind an env flag. (Owner setting — not code-blocking.)
- [RISK — LOW] `next` param is set by middleware but IGNORED by login (redirects by role). No open-redirect (good),
  but users aren't returned to their intended page. Defer (UX, not security).
- [RISK — LOW, documented] Web Lock disabled in browser client (`lock: passthrough`) to avoid sign-in hang. Multi-tab
  token refresh could theoretically race; acceptable for single-session ops use. Keep documented; do not change for RC1.
- [BLOCKED] Live login / logout / confirm / reset round trips: need a staff test account.

## Workstream D — Error handling, logging, observability
- [PASS] No raw Postgres errors surfaced by design: RPCs `raise exception` with friendly text; UI shows `e.message`.
- [RISK — MEDIUM] `AuthProvider.bootstrap` swallows `/me` failures (sets me=null) — non-fatal but silently degrades role
  UI. Acceptable (server RPCs still enforce). Add observability (below), don't change behavior.
- [RISK — HIGH, by design] Invoice auto-draft error-swallowing path: in `0018_invoices.sql`, `set_job_status` wraps
  `_create_draft_invoice_for_job` in `exception when others -> raise notice` so a completed job still completes even if
  invoicing fails. Correct for reliability, but the failure is INVISIBLE (notice only). REQUIRED before Phase 8 go-live:
  emit a durable signal (activity_log row / dedicated invoice_generation_failures table) so a swallowed billing failure
  is detectable. (Tracked; 0018 is NOT being run now.)
- [FAIL — not configured] No frontend exception reporting, no Edge Function error export, no auth-failure/authZ-denial
  logging, no uptime/alerting. See RC1_OBSERVABILITY_PLAN.md for the MVP plan.
- [PARTIAL] `app-health` Edge Function exists (getHealth) — usefulness unverified (source not in repo).

## Workstream E — Reliability & failure modes
- See RC1_RISK_REGISTER.md failure-mode table. Highlights:
  [PASS] quote/job numbering + quote→job conversion are idempotent & advisory-locked (0013/0016b).
  [RISK] client mutations (lead edit, status change, add-note, generate-invoice) have no explicit double-submit guard
  beyond in-flight refs; RPCs are largely idempotent or safe on retry. Payments (`record_invoice_payment`) are NOT
  idempotent — a double-click could double-record a payment (Phase 8; add client guard + optional idempotency key).

## Workstream F — Dead code & release hygiene
- [RISK — MEDIUM/HIGH] Vestigial FastAPI+Mongo backend is LIVE (`backend/server.py`, supervised, autostart, port 8001,
  proxied at `/api`). Exposes `/api/status` GET/POST to Mongo `status_checks`. UNUSED by the Supabase app. It is an
  unnecessary attack surface and architecture-confuser that MAY deploy under the fastapi_react_mongo base image.
  CORS is `allow_origins=* + allow_credentials=True` (invalid/over-broad combo). ACTION: before production, either
  remove the backend from the deployment or restrict it. NOT deleted now (could break the preview supervisor / deploy
  pipeline); owner decision + deploy-config change required. (Data risk today is low: only trivial status_checks.)
- [PASS] `git ls-files` shows no committed archives, no test fixtures with secrets.
- [PARTIAL] CRA leftovers in `frontend/.env` (`REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`) — unused
  by Next; harmless. Defer cleanup.
- [PASS] `eslint.ignoreDuringBuilds:true` but `typescript.ignoreBuildErrors:false` (types ARE enforced at build). OK.
- Post-RC1 tech debt: dashboard/quotes/page.tsx (~830+ lines) oversized; consider splitting (NOT a release risk).

## Workstream G — B4 companies anon SELECT
- Repo intent: companies grant originates in `0002_business_profile.sql`. anon SELECT appears ACCIDENTAL/legacy
  (all sibling business tables are anon-denied). Harmless TODAY only because RLS returns 0 rows to anon — i.e.
  DANGEROUS under future policy drift (no second barrier). The public homepage uses no company data; mvp-dashboard
  reads under the service role (unaffected by revoking anon).
- REMEDIATION PREPARED (not run): `0019_companies_anon_revoke.sql` — idempotent revoke + verify + rollback. Kept
  SEPARATE from the invoice emergency lockdown per instruction.

## Changes applied this session (repo only; no live access)
1. `frontend/next.config.js` — added security headers + poweredByHeader:false + PII no-store. (B, safe.)
2. `supabase/migrations/0019_companies_anon_revoke.sql` — authored, NOT run. (G/B4.)
3. `supabase/migrations/RC1_diag_invoices_and_exposure.sql` — read-only diagnostics (prior step).
Docs: RC1_STATIC_AUDIT.md, RC1_RISK_REGISTER.md, RC1_REGRESSION_PLAN.md, RC1_TEST_ACCOUNT_MATRIX.md, RC1_OBSERVABILITY_PLAN.md.

## Verification of changes
- next.config headers: verified via `next build` + header curl + testing_agent regression (see final report).
- 0019 / diagnostics: read-only SQL, owner-run; verification queries embedded.
