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

## Implemented & VERIFIED (testing agent iteration_1 = 100% frontend pass)
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
