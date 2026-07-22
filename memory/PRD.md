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
- **Data layer**: `mvp-dashboard` (public) powers pre-auth demo screens via a defensive
  normalizer (`src/lib/normalize.ts`) tolerant to payload shape. Auth via Supabase
  email/password + `/functions/v1/me` bootstrap + `create_owner_profile_for_current_user` RPC.
- **Env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon only,
  never service-role).

## User Personas
- Owner / Operations Manager → /dashboard
- Dispatcher → /dashboard/dispatch
- Sales → /dashboard/leads
- Crew Lead / Mover → /mobile/jobs
- Customer → /portal

## Implemented (2026-06 / takeover build)
- Replaced legacy CRA scaffold with fresh Next.js App Router + TS project.
- Design system per design_guidelines.json: navy sidebar, slate/white surfaces,
  restrained blue accent, Chivo + IBM Plex fonts, compact tables, status badges.
- App shell: collapsible sidebar, topbar (search, notifications, user menu),
  breadcrumbs, mobile drawer nav.
- Reusable UI: StatusBadge, Button, Input/Select, Skeletons, EmptyState, ErrorState,
  ConfirmDialog, Drawer, Card/StatCard, DataTable, Toast, PageHeader.
- Auth: AuthProvider (session, /me bootstrap, owner-profile RPC, role redirects),
  /login (login+signup), /forgot-password, /unauthorized.
- Staff pages: Dashboard (KPIs, recent leads/quotes, upcoming jobs, onboarding),
  Leads (search/filters/table/mobile cards/detail drawer), Customers, Quotes
  (pricing fields + line items + send/approve/convert actions), Jobs (status
  timeline), Dispatch (day-board list), Invoices, Reports, Settings (health check).
- Customer portal routes (structured placeholders) + Crew mobile (jobs/clock/photos/checklists).
- Production build passes (25 routes). All routes return 200.

## KNOWN BLOCKER (action required)
- Supabase project `yrvgovkkukmtdmgejtxc.supabase.co` returns **NXDOMAIN** from public
  DNS (Google + Cloudflare) → project is **paused or deleted**. Live seeded data cannot
  load until the user restores the project in the Supabase dashboard.
- Frontend handles this gracefully with visible error/retry states.

## Backlog / Next
- P0: Restore Supabase project → verify mvp-dashboard shape, align normalizer to real
  keys, confirm seeded data renders across Dashboard/Leads/Quotes/Jobs/Dispatch.
- P0: Run testing agent end-to-end once backend is live.
- P1: Real auth verification (create test user), protected-route middleware,
  role-based redirects live test.
- P1: Wire quote actions to generate-quote-estimate / approve-quote; dispatch to
  assign-dispatch; direct table reads (authed) on list pages instead of mvp-dashboard.
- P2: Invoices/payments (create-deposit-payment, mark-payment-paid), portal (RLS),
  crew mobile edge-function wiring (clock-in/out, register-job-photo), Stripe, reports,
  drag-and-drop dispatch.
