# RC1 Observability Plan (MVP) — Southern Magnolia Movers (MoveOps)

Goal: make production incidents DETECTABLE before customers report them, without adding paid
services unless approved. Everything below is config + thin repo abstractions.

## Guiding rules
- PII REDACTION is mandatory in every log/telemetry path: never log emails, phones, addresses, names,
  full quote/invoice amounts tied to a person, tokens, JWTs, or the anon/service keys. Log IDs (uuid),
  company_id, event type, status codes, RPC name, and coarse timings only.
- No secret in logs. Scrub `Authorization`, `apikey`, cookies before any capture.

## 1. Frontend error tracking  [status: NOT CONFIGURED → recommend]
- Add a top-level React Error Boundary (App Router `app/error.tsx` + `app/global-error.tsx`) that shows a
  friendly fallback and reports to a single `reportError(err, context)` abstraction (`src/lib/telemetry.ts`).
- Default sink = `console.error` (structured) behind a flag; production sink = Sentry (browser SDK) IF approved.
- Abstraction keeps vendor swappable and enforces redaction centrally.

## 2. Edge Function errors  [status: BLOCKED — functions not in repo]
- mvp-dashboard / me / app-health run in Supabase. Enable Supabase Function logs + set structured
  `console.error({event, fn, code})` inside each (owner update). Consider Supabase Log Drains (paid) later.

## 3. Authentication failures  [status: NOT CONFIGURED]
- Capture failed `signInWithPassword` (count + reason class only, e.g. "invalid_credentials"), never the email.
- Supabase Auth logs already record auth events server-side; document owner access to them.

## 4. Authorization denials  [status: PARTIAL — RPCs raise, not logged]
- SECURITY DEFINER RPCs `raise exception` on role/tenant failures. Add lightweight server logging by inserting
  into an `activity_log`/`security_events` table on deny (event, actor uuid, company_id, rpc, at) — via the
  existing activity-log phase (0003). Frontend: increment a denial counter via `reportEvent('authz_denied', {...})`.

## 5. Critical RPC failures  [status: NOT CONFIGURED]
- Wrap client RPC callers (quotes.ts/jobs.ts/dispatch.ts/leads.ts + future invoices.ts) so a thrown RPC error
  calls `reportEvent('rpc_error',{rpc, code})` (message scrubbed) before surfacing the toast. Central helper.
- MUST-FIX before Phase 8: the invoice auto-draft swallow (`set_job_status` → raise notice) must ALSO write a
  durable `invoice_generation_failures` (or activity_log) row so a lost invoice is queryable/alertable.

## 6. Deployment health checks  [status: PARTIAL]
- Add `app/api/health/route.ts` (or reuse app-health) returning `{status:'ok', commit, time}` — no secrets,
  no DB PII. Point the platform/uptime check at it. Verify it returns 200 only when the server is truly up.

## 7. Uptime monitoring  [status: NOT CONFIGURED]
- External uptime check (e.g. UptimeRobot/BetterStack free tier) on: prod `/` (200) and `/health` (200) and
  a synthetic `/dashboard` (expect 307). 1–5 min interval. Alert on 2 consecutive failures.

## 8. Security-event logging  [status: NOT CONFIGURED]
- Log (server side, redacted): anon-access attempts to protected tables (PostgREST logs), auth failures spike,
  authZ denials, approval-token invalid/expired hits, admin/owner role changes. Route to activity_log now;
  export/alert later.

## 9. Alerting & ownership  [status: NOT CONFIGURED]
- Minimum alerts: (a) uptime down, (b) error-rate spike (Sentry), (c) any `invoice_generation_failures` row,
  (d) auth-failure spike. Alert channel = owner email + optional Slack. Owner = business owner is on-call for RC1.

## Rollout order (MVP, no new paid deps required to start)
1. Error boundary + `telemetry.ts` with console sink + redaction (repo, safe).  [P0]
2. `/health` route + external uptime monitor.  [P0]
3. RPC-error + authZ-denial reporting hooks (repo).  [P1]
4. Durable invoice-failure sink (with Phase 8).  [P0 for Phase 8]
5. Sentry (browser + edge) — ONLY if owner approves the service.  [P1]

## Not doing without approval
- No paid APM/log-drain/Sentry integration is wired in yet. Abstractions are vendor-neutral so approval later
  is a one-file change.
