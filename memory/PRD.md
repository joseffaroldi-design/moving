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
