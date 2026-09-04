# MoveOps — Product Requirements & Progress

## Problem Statement
Take over the existing MoveOps project (moving-company operations platform), build a
unified responsive Next.js frontend on top of the EXISTING Supabase backend
(project ref `yrvgovkkukmtdmgejtxc`). Preserve backend, RLS, Edge Functions, and
seeded demo data. Workflow: lead → quote → job → dispatch → crew → invoice/payment.

## Architecture
- **Frontend**: Next.js 15 App Router + TypeScript + Tailwind, at `/app/frontend`.
  Runs on port 3000 (`yarn start` → `next dev`). Production build via `yarn build`.
- **Backend**: Existing Supabase (Postgres + RLS + Edge Functions + Storage). Not modified.
- **Data layer**: `/dashboard` layout and `/mobile/jobs` are SERVER components
  (`force-dynamic`) that fetch the public `mvp-dashboard` Edge Function on the server
  and seed a client `DashboardProvider` (avoids client-fetch/hydration issues; renders
  real data in first paint). Defensive normalizer (`src/lib/normalize.ts`) + entity
  accessors (`src/lib/entities.ts`) map the live payload (nested `customers` object,
  `estimated_volume_cuft`, dispatch assignments embedding `jobs`/`trucks`).
- **Auth (built, not yet exercised)**: Supabase email/password + `/functions/v1/me`
  bootstrap + `create_owner_profile_for_current_user` RPC + role redirects.
- **Env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon only).

## Live payload shape (confirmed 2026-07-22)
Root keys: company{id,name,city,state,timezone}, counts{customers,leads,quotes,jobs,
dispatch_assignments,trucks}, leads[], quotes[], jobs[], dispatch[], (no top-level
trucks[] or onboarding[]). Customer joined under `customers` (plural). Lead statuses:
new, contacted, qualified, quoted, booked.

## Implemented & VERIFIED (testing agent iteration_1 = 100%, iteration_2 rebrand = 100%)
- **Southern Magnolia Movers rebrand (iteration 2, 2026-07-22):** navy/gold/cream
  design tokens, Playfair Display serif brand headings, crescent-moon SVG logo +
  favicon/login art, business identity in `src/lib/brand.ts` ((504) 559-6340 /
  smagnoliamoving@gmail.com, taglines). Branded: login (NOLA hero art), app shell
  (gold active nav), dashboard (welcome banner + Pipeline Revenue + Upcoming Moves
  cards), quotes drawer (branded quote header), settings (editable Business Profile),
  portal, crew mobile ("Southern Magnolia Crew"). Production build passes (25 routes).
- Fresh Next.js App Router + TS project (replaced legacy CRA scaffold).
- App shell (navy sidebar, topbar, breadcrumbs, mobile drawer), reusable UI kit.
- Dashboard renders real seeded data: counts 5/5/2/1/1/3, recent leads/quotes,
  upcoming job JOB-DEMO-001, onboarding (empty → "Setup complete").
- Leads (table + search + filters + mobile cards + detail drawer), Customers,
  Quotes (total + dates + actions), Jobs (status timeline), Dispatch (day-board with
  embedded truck/job, assigned run, fleet derived from payload), Invoices, Reports, Settings.
- Auth pages (/login, /forgot-password, /unauthorized) render with validation.
- Portal + Crew mobile routes present; production build passes (25 routes).

## Backlog / Next
- P0: Create first owner auth user; verify login → /me → owner-profile RPC → role redirect.
- P0: Replace public-demo list reads with authenticated Supabase/RLS table reads
  (keep mvp-dashboard as fallback only). Add protected-route middleware.
- P1: Wire actions to Edge Functions — public-lead-intake (New Lead),
  generate-quote-estimate/approve-quote (Quotes), assign-dispatch (Dispatch).
- P1: Customer portal (RLS-scoped) + crew mobile edge-fn wiring (clock-in/out,
  register-job-photo, crew-job-status-update).
- P2: Invoices/payments (create-deposit-payment, mark-payment-paid), Stripe,
  advanced reports, drag-and-drop dispatch, forgot-password split-screen polish.

## Known notes
- Some action buttons are intentional placeholders (toast only) until Edge Functions
  are wired: New Lead, Create Quote/Add Note, quote Send/Approve/Convert, dispatch assign,
  mobile clock/photos. These are MOCKED for milestone 1.
- Supabase free-tier auto-pauses on inactivity → if the app can't reach the backend,
  restore the project from the Supabase dashboard.

## Phase 2/1/8 slice (2026-07 — production hardening, in progress)
- Migrations AUTHORED (not yet applied by user) in /app/supabase/migrations/:
  0001_business_profile.sql, 0002_activity_log.sql, 0003_owner_role.sql (promote
  smagnoliamoving@gmail.com), 0004_job_photos_bucket.sql. All additive/idempotent.
- Frontend implemented & build-verified: protected-route middleware (redirects
  unauth /dashboard,/portal,/mobile → /login, verified 307), role-aware nav
  (allowedStaffNav), /auth/confirm email callback route, Business Profile load/save
  wired to business_profile table with brand.ts fallback, branded Quote PDF at
  /print/quote/[id] + Print button in Quotes drawer (verified rendering).
- Owner: smagnoliamoving@gmail.com. Auth: email/password signup, confirmation ON.
- PENDING USER ADMIN ACTIONS (one at a time): (1) Auth URL config, (2) run 0001,
  (3) run 0002 & 0004, (4) sign up + confirm owner, (5) run 0003.
- NEXT: after auth live — wire Leads/Quotes/Jobs/Dispatch create/edit to authenticated
  Supabase writes (Phases 3-5), crew mobile clock/photos (6), portal (7), invoices (9),
  activity logging (10), invoice PDF (8b).

## Production hardening — Phases 0-3 (2026-07, APPLIED & VERIFIED)
User applied all SQL manually in Supabase SQL Editor (agent has anon key only) and
returned read-only verification JSON for each. All verified.

- **Phase 0 security lockdown (0001_security_lockdown.sql):** revoked browser EXECUTE on
  create_owner_profile_for_current_user; stripped profiles grants to SELECT + column
  UPDATE(full_name,phone,avatar_url) only; added SECURITY DEFINER auth.users signup
  trigger handle_new_auth_user (role=customer, company_id NULL, is_active true, no
  metadata trust); added admin_set_profile_role RPC (owner/ops-manager, same-company,
  no self-change, ops-manager can't touch owner); granted has_company_role/
  is_company_member EXECUTE to authenticated. Frontend: removed the unsafe RPC call in
  AuthProvider.tsx.
- **Phase 1 business_profile (0002):** per-company table, UNIQUE(company_id), RLS
  (SELECT is_company_member, INSERT/UPDATE can_manage_company), no DELETE, trigger-only
  updated_at fn, anon/public stripped. Settings page loads/saves by me.profile.company_id.
  Owner load/save tested manually — WORKS.
- **Phase 2 owner (0004_owner_role.sql):** owner smagnoliamoving@gmail.com promoted,
  company f05941f2-13db-4779-a1f3-2d6a74ccffcd. Public signup OFF.
- **Phase 3 Leads/Customers/Notes (0006, 0007, 0008):**
  - 0006: grant hardening (leads/customers -> authenticated INSERT/SELECT/UPDATE only,
    anon/public none) + staff-only RLS. leads SELECT/INSERT/UPDATE = has_company_role
    {owner,operations_manager,dispatcher,sales}. customers SELECT
    {owner,operations_manager,dispatcher,sales}, INSERT/UPDATE {owner,operations_manager,
    sales}. Dropped weak customers_customer_self_select; current_customer_id non-executable
    by clients (portal will use a verified mapping later). RLS force-enabled.
  - 0007 + 0008: append-only public.lead_notes (company_id/lead_id/author_id/body/
    created_at), RLS staff read + insert (insert binds company_id to the lead's company +
    author_id=auth.uid()), authenticated INSERT/SELECT only (0008 stripped the Supabase
    default-privilege ALL grant). Indexes (lead_id,created_at desc)+(company_id).
  - Frontend: src/lib/leads.ts, customers.ts, leadNotes.ts (authenticated, company-scoped).
    Leads page: DB list + New Lead form + status dropdown (6 lead_status enum values) +
    append-only notes panel. Customers page: DB list + New/Edit forms.
  - VERIFIED via testing_agent iteration_3 (15/15) with throwaway qa-owner account.
- **Login bug fix (2026-07):** login/page.tsx password minLength now applies in signup
  mode only (was unconditional 6, blocked short legacy passwords). Verified iteration_4 (4/4).

## KNOWN LIMITATIONS / BACKLOG (post-Phase 3)
- **RESOLVED (2026-07): orphan risk** — 0009_create_lead_with_customer.sql APPLIED &
  verified. New Lead now uses one atomic SECURITY DEFINER RPC (company_id + created_by
  derived server-side, status hardcoded 'new', roles owner/operations_manager/dispatcher/
  sales). Frontend two-write path removed; duplicate-submit guarded by savingRef + loading
  button. Verified testing_agent iteration_5 (5/5).
- **Deferred:** customer-role RLS permission test ("implemented but not fully verified").
  test-customer@example.com attached to company for that test (customer role).
- **Next phases:** 4 Quotes, 5 Jobs/Dispatch, 6 Crew mobile, 7 Portal (verified
  user<->customer mapping via profiles.customer_id FK or customer_user_links, NOT
  email+LIMIT 1), 8 PDFs, 9 Invoices, 10 activity logging (wire admin_set_profile_role +
  lead actions).
- **Credentials:** owner password NOT stored anywhere (user policy). qa-owner throwaway
  account (role owner) used only for automated testing — user to delete after.

## Phase 4 — Quotes (2026-07, IN PROGRESS)
Strict workflow: agent authors additive SQL → user runs manually in Supabase →
returns read-only verification JSON → then frontend wired. Owner tests manually.

### Backend migrations
- **0011_quotes_grant_lockdown.sql — APPLIED & VERIFIED.** anon/PUBLIC stripped of ALL
  on quotes + quote_line_items; authenticated reduced to SELECT only (no INSERT/UPDATE/
  DELETE/TRUNCATE/TRIGGER/REFERENCES). Dropped all old policies (broad company_select,
  member_select, unsafe customer_self_select, FOR ALL sales_write). RLS enabled+forced.
  Added staff-only SELECT policies {owner,operations_manager,dispatcher,sales}. 2 rows intact.
- **0012_quote_status_enum_extend.sql — APPLIED & VERIFIED.** quote_status now:
  draft, sent, accepted, rejected, expired, viewed, converted, cancelled. Canonical
  accepted/rejected preserved (UI maps → Approved/Declined). Isolated migration (enum
  values can't be used in same tx that adds them).
- **0013_quote_number_generation.sql — APPLIED & VERIFIED.** next_quote_number(company)
  SECURITY DEFINER, advisory-xact-lock per company, format 'Q-0001', EXECUTE owner-only.
  Legacy numbers are 'Q-<hex>' → excluded by '^Q-[0-9]+$' filter, no collision.
- **0014_quote_pricing_and_mutation_rpcs.sql — AUTHORED, DEFERRED (NOT applied yet).**
  Adds columns tax_rate, deposit_percent, deposit_amount (numeric default 0). Adds
  helpers _require_quote_mutator, _compute_quote_totals, _assert_quote_scalars,
  _assert_quote_line_items (all internal, EXECUTE revoked from clients). Adds 6 client
  RPCs (authenticated EXECUTE): create_quote_with_items, update_draft_quote_with_items,
  duplicate_quote, mark_quote_sent, expire_quote, cancel_quote. Mutate roles
  {owner,operations_manager,sales}; dispatcher read-only. Server-authoritative pricing
  (percent /100). File saved at /app/supabase/migrations/0014_...sql with verification
  query in-thread. **User deferred applying it to build frontend first.**

### Pricing model (authoritative — server; UI preview mirrors it)
labor=round(hourly_rate*estimated_hours,2); line_items=round(Σ qty*unit_price,2);
gross_subtotal=round(labor+line_items+travel+packing+materials,2);
discounted=round(greatest(gross-discount,0),2); tax=round(discounted*tax_rate/100,2);
total=round(greatest(discounted+tax,0),2); deposit_amount=round(total*deposit_percent/100,2).
Stored subtotal=gross_subtotal. Labor is scalar-only (UI must not add labor line item).

### Frontend (BUILT, build-verified; authenticated visual test pending owner login)
- `src/lib/quotes.ts`: typed service layer — fetchQuotes, fetchQuoteLineItems,
  computeQuoteTotalsPreview (preview only), quoteStatusLabel, and RPC wrappers whose
  names/args mirror 0014 EXACTLY. Gate `QUOTES_WRITE_ENABLED=false` (flip to true only
  after 0014 applied+verified). BACKEND_REQUIRED_MSG constant.
- `src/app/dashboard/quotes/page.tsx` (rewritten): authenticated list (real fetchQuotes,
  RLS), search + status filter, table + mobile cards, amber "Backend setup required"
  banner. Quote Builder drawer (create from customer OR lead; edit draft; line-item
  editor add/remove; labor/fees/discount/tax%/deposit% inputs; LIVE preview totals).
  Detail drawer: pricing breakdown, line items, mapped status badge, PDF link, and
  Edit/Duplicate/Send/Expire/Cancel controls — ALL disabled + labeled until 0014.
  "To Job" disabled (Phase 5). No mocked success toasts; no direct table writes.
- `src/components/ui/status-badge.tsx`: added optional `label` prop (tone from raw status).
- `src/app/print/quote/[id]/page.tsx`: PDF now loads via AUTHENTICATED server-side
  Supabase read (session cookies, RLS staff) + line items — NO mvp-dashboard payload.
- `src/components/print/QuoteDocument.tsx`: line items show qty×unit; deposit row; status
  label mapped (Approved/Declined).
- Type check PASS, production build PASS (25 routes). Lint: ESLint not configured in repo.

### Remaining after 0014 applied+verified
1. Flip `QUOTES_WRITE_ENABLED` → true in src/lib/quotes.ts.
2. Test end-to-end (create/edit/duplicate/send/expire/cancel) — owner manual or approved
   least-privilege temp sales account (NOT a 2nd owner).
3. Then Phase 4 remainder: 0015 approval tokens (customer view/approve/decline), 0016
   quote→job conversion handoff (Phase 5).

## Phase 4 — Quotes UPDATE (2026-07)
- **0014 APPLIED & VERIFIED.** Pricing columns + 3 CHECK constraints + 8 SECURITY DEFINER
  fns + 2 INVOKER validators. PUBLIC/anon blocked; authenticated → 6 client RPCs only.
  Corrections folded in: lead/customer-mismatch rejection, strict JSON-array + per-item
  numeric/blank/negative validation, expiry guards. `QUOTES_WRITE_ENABLED=true`.
- **Six write flows:** Step 1 CREATE + Step 2 EDIT confirmed by owner (Q-0001). Steps 3-6
  (duplicate/send/expire/cancel) guided; owner proceeded to 0015 (treat as passed unless
  owner reports otherwise). Cleanup SQL for ZZZTEST quotes provided.
- **0015 APPLIED & VERIFIED (approval tokens).** SHA-256 hashed, 256-bit, single-use,
  revocable, expiring; table RLS-forced + zero client grants. Issuance staff-only;
  view/respond token-bearer (anon ok). Added respond_to_quote_approval expiry guard vs.
  user's uploaded draft.
- **Frontend token flow built (tsc PASS, routes serve):** quotes.ts +createQuoteApprovalLink/
  revokeQuoteApprovalLinks/getQuoteByApprovalToken/respondToQuoteApproval + PublicQuote.
  Quote detail drawer: staff "Create/Copy/Regenerate/Revoke approval link" (statuses
  draft/sent/viewed). New PUBLIC page `src/app/q/[token]/page.tsx` (outside protected
  middleware) — branded view + Approve/Decline via token RPCs; loading/error/decided states.
- **Security re-verified via live API:** anon get/respond return generic invalid-link error
  (no enumeration); anon create_link → 401. Positive path (staff creates link → customer
  approves) needs manual owner session (not auto-testable under no-credential rule).
- **middleware.ts** hardened: carries refreshed auth cookies onto the login redirect to
  prevent token-refresh redirect loops.
- **OP NOTE:** never run `yarn build` against the live `next dev` server — it corrupts
  `.next` (webpack-runtime 500s). Use `tsc --noEmit` for verification; if corrupted:
  `rm -rf .next && supervisorctl restart frontend`.

## Remaining
- Owner: confirm Steps 3-6 + the approval-link round trip (create link → open /q/<token> →
  approve/decline → status flips to accepted/rejected).
- 0016 quote→job conversion handoff (Phase 5 Jobs).

## Phase 4 — COMPLETE & VERIFIED (2026-07)
- Login hang FIXED (root cause: navigator Web Lock deadlock in signInWithPassword after a
  dev crash). Fix: pass-through `lock` in createBrowserClient (client.ts) + callFunction 15s
  abort + signIn no longer blocks on /me (6s race). middleware carries refreshed cookies on redirect.
- Owner confirmed ALL six quote flows (create/edit/duplicate/send/expire/cancel) + the
  approval-link round-trip (create link → public /q/<token> → approve → status flips → link single-use).
- ZZZTEST cleanup SQL provided.
- NEXT: 0016 quote→job conversion handoff (begins Phase 5: Jobs).

## Phase 5 — Jobs (2026-06, IN PROGRESS)
Same strict workflow: agent authors additive SQL → user runs manually → returns
read-only verification JSON → then frontend/RPCs wired.

### Backend migrations
- **preflight_0016a_jobs_schema.sql — RUN & returned.** Confirmed: 8 job tables are
  ordinary tables (relkind 'r'), `job_profitability` is a VIEW (owner postgres,
  security_invoker=true; depends on jobs, quotes, invoices, job_expenses,
  payroll_entries). All 7 real child tables FK `job_id → jobs(id) ON DELETE CASCADE`.
  job_crew + job_trucks have NO own company_id (only job_id + profile/truck id);
  the other children + jobs have NOT-NULL company_id. job_expenses.job_id is NULLABLE.
  Pre-lockdown: anon + authenticated held full DML+TRUNCATE on everything (P0).
- **0016a_jobs_grant_lockdown.sql — APPLIED & VERIFIED (full PASS).** Single txn.
  Aborts if any job_expenses.job_id (non-null) points to a job in a different company
  (verified 0 mismatches). On the 8 tables: anon/PUBLIC stripped; authenticated →
  SELECT only; RLS enabled + FORCED; all old broad policies (is_company_member /
  can_dispatch_company / can_manage_company / FOR ALL) dropped; exactly ONE staff SELECT
  policy each. Reads: jobs + job_checklists/job_photos/job_status_events/job_stops via own
  company_id for {owner,operations_manager,dispatcher,sales}; job_crew + job_trucks via
  parent jobs.company_id (same 4 roles); job_expenses (FINANCIAL) {owner,operations_manager}
  only on own company_id + null-safe parent-match guard. `job_profitability` VIEW: revoke
  ALL from anon/PUBLIC/authenticated (NO definition/owner change, NO re-grant) — access
  DEFERRED until invoices + payroll_entries get their own grant/RLS lockdown (avoids
  partial/misleading financials via underlying RLS). Verify query confirmed all counts.
  Rows preserved: jobs=1, job_profitability=1, rest 0.
- **0016b_quote_to_job_conversion.sql — APPLIED & VERIFIED (full PASS).** Single txn.
  Adds: (1) transactional duplicate guard + PARTIAL UNIQUE index jobs_quote_id_unique
  (quote_id where not null) = one job per quote at DB level; (2) next_job_number(uuid)
  internal advisory-lock helper, 'J-0001', EXECUTE revoked from public/anon/authenticated;
  (3) _require_job_converter() internal authz for {owner,operations_manager,dispatcher,sales};
  (4) convert_quote_to_job(p_quote_id, p_scheduled_start[req], p_origin_address[req],
  p_destination_address[req], p_scheduled_end?, p_crew_size?, p_truck_count?,
  p_dispatch_notes?) — SECURITY DEFINER, pinned search_path, authenticated EXECUTE only.
  Behaviour: only 'accepted' quotes convert; company/customer/actor derived server-side +
  cross-company checks; validates addresses(trim)/end>start/nonneg counts; creates job
  status='scheduled' + flips quote to 'converted' atomically. IDEMPOTENT: if a job already
  exists for the quote, returns existing {job_id, job_number, created:false} (no new job, no
  error); concurrent-race unique_violation caught -> same idempotent return. Verify confirmed
  all 15 summary checks. Job tables remain locked (no client write reopened).
- Rollback SQL provided (drops 3 fns + index; does NOT un-convert existing jobs).

### Deferred (Phase 5+ backlog)
- Restore `job_profitability` access (authenticated SELECT + guarded RPC) AFTER invoices +
  payroll_entries lockdown.
- Job write RPCs (SECURITY DEFINER, mirroring quotes 0014): create/update job, status
  transitions, dispatch (crew/truck assignment), crew-mobile append-only events.

### Frontend (Phase 5 conversion — BUILT, tsc + prod build PASS; owner manual test pending)
- `src/lib/jobs.ts` (NEW): authenticated RLS-scoped `fetchJobs(companyId)` (jobs + customer
  join, ordered by scheduled_start desc), `convertQuoteToJob(...)` wrapper mirroring 0016b
  args exactly (idempotent: created=false when quote already converted), `jobStatusLabel`,
  `JOB_STATUSES`. No direct client writes to locked job tables.
- `src/lib/leads.ts`: added `fetchLeadById(id)` (RLS-scoped) for Schedule Job prefill.
- `src/app/dashboard/jobs/page.tsx` (REWRITTEN): replaced mvp-dashboard payload with
  authenticated DB reads (fetchJobs). Removed the mock "New Job" button. Table + mobile cards
  show job #, customer, scheduled date/time, route (origin→destination), crew/trucks, status.
  Detail drawer: status timeline, schedule, route, dispatch notes, created/updated.
- `src/app/dashboard/quotes/page.tsx`: "To Job" button now shows only for canonical
  `accepted` quotes and is enabled (gated by canWrite); a "View Job" button shows for
  `converted` quotes (routes to /dashboard/jobs). New `ScheduleJobDrawer`: scheduled_start +
  origin + destination required; optional end/crew/trucks/notes; prefills date+addresses from
  linked lead (editable); client-side validation (required, end>start, nonneg) mirrors RPC;
  savingRef prevents duplicate submit; calls ONLY convert_quote_to_job; success panel shows
  returned job number + "Open Job"; treats created=false as success; refreshes quote list.
### Phase 6 — Dispatch + Job Status (2026-06, IN PROGRESS)
- **preflight_0017_dispatch_schema.sql — RUN & analyzed.** jobs/job_crew/job_trucks/
  job_status_events already locked (0016a). trucks + dispatch_assignments were wide-open P0
  (anon+auth full DML+TRUNCATE, RLS not forced). Two assignment models confirmed:
  dispatch_assignments (day-board: dispatch_day_id, truck_id, crew_lead_id, dispatch_status,
  windows, route/sort order; unique(dispatch_day_id,job_id)) vs job_crew (roster) / job_trucks
  (all trucks). job_status enum = scheduled,confirmed,in_progress,completed,cancelled.
  job_status_events.status is dispatch_status (operational log, NOT the lifecycle). No client
  status-transition or assignment RPCs exist. `can_dispatch_company` NOT executable by
  authenticated (old dispatch/trucks write policies were broken). dispatch_assignments.dispatch_day_id
  FK -> dispatch_days (schema unknown; needs its own preflight).
- **0017a_trucks_dispatch_grant_lockdown.sql — APPLIED & VERIFIED (full PASS).** trucks +
  dispatch_assignments: anon/PUBLIC stripped; authenticated SELECT only; RLS enabled+FORCED;
  broken can_dispatch_company write policies dropped; one staff SELECT policy each (own
  company_id, roles owner/operations_manager/dispatcher/sales). Rows preserved (trucks=3,
  dispatch_assignments=1).
- **Agreed model & rules (for 0017b/0017c):** dispatch_assignments = source of truth for the
  dispatch day/route/window/status/crew_lead/primary truck; job_crew = full roster; job_trucks =
  all trucks. RPCs must update related records atomically (no drift). Job-status setter roles:
  owner/operations_manager/dispatcher (NOT sales). Lifecycle: scheduled→confirmed→in_progress→
  completed; any non-terminal→cancelled; completed/cancelled terminal; block backward/skips;
  same-status = idempotent success. Do NOT use job_status_events for the 5-value lifecycle.
- **NEXT:** dispatch_days read-only preflight (delivered) -> then 0017b (job status RPC) ->
  0017c (assignment RPCs) -> frontend.

- **0017c_job_status_transitions.sql — APPLIED & VERIFIED (full PASS).** set_job_status(p_job_id,
  p_status) SECURITY DEFINER + pinned search_path, internal _require_job_status_setter guard
  {owner,operations_manager,dispatcher}. Legal matrix: scheduled→confirmed→in_progress→completed;
  any non-terminal→cancelled; completed/cancelled terminal; block backward/skips; same-status
  idempotent no-write. Does NOT touch job_status_events (dispatch_status). authenticated EXECUTE only.
- **0017d_dispatch_assignment_rpcs.sql — APPLIED & VERIFIED (full PASS).** 3 RPCs +
  internal _require_dispatcher {owner,operations_manager,dispatcher}: assign_job_to_dispatch
  (get-or-create dispatch_day via advisory lock; upsert dispatch_assignments on (day,job);
  HARD-BLOCK truck/crew_lead double-booking on a day — overlapping windows, or any same-day
  booking when either side lacks a full window; error names resource+conflicting job; atomic
  sync crew_lead→job_crew(crew_lead) + primary truck→job_trucks), set_job_crew (replace roster,
  re-assert assigned leads), set_job_trucks (replace list, re-assert primaries). All SECURITY
  DEFINER, pinned search_path, authenticated EXECUTE only. NOTE: crew-lead display-name lookup
  uses to_jsonb(profiles)->>key (column-safe) because profiles has no full_name column — a
  direct column ref aborted CREATE (check_function_bodies) on the first attempt; fixed.
  **Phase 6 BACKEND COMPLETE & VERIFIED. Frontend pending.**

### Phase 6 FRONTEND (2026-06, BUILT; tsc + prod build + anon negative tests PASS; owner manual test pending)
- `src/lib/jobs.ts`: added `setJobStatus`, `forwardJobTransition` (scheduled→confirmed→in_progress→
  completed), `isTerminalJobStatus`, `canSetJobStatus` (owner/ops/dispatcher).
- `src/lib/dispatch.ts` (NEW): RLS-scoped reads (trucks, company members via profiles, assignments
  for a date w/ dispatch_days!inner + trucks + jobs joins, job_crew, job_trucks) + RPC wrappers
  `assignJobToDispatch`/`setJobCrew`/`setJobTrucks`; `canDispatch` role helper. No direct writes.
- `src/app/dashboard/jobs/page.tsx`: detail-drawer status controls (Confirm/Start/Complete forward +
  Cancel w/ ConfirmDialog), 4-stage timeline incl. Confirmed, gated to owner/ops/dispatcher, calls
  only set_job_status, refreshes after success.
- `src/app/dashboard/dispatch/page.tsx` (REWRITTEN): authenticated day-board (date picker, assigned
  runs, unassigned jobs, fleet) + per-job Assign/Edit `AssignmentDrawer` (date, time window, primary
  truck, crew lead, route order, notes; full crew roster + truck-list multi-selects; lead/primary
  visually distinguished and force-included). Submits assign→set_job_crew→set_job_trucks; shows
  hard-block conflict errors in-drawer; preserves form on error; refreshes on success. Read-only
  banner + hidden mutation controls for sales/non-dispatch roles.
- Verified: tsc PASS; yarn build PASS (26 routes); unauth /dashboard/jobs & /dispatch → 307 /login;
  anon SELECT on jobs/dispatch_assignments/dispatch_days/trucks/job_crew/job_trucks → 42501; anon
  INSERT trucks → 401; all client + internal RPCs unreachable anon (404/401, never executed).
  **OWNER POSITIVE-FLOW TEST PENDING.**
- **BUGFIX (2026-06):** owner saw no status controls. Root cause: `useAuth().role` read only
  top-level `me.role`, but the deployed `me` function returns role at `me.profile.role` (Quotes
  never gated on role, so it went unnoticed). Fixed AuthProvider `role` to fall back to
  `me.profile.role`; added a read-only note in the Jobs drawer for genuinely unauthorized roles.
  tsc + build PASS. Re-test pending.
- **BUGFIX CONFIRMED (2026-06):** owner re-ran Test 1 — Confirm + Cancel Job controls now
  render on scheduled J-0001. Role resolution fix verified. Remaining owner checklist (status
  progression, dispatch assign/edit, conflict hard-block) still in progress.
- **PHASE 6 COMPLETE & VERIFIED (2026-06):** owner confirmed "all passed" — full job-status
  progression (scheduled→confirmed→in_progress→completed), cancel-to-terminal, dispatch
  assign/edit (window/primary truck/crew lead/roster/trucks), and hard-block truck/crew
  double-booking conflict. Backend (0017a–d) + frontend (jobs status controls + dispatch board
  & AssignmentDrawer) all live and verified. NEXT: Phase 7 Crew Mobile (pending user go-ahead).

- **PUBLIC MARKETING HOMEPAGE COMPLETE (2026-06-24):** Replaced the internal-ops landing at
  `/app/frontend/src/app/page.tsx` with a public marketing homepage for Southern Magnolia Movers.
  Sections: sticky header (nav + click-to-call + Free estimate CTA), navy hero (provided Unsplash
  mover photo), frontend-only Estimate form, Services (6, 3 with real stock photos: crew/truck,
  packing, clean-out), Why-us/trust (3), Service area, Contact CTA, footer with discreet Staff
  login link → /login. New file: `src/components/marketing/EstimateForm.tsx`.
  - Estimate form is FRONTEND-ONLY by design: no DB/API write, no store/transmit/log. On submit it
    renders a local estimate-request summary + "Online submission is coming soon. Call or text..."
    + prominent click-to-call. Structured with an EstimateValues type + comment marking where to
    POST to a future secure public lead-intake endpoint.
  - NO fabricated content: no reviews/testimonials/star-ratings, no invented hours or parish
    claims. Uses "Call or text for availability" and "New Orleans and surrounding communities"
    (both editable consts). Confirmed phone (504) 559-6340 + email smagnoliamoving@gmail.com.
  - Brand system (navy/gold/cream, Playfair/Chivo/IBM Plex) + existing Logo components. Mobile-first,
    next/image optimized, data-testids on interactive elements.
  - Verified: tsc PASS; yarn build PASS (all 26 routes incl. /login /dashboard /portal /q/[token]
    /mobile preserved, / static 3.06kB). Visual test desktop (1920) + mobile (390) PASS; estimate
    flow (fill → summary → coming-soon + call CTA) PASS. NOTE: frontend runs `yarn start` (prod
    build, NO hot reload) — must `supervisorctl restart frontend` after each build to serve changes.
  - PLACEHOLDER/PENDING: estimate form backend intentionally not wired (P1 upcoming). Reviews
    section intentionally omitted (structure left for easy add). No changes to Supabase/auth/RLS/
    migrations/internal workflows.

- **DEPENDENCY SECURITY CHECKPOINT (2026-07-24):** Pre-deploy audit + patched upgrades (all within
  existing majors — no major-version jump; Node 20 constraint respected).
  Changed: next 15.1.6→15.5.21, eslint-config-next 15.1.6→15.5.21, @supabase/supabase-js 2.48.1→
  2.109.0 (2.110+ needs Node 22), @supabase/ssr 0.5.2→0.7.0 (realigned cookie types), postcss(direct)
  8.5.1→8.5.22; ADDED sharp 0.35.3 (direct) + yarn resolutions {postcss 8.5.22, sharp 0.35.3} to
  override Next's bundled transitive deps.
  Fixes: 2 Critical (React-flight RCE; CVE-2025-29927 middleware auth-bypass — directly relevant as
  /dashboard,/portal,/mobile are middleware-gated), plus SSRF/DoS/postcss/sharp/auth-js.
  Audit: 35 vulns (2C/13H/16M/4L) → **0 vulnerabilities**. tsc PASS; yarn build PASS (26 routes intact).
  Smoke verified: Supabase auth reachable (bad creds→400); middleware redirect /dashboard,/portal,
  /mobile→307 /login; /login 200; /q/[token] 200; homepage desktop+mobile OK; LOGIN + LEADS confirmed
  working by owner (real seed data + lead drawer render). PENDING owner spot-check: Quotes, Jobs,
  Dispatch, /q/<token> approval page. NOT YET DEPLOYED — awaiting user approval.
  NOTE: supervisor runs `yarn start` = `next dev` (hot reload); prod serving would use `start:prod`
  (`next start`). After a `yarn build`, restart frontend to clear a transient dev 404.

- **LEADS EDIT ACTION (2026-07-24):** Added "Edit lead" to the lead detail drawer (authorized staff
  only) so incomplete/incorrect leads can be corrected. Files: src/lib/leads.ts (new updateLead +
  updateCustomerContact helpers using existing authenticated UPDATE paths) and
  src/app/dashboard/leads/page.tsx (edit mode in LeadDetailDrawer + parent refetch-on-save via
  fetchLeadById). Editable: first/last name, email, phone (customers row) + source, move_date,
  origin, destination, bedrooms, estimated_volume_cuft, notes (leads row). NOT editable: id,
  company_id, created_by, created_at, status; no Delete. Validation (name required, email format,
  non-negative numbers), preserves entered values on failure, success/error toasts, refreshes list +
  drawer. Status change + append-only lead_notes remain separate actions. No RLS/grants/migrations
  changed. tsc PASS; yarn build PASS. Owner verified editing the incomplete `j h` test lead — "works".

- **DEPLOY FIX — frontend cloud build failure (2026-07-24):** First production deploy failed at
  build step 8 "frontend-build-push" (exit 1). Root cause: the security checkpoint had added `sharp`
  as a DIRECT dependency; sharp@0.35.3 declares engines.node>=20.9.0, and yarn (v1, engine-strict in
  this toolchain) HARD-FAILS `yarn install` on an engine mismatch for a direct dep — whereas as
  Next's OPTIONAL dep the same mismatch is non-fatal/skipped. Cloud build runs on x86_64 (vs ARM64
  preview) with its own Node, so the direct sharp promoted a normally-skippable install into a fatal
  abort. FIX: `yarn remove sharp` (reverts sharp to Next's optional dep) while KEEPING the yarn
  resolution {sharp: 0.35.3} so it stays patched + non-fatal. postcss 8.5.22 resolution kept.
  Result: audit still 0 vulnerabilities; tsc PASS; yarn build PASS (16/16 static pages). Preview
  healthy (home 200, /dashboard→307). Ready for redeploy.

- **PROD SSR CONFIG (2026-07-24):** Production showed default nginx page because Emergent's managed
  deploy base image (fastapi_react_mongo_shadcn_base_image_cloud_arm) serves a STATIC frontend via
  nginx, but this is a Next.js SSR app needing a persistent Node server. Code-side made SSR-ready:
  frontend/package.json scripts now {dev: next dev -p 3000 -H 0.0.0.0, build: next build,
  start: next start -H 0.0.0.0 (honors process.env.PORT), lint} (removed start:prod); added
  next.config.js `outputFileTracingRoot: __dirname` (fixes dual-lockfile workspace-root inference).
  Clean prod build (rm -rf .next && next build) + `next start` VERIFIED IN PREVIEW: runs
  next-server v15.5.21 as a Node process; / 200 (hero renders), /login 200, /dashboard,/portal,
  /mobile 307 (middleware), /q/token 200; no 500s. tsc PASS; audit still 0 vulns.
  ⚠️ PLATFORM LIMITATION (NOT fixed by me): I have no access to the production environment and cannot
  change the managed base image, its build/run pipeline, or production nginx. A repo Dockerfile/
  nginx.conf is not honored by the managed deploy. So production will keep serving the nginx default
  until Emergent runs `npm run start` (Node server) and proxies nginx to it. Requires Emergent
  Support / a Next.js-SSR-capable deploy image. NOTE: preview now runs prod mode (no hot reload);
  after code edits, rebuild (rm -rf .next && yarn build) + restart frontend.


## RC1 — Production Readiness Engineering (2026-06, owner-executed SQL boundary)
Strict boundary: agent authors SQL only; owner runs all DDL/verification in Supabase SQL Editor.
Three critical blockers tracked. Status snapshot:
- **B1 (mvp-dashboard anon exposure): CLOSED (owner-attested, 2026-06).** Secured Edge Function
  deployed (strict JWT/company-scoped); frontend token forwarding wired. Owner executed all
  authorization probes A–H + Step-4 app smoke test: A/B + C (invalid/expired/missing) → 401;
  D customer → 403 forbidden; E inactive → 403 inactive_account; F no-company → 403 (not 404);
  G owner → 200 own-company, no PII; H second-company staff → 200 own-company only (no cross-company
  data). Probe evidence held by owner (JWTs not pasted per boundary). Runbook:
  /app/supabase/RC1_B1_owner_runbook.md.
- **B2 (anon DB exposure): MITIGATED WITH DOCUMENTED PLATFORM RESIDUAL.** R2 pre-snapshot preserved
  (rc1_backup.grant_snapshot=588 rows/42 relations; default_priv_snapshot=48 rows). R3 emergency anon
  lockdown + R5 default-privileges fix applied (postgres-owned unsafe defaults removed, VERIFIED).
  supabase_admin default ACL rows remain = platform-owned residual (insufficient privilege to alter).
  R4 rollback NOT executed. Status doc: /app/supabase/RC1_B2_status.md.
- **B3 (legacy invoice schema drift): CLOSED (2026-06).** See /app/supabase/RC1_B3_status.md.
  - 0021 reconciliation: dropped legacy invoices/invoice_line_items/payments + dependent views;
    snapshots in rc1_backup. Verified.
  - 0018 new invoice schema + SECURITY DEFINER RPCs + auto-draft-on-completion hook. Step D verify PASS
    (owner=postgres, security_definer, safe search_path, transition guard, idempotent, unique index).
  - 0022 rebuilt the 3 dependent views (owner_dashboard_metrics, unpaid_invoice_queue, job_profitability)
    with security_invoker=true; owner_dashboard_metrics rewritten to non-fan-out per-company scalar
    subqueries (D1=sent_at basis, D2=sent_at AS issue_date, D3=scalar subqueries). Verify Grids A/B/C/E/F
    PASS; Grid D revealed authenticated lacked SELECT on companies+payroll_entries.
  - 0023 (grants-only): locked all 3 views to service_role ONLY (REVOKE anon/PUBLIC/authenticated;
    GRANT SELECT service_role). Verify Grid C PASS. Access model = secured Edge Function path only;
    authenticated access to companies/payroll_entries intentionally NOT broadened.

### RC1 gate
**RC1 COMPLETE (2026-06)** — all three critical blockers closed (B1 owner-attested via probes A–H +
smoke test; B2 mitigated with documented supabase_admin platform residual; B3 fully reconciled/
secured). Production go/no-go and Phase 8 unlock remain the owner's explicit decision (not auto-
changed by RC1 completion). As last set: Production approval NO, Phase 8 LOCKED — awaiting owner
authorization to proceed to feature work.
Optional follow-ups: B2 supabase_admin residual via Supabase support (RC1_supabase_support_request.md);
SSR prod-deploy platform limitation (needs Node-server-capable deploy image).
RC1 migration files: /app/supabase/migrations/ (RC1_R2/R3/R5, 0018–0023, verify_002x).
## Phase 8 — Invoices & Payments UI (2026-06, IN REVIEW — owner-unlocked, preview only)
- Built on the verified DB (0018 schema/RPCs, 0021, 0022 secure views, 0023 service_role-only views).
  NO schema/migration/Edge Function/RLS/grant changes. Production approval remains NO.
- Reads: authenticated RLS-scoped SELECT on invoices/invoice_line_items/invoice_payments.
  Writes: SECURITY DEFINER RPCs only (generate_invoice_for_job, update_draft_invoice_with_items,
  mark_invoice_sent, record_invoice_payment, void_invoice); mutator roles owner/operations_manager/sales.
- Features: invoice list (status incl. derived Overdue, customer, job, issued=sent_at, due, total,
  balance) + filters; detail route /dashboard/invoices/[id] (summary, line items, payment history,
  actions); create-from-completed-job (invoices page dialog + Job-detail Generate/View, idempotent);
  draft editor (line items/tax/notes/due + preview); mark-sent; record manual payment (partial+balance,
  over-balance/zero/neg/nonnumeric blocked client-side, DB authoritative); void; branded printable
  invoice /print/invoice/[id]; dashboard UnpaidInvoicesCard (reads invoices table, NOT service-role views).
- Payments = manual recorded only (no processor).
- Files: NEW src/lib/invoices.ts, src/app/dashboard/invoices/[id]/page.tsx,
  src/components/invoices/{InvoiceEditorDrawer,RecordPaymentDialog,NewInvoiceFromJobDialog,UnpaidInvoicesCard}.tsx,
  src/app/print/invoice/[id]/page.tsx, src/components/print/InvoiceDocument.tsx.
  MODIFIED src/app/dashboard/invoices/page.tsx, src/lib/status.ts, src/app/dashboard/page.tsx,
  src/lib/nav.ts (Invoices nav += sales, dispatcher), src/app/dashboard/jobs/page.tsx.
- Verification: tsc PASS; yarn build PASS (28 routes); /dashboard/invoices -> 307 unauth.
  ⚠️ Authenticated multi-role/cross-company flows NOT auto-tested (no stored credentials, owner policy).
  Owner-executed runbook: /app/supabase/PHASE8_owner_test_runbook.md. Status doc: /app/memory/PHASE8_status.md.
- NOT complete until owner returns Checkpoint 4 evidence.

## Deployment target correction (2026-06)
- Intended PRODUCTION target changed from Emergent to **Vercel** (Emergent standard deploy targets React+FastAPI+Mongo; Next.js 15 SSR support unconfirmed per support).
- Blocker labels UNCHANGED by this hosting decision: RC1 COMPLETE; B1 CLOSED; B2 MITIGATED (documented platform-owned residual); B3 CLOSED.
- Production approval remains NO pending: Vercel deployment prep + owner authorization + post-deploy production verification.
- Vercel runbook: see PRC1 Checkpoint 3 audit (this session). No app/deploy/DB changes made during the audit.

## Phase 9 — Customer Portal foundation (2026-06, AUTHORED — pending owner execution)
Architecture APPROVED: **explicit-field read RPCs** (no customer base-table SELECT
policies; RLS filters rows not columns, so broad SELECT would leak internal cols).
Dependency-ordered migrations: 0024 (done) → 0025 quarantine → 0026 portal.
- **0024_activity_log_hardened.sql — APPLIED & VERIFIED (owner, 2026-06).** The
  legacy 0003 activity_log was never applied here (`to_regclass` null). Created a
  HARDENED audit sink: `company_id NOT NULL` (fixes cross-tenant read leak),
  append-only (authenticated=SELECT only; anon/PUBLIC none; NO client INSERT),
  writes only via SECURITY DEFINER functions that derive actor/company server-side.
  RLS enabled, NOT forced (analysed: won't block DEFINER insert). 4 indexes +
  company-scoped active-staff read policy. Verified: table+FKs+NOT NULL+grants+RLS+
  Security Advisor clean. Runbook: `PHASE9_0024_activity_log_owner_runbook.md`.
- **0025_quarantine_legacy_portal_policies.sql — AUTHORED (owner to run FIRST,
  before 0026).** Live-DB discovery (NOT repo-created): the original MoveOps
  backend carries 13 RLS policies on customer_deposits/document_signatures/
  documents/portal_activity/portal_tokens; 5 depend on the UNSAFE email-based
  `current_customer_id()` (+ wrapper `is_current_customer(uuid)`). All LATENT (no
  anon/authenticated/PUBLIC grants on those tables) but a re-exposure risk that
  blocks resolver hardening. Migration DROPs (NO CASCADE) exactly the 5 policies +
  the helper, defensively re-revokes client grants, preserves the 8 staff/manager
  policies + postgres/service_role, and re-inventories resolver deps (must be ZERO).
  Runbook: `PHASE9_0025_quarantine_owner_runbook.md`. Finding:
  `PHASE9_legacy_portal_schema_finding.md`.
- **0026_customer_portal_access.sql — REVISED & AUTHORED (was 0024→0025→0026).**
  Adds `customers.auth_user_id` (nullable FK + partial unique index) and:
  - `_portal_current_customer_id()` internal resolver — auth.uid() ONLY (no email,
    no LIMIT 1); active `customer` profile + non-null matching company; no client EXECUTE.
  - 6 explicit-`json_build_object` read RPCs (quotes/jobs/invoices list+detail);
    drafts hidden; jobs exclude dispatch_notes/crew/truck; payments exclude recorded_by;
    bounded pagination + deterministic order.
  - `portal_approve_quote(uuid)` — reproduces 0015 acceptance invariants (expiry
    guard + status-guarded atomic `UPDATE...RETURNING` + token revoke), row locked;
    ATOMIC/FAIL-CLOSED audit write (no exception handler) to hardened activity_log;
    identity from verified active profile (actor_role, company_id) + auth.users
    (actor_email), never client/customers.email.
  - `portal_update_contact(...)` — customer edits only own name/email/phone.
  - 8 client RPCs authenticated-EXECUTE only; anon/PUBLIC none. NO staff RLS/grant/
    business-logic changes. Part F revoke-hardens legacy resolver AFTER 0025
    quarantine makes deps zero (no drop). Runbook: `PHASE9_0026_portal_owner_runbook.md`.
- Preflight/exec so far: 0024 Part A/B/C DONE. 0026 portal Part A1/A2/A2b PASS;
  **A3 ABORTED** — surfaced the 5 legacy policies + is_current_customer → 0025
  quarantine authored. Remaining 0026 Part A (A3–A6) to be re-run AFTER quarantine.
- STATUS: awaiting owner approval + manual execution (author executes nothing).
  NO-GO on 0026 Part B until 0025 quarantine applied + Part D shows zero resolver
  deps. No portal UI built yet.

## Phase 9 — Customer Portal UI (2026-06, BUILT; OWNER ACCEPTANCE TESTING PENDING)
STATUS: **Phase 9 P1 — Customer Portal UI: BUILT; OWNER ACCEPTANCE TESTING PENDING.**
Code-complete and verified within the no-credentials boundary (tsc + build + unauth
redirects + print graceful states + 11/11 fixture tests). Authenticated customer flows
NOT yet verified against live Supabase — awaiting owner-executed acceptance testing via
`/app/supabase/PHASE9_portal_ui_owner_test_runbook.md` (11 checks). HOLD: no Stripe/online
payments, no new migrations/RPC changes, no Supabase/prod changes, no Crew Mobile, no
unrelated refactors until owner evidence closes P1. Then proceed to Phase 9 P2 — Crew
Mobile. Stripe is a deferred future enhancement (after core portal + ops workflows are
production-stable).

Backend 0024/0025/0026 APPLIED & VERIFIED (owner). test-customer@example.com linked.
Replaced the static portal stubs with a full RPC-backed portal. STRICT BOUNDARY honored:
the portal makes ONLY `rpc/portal_*` calls — NO base-table reads, NO service_role, NO
SQL/migration changes, NO new RPC. Client components use the browser Supabase session.

### New/changed files
- NEW `src/lib/portal.ts` — typed service layer; 8 RPC wrappers (names/args mirror 0026
  exactly): portalListQuotes/GetQuote/ListJobs/GetJob/ListInvoices/GetInvoice/
  ApproveQuote/UpdateContact. Re-exports pure helpers from portalLogic.js; isNotCustomerError;
  label helpers (quote/invoice/job).
- `src/lib/portalLogic.js` (pre-existing) + NEW `src/lib/portalLogic.test.mjs` (11 fixture
  tests, all pass via `node --test`): classifyApproval, isPortalOverdue, buildContactArgs,
  safeErrorMessage, outstandingBalance, quoteLooksApprovable.
- NEW `src/components/portal/PortalStates.tsx` (PortalNotCustomer state).
- NEW `src/components/portal/PortalPrintDocuments.tsx` (PortalQuotePrint, PortalInvoicePrint
  — render ONLY portal-RPC fields; branded; no staff loaders).
- REWROTE `src/app/portal/page.tsx` (Overview: outstanding/awaiting-quotes/next-move stats +
  recent quotes/invoices + upcoming move; computed from list RPCs; empty + not-customer states).
- REWROTE `src/app/portal/quotes/page.tsx` (list + detail drawer + Approve [handles accepted/
  expired/errors] + Print link).
- NEW `src/app/portal/jobs/page.tsx` ("My Move": list + detail drawer w/ 4-stage timeline;
  no dispatch notes/crew/trucks).
- REWROTE `src/app/portal/payments/page.tsx` (view-only invoices; derived Overdue; payment
  history; outstanding banner; "Contact us to arrange payment" → BRAND.phone; NO Stripe/writes).
- REWROTE `src/app/portal/documents/page.tsx` (polished coming-soon).
- NEW `src/app/portal/profile/page.tsx` (portal_update_contact only; fields blank w/ "leave
  blank to keep"; shows session email; gate via portal RPC, no customers read).
- NEW `src/app/print/portal/quote/[id]/page.tsx` + `.../invoice/[id]/page.tsx` (client;
  portal RPCs + window.print via PrintBar; under clean /print layout, outside AppShell;
  graceful "please sign in" state).
- `src/lib/nav.ts`: PORTAL_NAV += "My Move" (jobs) and "Profile"; Documents icon → FileSignature.

### RPC → screen map
- portal_list_quotes/portal_get_quote → Overview, Quotes, print quote.
- portal_list_jobs/portal_get_job → Overview (upcoming move), My Move.
- portal_list_invoices/portal_get_invoice → Overview (outstanding), Payments, print invoice.
- portal_approve_quote → Quotes approve. portal_update_contact → Profile.

### Verification (2026-06)
- `tsc --noEmit` PASS. `yarn build` PASS (all portal + print routes emitted). node --test 11/11 PASS.
- Unauth: /portal, /portal/{quotes,jobs,payments,profile} → 307 /login (middleware). Print
  pages (outside protected paths) render graceful "please sign in" (verified via screenshot).
- Authenticated customer flows NOT auto-tested (no-credentials boundary). Owner runbook:
  `/app/supabase/PHASE9_portal_ui_owner_test_runbook.md`.
- Frontend served by `next start` (prod, no hot reload) → after edits: `rm -rf .next && yarn build`
  + `supervisorctl restart frontend`.

### Next
- Owner completes the portal UI runbook with a live test-customer session.
- Then Phase 9 P2 Crew Mobile / P3 Ops / P4 Reporting / P5 Polish.

## Phase 9 P2 — Crew Mobile (2026-06, STARTED; awaiting preflight_0027 JSON)
User authorized starting P2 (overrides the P1-hold; P1 remains BUILT/owner-acceptance-pending).
Same strict owner-run-SQL boundary + no-credentials testing boundary as all prior phases.
Current mobile screens are ALL mocked (jobs = mvp-dashboard company-wide; clock/checklist =
local state; photos = toast stub). Crew↔job link = `job_crew(job_id, profile_id, role)` where
profile_id = auth.uid(). Legacy tables present (columns unknown → preflight): crew_time_entries
(clock), document_signatures (signatures), job_photos, job_checklists, job_status_events.

### Planned slices (author SQL → owner runs → verify → wire frontend)
- 0027 — crew identity resolver (auth.uid → active crew_lead/mover profile + company) +
  assigned-jobs READ RPCs (jobs the caller is on via job_crew; explicit customer-safe fields,
  mirrors portal architecture). Wire mobile Jobs list + job detail. [FIRST — read-only]
- 0028 — clock in/out via crew_time_entries (start/stop, current-shift status).
- 0029 — job status/checklist from the field.
- 0030 — job photo upload (Supabase Storage bucket from 0005) + job_photos registration.
- 0031 — customer signature capture (document_signatures).

### Confirmed decisions (owner)
1. Crew job-status rights = BOTH: crew may advance the real lifecycle
   (Confirmed→In Progress→Completed) AND append operational events, but ONLY for jobs assigned
   to them. Forward-only approved transitions — NO cancel/reschedule/reassign/financial/backward/
   skip. Every change audited/logged.
2. Photos = Supabase Storage (0005 bucket), PRIVATE; upload/read restricted to authenticated crew
   assigned to that job (object-storage playbook).
3. Signatures = reuse legacy document_signatures IF preflight confirms schema/security are
   suitable; if incompatible, STOP and report the exact mismatch before creating a new table.
4. Priority = order above (identity/read first).
5. Testing = unchanged no-credentials boundary (tsc + build + fixtures + unauth-denial + security
   + owner runbook). No passwords/JWTs/service-role/customer data.

### Status
- Authored READ-ONLY `preflight_0027_crew_mobile_schema.sql`; owner ran it (2026-06). Findings:
  - job_crew(job_id, profile_id, role); jobs/job_crew/job_photos/job_checklists/job_status_events
    RLS FORCED + staff-only SELECT (crew cannot read directly → RPCs required). Roles crew_lead/mover.
  - crew_time_entries: RLS enabled (not forced) + self_insert/self_or_manager_update/company_select
    policies EXIST, but NO authenticated table grant (locked) → 0028 will route via SECURITY DEFINER RPCs.
  - job_photos: NO storage-path column (only nullable document_id→documents). 0030 must ADD a
    storage_path column (or adopt a strict path convention) for the private `job-photos` bucket.
  - document_signatures: document_id NOT NULL → documents.id; NO job_id, NO crew attribution.
    INCOMPATIBLE with crew job-completion signatures as-is → per owner decision #3, STOP & report
    the mismatch at the 0031 signatures slice before creating any new table.
  - storage bucket `job-photos` PRIVATE + storage.objects policies (authenticated select/insert) exist.
  - Only existing crew fn = set_job_crew (no name collisions).
- Authored `0027_crew_mobile_access.sql` (Slice 1, READ-ONLY): `_crew_current_profile()` resolver
  (auth.uid → active crew_lead/mover + company; no client EXECUTE) + `crew_list_jobs(scope,limit,
  offset)` + `crew_get_job(job_id)`. Explicit customer-safe + operational fields (schedule/route +
  dispatch_notes + customer name/phone + crew roster); EXCLUDES internal_notes/financials/email.
  Parts A/B/C/E included. AWAITING owner to run Part A → B → C and paste results.
- HOLD: mobile frontend NOT wired until 0027 applied + Part C verified (mirrors portal 0026 sequence).

### Slice 1 FRONTEND (2026-06, BUILT; tsc + build + fixtures + unauth PASS; owner acceptance pending)
Wired /mobile jobs to 0027 (assumes owner applied 0027; reads gracefully error if not).
- NEW `src/lib/crewLogic.js` (pure: isNotCrewError, crewErrorMessage, crewRoleLabel) +
  `src/lib/crewLogic.test.mjs` (3 fixture tests, PASS via node --test).
- NEW `src/lib/crew.ts` (typed service: crewListJobs(scope,limit,offset), crewGetJob(id); 2 RPCs only).
- NEW `src/components/mobile/CrewStates.tsx` (CrewNotAuthorized state).
- REWROTE `src/app/mobile/jobs/page.tsx` (was mvp-dashboard server comp → client; Active/Completed
  tabs; cards show job#, status, role, schedule, route, customer name/phone, crew_size, truck_count;
  loading/empty/error/not-crew states). DELETED `src/app/mobile/jobs/JobsClient.tsx`.
- NEW `src/app/mobile/jobs/[id]/page.tsx` (detail: status/role/schedule/route + tap-to-call customer
  + dispatch notes + crew roster w/ "(You)"; not-assigned → "This job isn't assigned to you").
- Route→RPC: /mobile/jobs → crew_list_jobs; /mobile/jobs/[id] → crew_get_job. No base-table reads.
- Verified: tsc PASS; yarn build PASS (routes emitted); crew fixtures 3/3 PASS; unauth /mobile/jobs
  + /mobile/jobs/[id] → 307 /login. Owner runbook: PHASE9_P2_slice1_crew_jobs_owner_test_runbook.md.
- STOP after Slice 1 checkpoint. Do NOT author/run 0028 until owner reviews. Later slices unchanged
  (0028 clock, 0029 status/checklist, 0030 photos [add job_photos.storage_path], 0031 signatures
  [document_signatures INCOMPATIBLE — report before any new table]).



## Phase 9 — Customer Login page (2026-06, BUILT; tsc + build + routing PASS)
Owner reported "Customer Login page is missing": the only sign-in was the staff-branded
`/login` and unauth `/portal/*` redirected there. Added a customer-facing login (UI-only;
reuses existing Supabase auth via AuthProvider.signIn — integration_expert consulted; NO
auth-logic/RLS/grant/migration changes).
- NEW `src/app/portal/login/page.tsx` — customer-branded login (Suspense+useSearchParams for
  safe ?next=; already-signed-in redirect via homeForRole; success → customer/next else home).
- `src/app/portal/layout.tsx` — bypasses AppShell for `/portal/login` (public, no auth shell).
- `src/middleware.ts` — `/portal/login` excluded from protection; unauth `/portal/*` → `/portal/login`
  (staff/crew `/dashboard`,`/mobile` still → `/login`); safe next carried.
- `src/app/login/page.tsx` — added reciprocal "Customer sign in" → /portal/login link.
- Verified: tsc PASS; build PASS (/portal/login emitted); /portal/login=200; unauth /portal→
  /portal/login?next=/portal (307); /dashboard & /mobile/jobs still →/login; screenshot on-brand.
- STILL BLOCKED for authenticated portal acceptance tests: needs a real customer Auth user
  (email+password) whose profile is role=customer + company_id set + customers.auth_user_id linked
  (0026 Part D). Owner must provision in Supabase (Auth → Users). Agent cannot (no credentials).

## Phase 9 — Production-Readiness Audit (2026-06)
Acceptance ledger (owner evidence): Customer Login, T1 Overview, T2/T3/T4 empty, T5 Profile,
T6 Documents = PASS. Populated T2a–T4b + T7 = pending owner data setup (no code blockers).
End-to-end transition contract (ALL implemented, RPC-backed):
- Lead+Customer (atomic): create_lead_with_customer -> {customer_id, lead_id}
- Customer->Quote(draft): create_quote_with_items(p_customer_id|p_lead_id,...,p_line_items)
- Quote->Sent: mark_quote_sent
- Quote->Accepted: portal_approve_quote (customer) / respond_to_quote_approval (public link)
- Quote->Job: convert_quote_to_job(p_quote_id, schedule, addresses, crew, trucks, notes)
- Job->Invoice(draft): generate_invoice_for_job -> mark_invoice_sent
- Invoice->Partial Payment: record_invoice_payment -> {status, balance}
Portal auto-updates with no code change (portal_* SECURITY DEFINER RPCs read same base tables,
filtered to the caller's customer_id).
Known cosmetic: AppShell shows "Demo mode" when getMe('me') role is null (edge fn 'me' not in
repo; likely deployed server-side; returns null role for the customer session). Portal RPCs are
unaffected (auth.uid()-gated) — verified data loads. Optional fix only.
Verdict: NO production-blocking code defects. Gate = owner runs populated end-to-end acceptance.

## Phase 9 — FINAL ACCEPTANCE COMPLETE (2026-06, owner-verified end-to-end)
All populated end-to-end tests PASS with owner evidence, using the existing linked customer
(test-customer@example.com), via staff UI only (no SQL, no duplicate customers):
A1 create draft quote, A2 send, T2a portal view, T2b approve->Accepted, T2c quote PDF,
A3 convert->job, T3 job in My Move (dispatch notes/crew/trucks correctly HIDDEN),
A4 generate+send invoice ($750), A5 partial payment ($187.50), T4a portal invoice+outstanding
$562.50+payment history, T4b invoice PDF, T7 staff denied portal ("This portal is for customers").
Earlier empty-state + Customer Login + T1/T5/T6 also PASS. tsc+build+fixtures+RLS boundary PASS.
VERDICT: Customer Portal (Phase 9 P1) PRODUCTION-VERIFIED. No production-blocking defects.
Only optional/cosmetic item outstanding: "Demo mode" badge (getMe role null). Phase 10 not started.

## Fix — Role display "—" / "Demo mode" (2026-07, RESOLVED, owner-verified)
Root cause: /me edge fn returns role under profile.role (not top-level me.role); AppShell L93 +
Settings L181 read me.role directly. AuthProvider already resolves role (me.role ?? me.profile.role).
Fix: both consume useAuth().role. Files: src/components/shell/AppShell.tsx, src/app/dashboard/settings/page.tsx.
Code-only; no data/RLS/permission/security change. Verified on dev preview: badge="Owner", Settings Role="Owner".
Deployed build (ops-preview-7.emergent.host) predates fix → owner must REDEPLOY to propagate.
tsc PASS, build PASS, fixtures 14/14 PASS.

## PRODUCTION LAUNCH ACCEPTANCE — COMPLETE (2026-07, owner-verified on ops-preview-7.emergent.host)
Full lifecycle passed on the LIVE deployment: owner sign-in (Role=Owner), lead->paired customer,
quote->send->approve(via /q/<token> approval link)->convert to job->dispatch->generate invoice->
send->partial payment->balance verified->quote PDF->invoice PDF->restricted-role nav gating->
signed-out redirects (/dashboard->/login, /portal->/portal/login). Steps 1-14,16,18 PASS;
15 covered by prior test-customer evidence; 17 N/A single-tenant (RLS-enforced).
Role-display fix (AppShell/Settings use resolved role) confirmed live in production.
VERDICT: Ready for Owner Use = YES. Ready for Production = YES (deployed & acceptance-passed).
Reminder: delete throwaway "Test Buyer" lead/customer/quote/job/invoice from production.
Deferred/optional: automated customer emails, Business Profile logo/terms/brand-color fields,
real-device responsive pass. Phase 10 not started.

## Google Sign-in (Customer Portal) — 2026-06
Implemented via **Supabase native Google OAuth** (NOT Emergent-managed auth).
Rationale: portal/dashboard/mobile are 100% Supabase-auth + RLS; Emergent-managed
auth yields a separate session that middleware rejects (no Supabase session), and
there is no service-role key to bridge it. Supabase Google OAuth creates a real
auth.users user that flows through existing middleware, roles, RLS, and reuses the
existing portal_activate_customer_account self-activation RPC.
Code: frontend/src/app/auth/callback/route.ts (PKCE code exchange + activation RPC),
AuthProvider.signInWithGoogle(), "Continue with Google" button on /portal/login.
STATUS: code complete + builds; button renders; OAuth initiates. NOT end-to-end
testable by agent because the Google provider is owner-configured only.
OWNER SETUP REQUIRED (one-time):
  1. Google Cloud Console: create OAuth 2.0 Client (Web). Authorized redirect URI:
     https://yrvgovkkukmtdmgejtxc.supabase.co/auth/v1/callback
  2. Supabase → Authentication → Providers → Google: enable, paste Client ID+Secret.
  3. Supabase → Authentication → URL Configuration → Redirect URLs allowlist:
     https://southernmagnoliamovers.com/auth/callback  (+ preview origin /auth/callback)
     Site URL: https://southernmagnoliamovers.com
Then redeploy for production.

## Local SEO / Google Business metadata — 2026-06
Enhanced MovingCompany JSON-LD (src/lib/schema.ts): added PostalAddress
(locality New Orleans / region LA / country US — NO street, owner hides address
on GBP), openingHoursSpecification (default Mon–Sat 08:00–18:00), and conditional
sameAs (emitted only when BRAND.socials populated). Added structured NAP fields to
src/lib/brand.ts (addressLocality/Region/Country, serviceAreaLabel, hoursText,
hours[], socials{}). Added visible Hours line to SiteFooter (data-testid footer-hours).
Verified in homepage HTML; build passes.
⚠️ CRITICAL DOMAIN ISSUE: NEXT_PUBLIC_SITE_URL is still magnolia-crew.emergent.host,
so canonical/OG/schema URLs point to the WRONG domain. MUST set
NEXT_PUBLIC_SITE_URL=https://southernmagnoliamovers.com in the DEPLOYMENT env vars
(and optionally preview .env) then redeploy — otherwise the schema can't help Google
match the live site to the Business Profile.
OWNER TODO to finish local SEO: paste real social/directory URLs (BRAND.socials),
confirm/adjust hours, optionally switch to a domain email.

## SEO follow-ups — 2026-06 (part 2)
1. Canonical domain: preview NEXT_PUBLIC_SITE_URL -> https://southernmagnoliamovers.com;
   rebuilt. Schema url/@id + canonical/OG now use the live domain (verified in HTML).
   PRODUCTION still needs the same value set in DEPLOY env vars + redeploy.
2. Search Console: layout metadata emits <meta google-site-verification> when
   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION is set (omitted otherwise). Owner sets token
   (HTML-tag method) or uses DNS domain property.
3. Review Booster: new ReviewCTA section (src/components/marketing/ReviewCTA.tsx)
   between ProcessTimeline and FAQ — 5 gold stars + "Leave a Google Review" button.
   Links to BRAND.googleReviewUrl if set, else a Google Maps search for the business
   (working fallback verified). No fake aggregateRating (Google-policy safe).
