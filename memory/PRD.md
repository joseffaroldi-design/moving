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
