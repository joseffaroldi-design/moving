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
