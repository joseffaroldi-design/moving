# MoveOps — Moving Company Operations Platform

MoveOps is a unified operations platform for moving companies covering the full
workflow: **lead → quote → job → dispatch → crew → invoice/payment**.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**, connected to an
existing **Supabase** backend (Postgres, RLS, Edge Functions, Storage).

## Tech Stack

- Next.js 15 (App Router, Server + Client Components)
- TypeScript, Tailwind CSS, Lucide icons
- Supabase JS client + `@supabase/ssr`
- Zod + React Hook Form (forms/validation)

## Local Setup

```bash
cd frontend
yarn install
yarn dev      # http://localhost:3000
```

Production build:

```bash
yarn build
yarn start:prod
```

## Environment Variables

Set in `frontend/.env` (never commit secrets, never expose the service-role key):

```
NEXT_PUBLIC_SUPABASE_URL=https://yrvgovkkukmtdmgejtxc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable anon key>
```

Only the **publishable (anon)** key is used in the browser. RLS enforces company
isolation and role-based access on the backend.

## Backend (Supabase — do not modify from the frontend)

- Public demo endpoint: `/functions/v1/mvp-dashboard`
- Authenticated bootstrap: `/functions/v1/me`
- Health: `/functions/v1/app-health`
- Onboarding RPC: `create_owner_profile_for_current_user`

> If the app shows "Unable to reach the MoveOps backend", the Supabase project is
> likely **paused**. Restore it from the Supabase dashboard (Project → Restore).

## Routes

| Area | Routes |
|------|--------|
| Public | `/`, `/login`, `/forgot-password`, `/unauthorized` |
| Staff | `/dashboard`, `/dashboard/{leads,customers,quotes,jobs,dispatch,invoices,reports,settings}` |
| Customer Portal | `/portal`, `/portal/{quotes,payments,documents}` |
| Crew Mobile | `/mobile`, `/mobile/{jobs,clock,photos,checklists}` |

## Architecture

```
src/
  app/                 # App Router routes (route groups per role)
  components/
    auth/              # AuthProvider (Supabase session + /me bootstrap)
    data/              # DashboardProvider (mvp-dashboard data context)
    shell/             # AppShell: sidebar, topbar, mobile nav
    ui/                # Reusable: table, badge, drawer, dialog, empty/error states
  lib/
    supabase/          # browser + server clients, config
    api.ts             # Edge Function calls
    normalize.ts       # Defensive mvp-dashboard payload normalizer
    format.ts          # Currency/date/phone formatters
    status.ts          # Status → badge tone mapping
    entities.ts        # Defensive entity display accessors
    nav.ts             # Role-aware navigation + role redirects
```

## Data & Security

- RLS is preserved; the frontend never uses the service-role key.
- Authenticated Edge Functions are called with the user JWT.
- The public `mvp-dashboard` endpoint powers the pre-auth demo screens.
