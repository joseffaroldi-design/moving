# Technical Design Review — Southern Magnolia Movers ("MoveOps")

**Document type:** Independent engineering design review (evidence-based)
**Prepared for:** Senior Software Engineer / Senior Systems Engineer / Software Architect
**Date:** 2026-07-25
**Reviewed artifact:** `/app` monorepo (frontend + Supabase migrations + unused FastAPI scaffold)

> Scope note / evidence boundary: This review is based on the source in the repository. The **Supabase-side runtime is not fully reviewable from the repo**: the Edge Functions the app depends on (`mvp-dashboard`, `me`, `app-health`) are deployed server-side and **their source is not in the repo**. The database schema is inferred from the SQL migration files (`supabase/migrations/`), which the repo author runs manually in Supabase; the live DB state is asserted by "verify_*" read-only scripts but the actual applied state is not independently observable here. Statements about the DB reflect the migration DDL, not a live introspection.

---

## 1. Executive Summary

- **Project purpose:** An operations platform ("MoveOps") for a single moving company (Southern Magnolia Movers, New Orleans). It manages the lead → quote → job → dispatch → (invoice) lifecycle, plus a public marketing homepage, a customer portal, and a crew mobile UI.
- **Primary users:** (1) Office staff (owner, operations manager, dispatcher, sales); (2) field crew (mobile); (3) customers (public quote-approval links + portal); (4) public site visitors (marketing homepage + estimate request).
- **Business goals:** Replace ad-hoc tooling with a secured, multi-role operations system; convert website visitors into leads; move quotes to booked/dispatched jobs; bill completed jobs.
- **Current development stage:** Mid-to-late MVP. Phases 0–6 (security lockdown, business profile, leads, quotes, quote approval, jobs, dispatch) are implemented and were manually verified by the owner. Phase 8 (Invoices) backend DDL is **authored but not yet applied** and has **no UI**. Phase 7 (crew mobile) has **UI routes but no verified backend write-path** beyond a job-photos storage bucket migration.
- **Current deployment status:** **Not live in production.** Preview environment works. Production deploys have failed repeatedly due to **platform/deployment-pipeline incompatibility** (the app is Next.js SSR; the managed deploy pipeline was CRA-static, later switched to a Node image but is now failing on a missing platform script `build-frontend-artifacts.sh`). This is a platform blocker, not an application-code defect.
- **Estimated completion:** ~**60–65%** of the stated roadmap. Core office workflow (leads→quotes→jobs→dispatch) ≈ 90%; invoices ≈ 30% (backend authored, unapplied, no UI); customer portal ≈ 25% (routes exist, read-only/scaffold); crew mobile ≈ 20% (routes/scaffold); production deployment ≈ 10%.
- **Major accomplishments:**
  - A genuinely strong **database security model**: FORCE RLS on all business tables, `authenticated` = SELECT-only, all mutations via `SECURITY DEFINER` RPCs with server-derived company/actor, role checks, cross-company ownership checks, and server-side money computation.
  - Concurrency-safe per-company sequence numbering (`Q-`, `J-`, `INV-`) via `pg_advisory_xact_lock`.
  - Idempotent state transitions (quote→job conversion, job status, invoice generation).
  - Clean Next.js 15 App Router frontend, cookie-based SSR auth with `getUser()` revalidation in middleware.
  - Dependency security remediated to **0 known vulnerabilities** (post Next 15.5.21 upgrade, incl. CVE-2025-29927 middleware bypass).
- **Major remaining work:** production deployment (platform); Invoices UI + apply 0018; customer portal real data; crew mobile write-path; automated tests; observability; the public estimate form → real lead-intake endpoint (with spam/rate-limiting).
- **Current risks (top):**
  1. **Cannot ship to production** (platform pipeline) — highest business risk.
  2. **Zero automated test coverage** for a financial/multi-role system — highest engineering risk.
  3. **No observability** (no error tracking, metrics, or alerting) in the app.
  4. **Critical business logic (dashboard aggregation, `me`) lives in un-versioned Edge Functions** outside the repo → unreviewable, undeployable-from-repo, bus-factor risk.
  5. **Dead FastAPI/Mongo scaffold** still wired into supervisor/deploy expectations creates confusion and a false backend surface.

---

## 2. Overall Architecture

### 2.1 High-level

```
                        ┌───────────────────────────────────────────────┐
   Public visitor ───▶  │  Next.js 15 App Router (React 19)              │
   Customer       ───▶  │  - SSR + Server Components + Client Components │
   Office staff   ───▶  │  - middleware.ts (auth gate: getUser())       │
   Field crew     ───▶  │  - /login /dashboard/* /portal/* /mobile/*    │
                        │    /q/[token] /print/quote/[id] / (marketing) │
                        └───────┬───────────────────────┬───────────────┘
                                │ direct supabase-js     │ HTTPS (anon key + user JWT)
                                │ (.from SELECT, .rpc)   │
                                ▼                        ▼
             ┌──────────────────────────┐   ┌───────────────────────────────┐
             │ Supabase Postgres         │   │ Supabase Edge Functions       │
             │ - FORCE RLS everywhere    │   │ (Deno, NOT in repo):          │
             │ - SELECT-only for authd   │   │  mvp-dashboard, me, app-health│
             │ - SECURITY DEFINER RPCs   │◀──│  (service-role aggregation)   │
             │ - Supabase Auth (GoTrue)  │   └───────────────────────────────┘
             │ - Storage (job photos)    │
             └──────────────────────────┘

   [UNUSED] backend/server.py  — FastAPI + MongoDB "status check" boilerplate. Not called by the app.
```

### 2.2 Component-by-component

- **Frontend:** Next.js `15.5.21`, React `19.0.0`, App Router, TypeScript `5.7.3`, Tailwind `3.4.17`. Rendering is mixed: the marketing homepage is largely static/server-rendered; dashboard/portal/mobile are client components reading via a `DashboardProvider` context + direct Supabase calls. `output: "standalone"` + `outputFileTracingRoot` set for a self-contained Node server.
- **Backend (real):** **Supabase** — Postgres (business data + RLS + RPCs), GoTrue (auth), Edge Functions (aggregation), Storage (job photos bucket, migration `0005`). There is no bespoke application server; the "backend" is Postgres functions + a few Edge Functions.
- **Backend (dead):** `backend/server.py` (FastAPI + Motor/MongoDB) is the stock Emergent template (a `/api/status` CRUD). It is **not used** by the frontend (frontend talks to Supabase). It still consumes `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS` and is supervisor-managed.
- **Database:** PostgreSQL (Supabase-managed). Schema via 21 forward migrations (`0001`–`0018`) plus preflight/verify helper scripts.
- **Authentication:** Supabase Auth, cookie-based via `@supabase/ssr` `0.7.0`. `middleware.ts` validates with `getUser()` (not `getSession()`) and gates `/dashboard`, `/portal`, `/mobile`.
- **Authorization:** Enforced in the database. `has_company_role(company_id, role[])` + FORCE RLS + `SECURITY DEFINER` RPCs. The client cannot write tables directly.
- **API layer:** Three surfaces — (a) direct `supabase-js` `.from().select()` (RLS-scoped reads), (b) `.rpc()` calls to SECURITY DEFINER functions (all writes), (c) `fetch()` to Supabase Edge Functions for dashboard aggregation (`mvp-dashboard`, `me`, `app-health`).
- **AI integrations:** **None.**
- **Background workers / scheduled jobs:** **None** in the repo. (Quote expiry is on-demand via RPC, not a cron.)
- **File storage:** Supabase Storage; a `job-photos` bucket migration exists (`0005`). No upload code found wired in the reviewed frontend (crew photo UI is scaffold).
- **Image processing:** `next/image` optimization only (needs `sharp` at runtime; `sharp` is Next's optional dep, pinned to `0.35.3` via a yarn resolution). No server-side image pipeline.
- **Search:** **None** (no full-text search; list filtering is client-side).
- **Caching:** `fetch(..., {cache:"no-store"})` for Edge Function calls; no CDN/data caching layer; React context holds fetched dashboard data in memory per session.
- **External APIs / third-party services:** Supabase only. (No Stripe/email/SMS yet — all future.)
- **Logging:** Frontend: none beyond console. DB: `activity_log` table migration exists (`0003`) but is not consistently written. Edge Functions: unknown (not in repo).
- **Monitoring:** **None** (no Sentry/OTel/metrics/uptime in the app).
- **Deployment / infra:** Emergent-managed containers. Preview = supervisor running the Next server; production = Emergent cloud build (currently broken, platform-side).
- **Scaling strategy:** Implicitly Supabase's managed Postgres + stateless Next server. No documented scaling plan; advisory locks on number generation are a per-company serialization point (acceptable at SMB scale, see §12).

### 2.3 Why these decisions (as evidenced)
- **DB-enforced authz (RLS + DEFINER RPCs):** deliberately chosen so a compromised/hostile client (or a leaked anon key) still cannot mutate or cross-company-read. This is the single best architectural decision in the project.
- **Edge Functions for dashboard:** aggregates multiple tables server-side with the service role to avoid N+1 client reads and to bypass RLS safely for read composition. Trade-off: moves critical logic outside the repo.
- **Next.js App Router:** SSR + middleware needed for cookie auth and dynamic public routes (`/q/[token]`), which precludes static export.

---

## 3. Repository Structure

```
/app
├── frontend/                      # Next.js 15 app (the real product)
│   ├── src/
│   │   ├── app/                   # App Router routes (24 route files)
│   │   │   ├── page.tsx           # Public marketing homepage
│   │   │   ├── layout.tsx         # Root layout, fonts, providers
│   │   │   ├── login/ forgot-password/ unauthorized/
│   │   │   ├── dashboard/         # Staff ops: leads, quotes, jobs, dispatch,
│   │   │   │                      #   customers, invoices, reports, settings (+layout)
│   │   │   ├── portal/            # Customer portal: quotes, payments, documents (scaffold)
│   │   │   ├── mobile/            # Crew mobile: jobs, clock, photos, checklists (scaffold)
│   │   │   ├── q/[token]/         # Public quote approval (tokenized)
│   │   │   ├── print/quote/[id]/  # Printable quote view
│   │   │   └── auth/confirm/      # Auth email confirm route handler
│   │   ├── components/
│   │   │   ├── ui/                # 12 shadcn-style primitives (button, input, table, drawer…)
│   │   │   ├── auth/              # AuthProvider (role resolution)
│   │   │   ├── data/              # DashboardProvider (data context)
│   │   │   ├── shell/ brand/ marketing/ print/
│   │   ├── lib/                   # 16 modules: supabase clients, leads, quotes, jobs,
│   │   │   │                      #   dispatch, customers, invoices(pending), api, normalize,
│   │   │   │                      #   entities, format, status, nav, types, utils, brand
│   │   │   └── supabase/          # client.ts, server.ts, config.ts
│   │   └── middleware.ts          # Route auth gate
│   ├── next.config.js  package.json  tsconfig  tailwind.config.ts
│
├── supabase/migrations/           # 21 forward migrations + preflight/verify scripts (34 files, ~4.6k LOC SQL)
│
├── backend/                       # UNUSED FastAPI+Mongo boilerplate (server.py 88 LOC)
│
├── memory/                        # Agent working docs (PRD.md, test_credentials.md, this review)
├── test_reports/                  # iteration_1..5.json (QA agent runs)
├── design_guidelines.json         # Brand/design tokens
├── southern-magnolia-source.zip   # 1.7 MB source snapshot artifact (should not be in repo)
└── tests/                         # pytest scaffold (effectively empty for the real app)
```

- **Shared modules:** `lib/supabase/*` (client factories), `lib/entities.ts`/`format.ts`/`status.ts`/`normalize.ts` (display + normalization helpers), `components/ui/*` (design system).
- **System boundaries:** UI ↔ Supabase is the only real boundary. The FastAPI/Mongo backend is an orphan boundary (present but unused).
- **Dependency relationships:** `app/*` pages → `lib/*` domain modules → `lib/supabase/*` → Supabase. `components/data/DashboardProvider` → `lib/api.ts` → Edge Functions.

---

## 4. Technology Stack (exact versions)

**Language/runtime:** TypeScript `5.7.3`; Node 20 (preview 20.20.2; prod image `node:20.19.5-multiarch`); Python `3.11` (unused backend).

**Frontend framework/libraries:**
- next `15.5.21`, react `19.0.0`, react-dom `19.0.0`
- @supabase/supabase-js `2.109.0`, @supabase/ssr `0.7.0`
- react-hook-form `7.54.2`, @hookform/resolvers `3.9.1`, zod `3.24.1`
- tailwindcss `3.4.17`, tailwindcss-animate `1.0.7`, class-variance-authority `0.7.1`, clsx `2.1.1`, tailwind-merge `2.6.0`
- lucide-react `0.469.0`, date-fns `4.1.0`
- sharp pinned `0.35.3` (via yarn `resolutions`, Next optional dep)

**Frontend dev tooling:** eslint `9.18.0`, eslint-config-next `15.5.21`, postcss `8.5.22`, autoprefixer `10.4.20`, @types/node `22.10.6`, @types/react `19.0.7`.

**Backend (unused scaffold):** fastapi, motor (async MongoDB), pydantic, starlette, python-dotenv (requirements.txt, 28 pinned lines).

**Database/hosting/infra:** PostgreSQL (Supabase-managed) + Supabase Auth (GoTrue) + Supabase Edge Functions (Deno) + Supabase Storage. Hosting: Emergent-managed containers/cloud build. Package manager: **yarn 1.22** (classic). Build tool: Next/Turbopack via `next build` (standalone output).

---

## 5. Database Design

> From migration DDL. Table columns below are as declared in migrations; the live DB is asserted by verify scripts, not introspected here.

### 5.1 Tables (business domain)
- **companies** — tenant root (referenced by FKs; created in early migration set).
- **profiles** — user↔company↔role mapping (`id` = auth uid, `company_id`, `role user_role`, `is_active`). Created/maintained via `handle_new_auth_user` trigger and `admin_set_profile_role`.
- **business_profile** — company settings (migration `0002`, `set_business_profile_updated_at` trigger).
- **activity_log** — audit sink (migration `0003`); under-utilized.
- **leads** — pipeline entry (`company_id`, `customer_id`, `status lead_status`, `source`, `move_date`, `origin_address`, `destination_address`, `bedrooms`, `estimated_volume_cuft`, `notes`, timestamps).
- **customers** — contact records (`first_name`, `last_name`, `email`, `phone`, `company_id`).
- **lead_notes** — append-only notes (`0007`/`0008`), author + company scoped.
- **quotes** — pricing (`quote_number`, `status`, `hourly_rate`, `estimated_hours`, `travel_fee`, `packing_fee`, `materials_fee`, `discount`, `tax_rate`, `deposit_percent`, `deposit_amount`, `subtotal`, `tax`, `total`, `lead_id`, `customer_id`, `expires_at`, `sent_at`).
- **quote_line_items** — (`quote_id`, `description`, `quantity`, `unit_price`, `total`, `sort_order`, `pricing_rule_id`).
- **quote approval tokens** — tokenized public approval (`0015`).
- **jobs** — (`job_number`, `status job_status` [scheduled|confirmed|in_progress|completed|cancelled], `quote_id` UNIQUE partial, `customer_id`, `scheduled_start/end`, `origin/destination_address`, `crew_size`, `truck_count`, `dispatch_notes`).
- **trucks**, **dispatch_days**, **dispatch_assignments**, **job_crew**, **job_trucks**, **job_status_events** — dispatch domain (`0017*`).
- **invoices**, **invoice_line_items**, **invoice_payments** — Phase 8 (`0018`, **authored, not yet applied**). `invoice_status` enum draft|sent|partially_paid|paid|void.

### 5.2 Relationships
Multi-tenant by `company_id` on every business table. lead → customer; quote → (lead, customer); job → (quote UNIQUE, customer); invoice → (job UNIQUE, quote, customer); line-item tables → parent; payments → invoice. Storage: job-photos bucket keyed by job.

### 5.3 Indexes / constraints
- Partial UNIQUE `jobs(quote_id) where quote_id is not null` (one job per quote); `invoices(job_id)` partial UNIQUE (one invoice per job); `UNIQUE(company_id, quote_number|job_number|invoice_number)`.
- CHECK constraints: tax_rate/deposit 0..100, non-negative money, non-empty line-item descriptions, positive payment amount.
- Secondary indexes on `company_id`, parent FKs, and payment ordering (`0018`).

### 5.4 Triggers / functions / views
- **Triggers:** `handle_new_auth_user` (auth → profile), `set_business_profile_updated_at`.
- **Functions (38 total incl. helpers):** numbering (`next_quote_number`, `next_job_number`, `next_invoice_number`); guards (`_require_quote_mutator`, `_require_job_converter`, `_require_job_status_setter`, `_require_dispatcher`, `_require_invoice_mutator`, `_require_quote_approval_token`); compute (`_compute_quote_totals`, `_compute_invoice_totals`); validators (`_assert_quote_scalars`, `_assert_quote_line_items`); client RPCs (create/update/duplicate/mark/expire/cancel quote; convert_quote_to_job; set_job_status; assign_job_to_dispatch; set_job_crew; set_job_trucks; create/respond/revoke/get quote approval; create_lead_with_customer; generate_invoice_for_job; update_draft_invoice_with_items; mark_invoice_sent; record_invoice_payment; void_invoice; admin_set_profile_role).
- **Views / materialized views:** **None.** (Aggregation is done in Edge Functions instead — a notable architectural choice; a set of read views would be more testable/portable.)

### 5.5 Row-Level Security & policies
- All business tables: `ENABLE` + **`FORCE` RLS**. `authenticated` granted **SELECT only**; `anon`/`PUBLIC` = nothing. SELECT policies scoped via `has_company_role(company_id, ['owner','operations_manager','dispatcher','sales'])`. Child tables gate via `EXISTS` on the parent's company/role. Writes: **no direct grant** — only via `SECURITY DEFINER` RPCs (EXECUTE granted narrowly to `authenticated`; helper/validator functions have EXECUTE revoked from everyone).

### 5.6 Migration strategy
Forward-only, numbered, transactional SQL run **manually by the operator in the Supabase SQL editor**, each paired with a read-only `verify_*` script and sometimes a `preflight_*` script. **No automated migration runner, no down-migrations, no CI application.** This is the biggest operational weakness of the DB layer (see §10/§15).

### 5.7 Performance considerations
- Advisory-lock number generation serializes inserts **per company** for the caller's transaction — fine for SMB volumes, a hotspot only under high concurrency within one company.
- `_compute_*_totals` re-reads line items on each mutation — cheap at expected row counts.
- No pagination on list reads observed → unbounded result growth risk (see §12).

---

## 6. Backend Review

There are two "backends": the **real** one (Postgres functions + Edge Functions) and a **dead** one (FastAPI/Mongo).

- **Architecture (real):** "fat database" — business rules, authz, money math, and state machines live in Postgres `SECURITY DEFINER` functions. Reads compose in Edge Functions. This is coherent and secure but concentrates logic in SQL that has **no unit tests** and partially **outside the repo**.
- **Services/controllers:** N/A in a traditional sense; RPCs are the service layer. Naming/patterns are consistent (`_require_*`, `next_*_number`, `*_with_items`).
- **Business logic quality:** Strong. Idempotency (convert_quote_to_job, generate_invoice_for_job), legal state-transition matrices (set_job_status), server-authoritative pricing, cross-company ownership checks, `search_path` pinning on DEFINER functions (guards against search-path attacks). This is above-average rigor.
- **Middleware:** Only the Next.js `middleware.ts` auth gate. Correctly uses `getUser()` (revalidates against Auth server) and carries refreshed cookies through redirects to avoid loops.
- **Validation:** Server-side in RPCs (scalar/line-item asserts) + client-side (zod/react-hook-form). Good defense-in-depth for quotes; invoices validation is lighter.
- **Transactions:** Each RPC is a single transaction; advisory locks held to commit. Correct.
- **Error handling:** RPCs `raise exception` with human messages; frontend surfaces via toasts. Edge Function/`api.ts` path has a 15s abort + typed `ApiError`. Reasonable.
- **Async processing:** None (no queues/workers). Invoice auto-create is inline in `set_job_status`, wrapped so failure doesn't block completion — pragmatic but **silently swallows invoice errors** (only a `raise notice`), which is an observability gap.
- **Security:** Excellent at the DB boundary (see §13).
- **Maintainability:** SQL is well-commented and consistent, but the **absence of a migration runner and tests**, plus **off-repo Edge Functions**, hurts long-term maintainability.
- **Dead FastAPI/Mongo:** Should be removed or clearly quarantined; it presents a false attack/ops surface and confuses the deployment model.

---

## 7. Frontend Review

- **Routing:** Next.js App Router; 24 route files across marketing, dashboard, portal, mobile, tokenized approval, print, auth.
- **Rendering strategy:** Mixed. Marketing = server/static; app areas = client components hydrated with context data. Middleware handles auth at the edge.
- **Component hierarchy:** `layout → providers (Auth/Dashboard/Toast) → shell → pages → ui primitives`. 12 UI primitives (button, input, card, drawer, table, toast, skeleton, empty/error-state, status-badge, page-header, confirm-dialog).
- **State management:** React context (`AuthProvider`, `DashboardProvider`) + local component state; no Redux/Zustand. Adequate for size; `DashboardProvider` is a single large data context (potential over-fetch / coarse invalidation).
- **Forms:** react-hook-form + zod on create/edit flows (quotes, leads). Consistent and modern.
- **Shared components:** shadcn-style, CVA variants, tailwind-merge — clean and consistent.
- **Accessibility:** Partial. Semantic elements + labels in forms and `data-testid` coverage are good; no evidence of systematic aria for drawers/dialogs, focus trapping, or keyboard nav audits. **Not verified against WCAG.**
- **Responsive behavior:** Tailwind-based; marketing homepage verified desktop+mobile; mobile crew routes are purpose-built for small screens (scaffold).
- **Error/loading states:** First-class (`ErrorState`, `TableSkeleton`, `EmptyState`) — better than typical MVPs.
- **Performance optimizations:** `next/image`, standalone output; but **no code-splitting strategy beyond route-level**, no memoization audit, single big data context (see §12).

---

## 8. API Documentation

There is **no REST/OpenAPI surface** in the app (the FastAPI `/api/status` endpoints are unused boilerplate). The real "API" is three Supabase surfaces. Representative catalog:

### 8.1 Edge Functions (HTTPS; `Authorization: Bearer <user JWT|anon>`, `apikey: <anon>`)
- `GET mvp-dashboard` — aggregated dashboard payload (leads/quotes/jobs/dispatch/invoices summaries). **Auth:** user JWT; **Authz:** service-role read composition, company-scoped by the caller. **Source not in repo.**
- `GET me` — current profile/role/company. **Source not in repo.**
- `GET app-health` — health probe.

### 8.2 RPCs (`supabase.rpc(name, args)`) — all `SECURITY DEFINER`, `authenticated` EXECUTE
Examples (method = POST/RPC, authz = role check inside):
- `create_lead_with_customer(...)` → creates customer+lead atomically. Roles: staff.
- `create_quote_with_items(lead_id?, customer_id?, pricing…, line_items jsonb)` → `{quote_id, quote_number}`. Roles: owner/ops/sales. Validates scalars + line items; computes totals.
- `update_draft_quote_with_items(...)`, `duplicate_quote(id)`, `mark_quote_sent(id)`, `expire_quote(id)`, `cancel_quote(id)`.
- `create_quote_approval_link(quote_id)`, `get_quote_by_approval_token(token)` (public read via token), `respond_to_quote_approval(token, decision)`, `revoke_quote_approval_links(quote_id)`.
- `convert_quote_to_job(quote_id, scheduled_start, origin, destination, …)` → `{job_id, job_number, created}`. Idempotent.
- `set_job_status(job_id, status)` → legal-transition-checked; auto-creates draft invoice on `completed`.
- `assign_job_to_dispatch(...)`, `set_job_crew(...)`, `set_job_trucks(...)` — dispatch, with hard conflict blocking.
- `generate_invoice_for_job(job_id)`, `update_draft_invoice_with_items(...)`, `mark_invoice_sent(id)`, `record_invoice_payment(id, amount, method, paid_at, note)`, `void_invoice(id)` — **defined in 0018 (unapplied), not yet wired in UI.**
- `admin_set_profile_role(...)` — role administration.

### 8.3 Direct table reads (`supabase.from(t).select()`)
RLS-scoped SELECTs on: `business_profile, customers, dispatch_assignments, job_crew, job_trucks, jobs, lead_notes, leads, profiles, quote_line_items, quotes, trucks`.

**Request/response examples, validation, and error bodies** are consistent (`{ ...ids } | raise exception('message')` → surfaced as toast). A formal API spec does not exist and should be generated (see recommendations).

---

## 9. Authentication & Authorization

- **Login:** Supabase email/password (`/login`), cookie session via `@supabase/ssr`.
- **Registration:** Supabase sign-up; `handle_new_auth_user` trigger provisions a `profiles` row. (Owner role assignment via `0004`/`admin_set_profile_role`.)
- **Password reset:** `/forgot-password` route present (Supabase recovery flow); depth not fully verified here.
- **Session management:** HTTP-only cookies managed by `@supabase/ssr`; middleware `getUser()` revalidation on protected routes.
- **JWT strategy:** Supabase-issued access + refresh tokens; middleware carries refreshed cookies through redirects. No custom JWT logic.
- **Refresh tokens:** Handled by Supabase client; not hand-rolled.
- **Role model (`user_role`):** `owner`, `operations_manager`, `dispatcher`, `sales` (+ customer/crew implied). Enforced via `has_company_role`.
  - Quote mutations: owner/ops/sales. Job status: owner/ops/dispatcher. Dispatch: dispatcher(+owner/ops). Invoices: owner/ops/sales. Role admin: owner.
- **Company isolation:** `company_id` derived **server-side** from `profiles` in every RPC and enforced in RLS; the client cannot assert a company.
- **Customer permissions:** Public quote approval is **token-scoped** (`/q/[token]`), not login-based. Portal routes exist but are read-only/scaffold; a customer role's exact table permissions were **explicitly deferred** and remain **untested** (documented risk).
- **Employee/admin permissions:** As above; admin = owner via `admin_set_profile_role`.

---

## 10. Infrastructure

- **Hosting:** Emergent-managed containers + Google Cloud Build.
- **Production environment:** Node image (`node:20.19.5-multiarch`); **currently failing** — pipeline references a missing platform script `build-frontend-artifacts.sh`. App is standalone-build-ready. **Blocker is platform-side.**
- **Preview environment:** Supervisor-run Next server (`next dev`/`next start`), healthy.
- **CI/CD:** **None in-repo.** No GitHub Actions/tests/lint gates. Deploys are platform-button-triggered.
- **Environment variables:** Frontend: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `REACT_APP_BACKEND_URL` (legacy/unused), `WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`. Backend (unused): `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`.
- **Secrets management:** `.env` files only; anon/publishable key is public by design. No service-role key in the repo (correct — it lives in Edge Functions). No secret manager/rotation.
- **Backups:** Supabase-managed Postgres backups (platform default); **no documented/verified backup or PITR policy**.
- **Monitoring / logging / alerting:** **None** in the app; `activity_log` under-used.
- **Recovery / rollback:** Forward-only SQL with **no down-migrations**; rollback of a bad migration is manual/ad-hoc. App rollback relies on Emergent's checkpoint/rollback feature, not code.

---

## 11. Feature Inventory

**Completed & verified (owner-tested):**
- Public marketing homepage (hero, services, service area, frontend-only estimate form → "call/text", staff-login link). *Limitation:* estimate form does not persist (no lead-intake endpoint yet).
- Auth + middleware gating; role resolution.
- Leads: list, detail, status change, append-only notes, **edit lead** (name/contact→customers, lead fields→leads). 
- Quotes: create/edit draft with line items + pricing engine, send, expire, cancel, duplicate, print view.
- Quote approval: tokenized public link, respond, revoke.
- Jobs: convert-from-quote (idempotent), status lifecycle.
- Dispatch: day-board, assign/edit, crew/truck assignment with conflict blocking.
- Dashboard aggregation (via Edge Function).

**Partially completed:**
- Invoices (Phase 8): **backend DDL authored (`0018`) but NOT applied; no UI.** Auto-draft-on-completion hook designed. Status: ~30%.
- Customer portal (`/portal/*`): routes/scaffold, read-only; real data + payments not wired. ~25%.
- Crew mobile (`/mobile/*`): routes/scaffold (jobs, clock, photos, checklists); job-photos bucket exists but upload path unverified. ~20%.
- Reports/Settings pages: present, depth unverified.

**Planned:** Invoices UI; payments (Stripe) + online payment links; secure public lead-intake (spam/rate-limit); activity logging; customer portal auth/permissions; crew write-path + photo uploads; production deployment.

**Hidden/admin:** `admin_set_profile_role` RPC (role management); `print/quote/[id]`.

**Experimental:** none.

---

## 12. Performance Review

- **Frontend:** Small bundle surface (few deps; no heavy chart/date libs beyond date-fns). Route-level splitting via App Router. Risk: single large `DashboardProvider` context re-renders broadly; no memoization audit.
- **Backend (RPC):** O(line items) recomputation per mutation — negligible at SMB scale.
- **Database:** Indexed on tenant + FKs. **No pagination/limits on list reads** → linear growth in payloads as leads/quotes/jobs accumulate; will degrade UI and Edge Function response over months/years.
- **Query efficiency:** Aggregation centralized in Edge Functions (good vs N+1); but unreviewable here.
- **Bundle sizes:** Homepage ~3 KB route + shared ~190 KB first-load JS class (typical Next 15). Not independently profiled.
- **API latency:** Edge Function call has a 15s client timeout; no measured p50/p95.
- **Caching:** `no-store` everywhere → every dashboard view hits the network. No SWR/React Query; no CDN data cache.
- **Image optimization:** `next/image` + remote patterns; `sharp` pinned.
- **Memory/CPU:** Not measured. Standalone Node server is lightweight.
- **Expected scaling limits:** Comfortable for a single moving company (dozens of staff, thousands of records). Advisory-lock numbering and unbounded list reads are the first walls at high volume; Supabase Postgres tier is the ceiling. Multi-tenant SaaS scale would require pagination, caching, and read-model views.

---

## 13. Security Review (severity: Critical/High/Medium/Low/Info)

- **OWASP A01 Broken Access Control — LOW (well-mitigated):** FORCE RLS + DEFINER RPCs + server-derived company/role. Strong. *Residual:* customer-role permissions deferred/untested — **MEDIUM** until proven.
- **A02 Cryptographic Failures — LOW:** TLS via platform; Supabase-managed auth; no custom crypto. At-rest encryption is Supabase default (not independently verified) — **INFO**.
- **A03 Injection (SQLi) — LOW:** No string-concatenated SQL in app; RPCs use parameters; DEFINER functions pin `search_path`. Good.
- **XSS — LOW/MEDIUM:** React escaping by default; no `dangerouslySetInnerHTML` observed. Not formally audited — **LOW**.
- **CSRF — LOW→MEDIUM:** Cookie-based auth; Supabase uses bearer tokens for API and same-site cookies. State-changing operations are RPCs authorized by JWT (not ambient cookie alone), which mitigates classic CSRF. Not formally verified — **LOW/MEDIUM**.
- **Secrets/Env — LOW:** Only public keys in repo; service role kept in Edge Functions. *But* `southern-magnolia-source.zip` committed in the repo is a **MEDIUM** hygiene risk (could contain stale secrets/history) — should be removed.
- **Upload security — N/A / MEDIUM-when-built:** Photo upload path not implemented; when built, needs content-type/size/virus checks and signed URLs.
- **Dependency vulnerabilities — LOW:** `yarn audit` = **0** after Next `15.5.21` (fixes CVE-2025-29927 middleware auth-bypass + others), postcss/sharp pinned. Good.
- **API security — LOW/MEDIUM:** RPC authz strong; **no rate limiting** anywhere (esp. the future public lead-intake and the public `/q/[token]` + approval endpoints) — **MEDIUM**. Token entropy/expiry for approval links not verified here — **MEDIUM until confirmed**.
- **Logging — MEDIUM:** No security/audit logging in practice (`activity_log` under-used); invoice auto-create errors are swallowed. Impairs incident response.
- **Encryption — INFO:** Managed by Supabase.
- **Rate limiting — MEDIUM:** Absent app-side; relies on Supabase defaults.

**Net:** The **authorization core is genuinely strong** (top decile for an MVP). The gaps are **operational** (no rate limiting, no audit logging/observability, committed source zip, unverified customer-role and approval-token hardening).

---

## 14. Code Quality

- **Architecture:** Clear separation (routes → domain libs → supabase). Fat-DB pattern is deliberate and consistent.
- **Readability:** High. SQL migrations are exceptionally well-commented (intent, concurrency model, security rationale). TS is idiomatic.
- **Consistency:** Strong naming conventions across RPCs and lib modules; consistent UI primitives.
- **Naming:** Good (`_require_*`, `next_*_number`, `*_with_items`).
- **Documentation:** Excellent at the migration/PRD level (`memory/PRD.md`, per-migration headers). **Missing:** API spec, architecture README, runbook.
- **SOLID/DRY:** Reasonable; DEFINER helpers avoid duplication; `_compute_*_totals` centralizes money. Some repetition across per-status RPCs (acceptable for clarity).
- **Technical debt:** (1) dead FastAPI/Mongo backend; (2) off-repo Edge Functions; (3) committed source zip; (4) no tests; (5) forward-only manual migrations; (6) `no-store` everywhere.
- **Dead code:** `backend/server.py` + Mongo deps; `REACT_APP_BACKEND_URL`.
- **Complexity:** Moderate and well-contained; the riskiest complexity is hidden in un-versioned Edge Functions.
- **Test coverage:** **~0% automated.** QA = 5 `testing_agent` iterations + manual owner verification + read-only SQL verify scripts. Unacceptable for a financial/multi-role system long-term.

---

## 15. Production Readiness

- **Reliability:** Unproven (no tests, no monitoring). Core flows manually verified once.
- **Maintainability:** Good code hygiene undermined by no CI, no tests, off-repo logic, manual migrations.
- **Observability:** **None.** No error tracking, metrics, tracing, or dashboards.
- **Fault tolerance:** DB transactions/idempotency are solid; app has no retry/circuit-breaking beyond a client timeout; invoice errors are swallowed.
- **Scalability:** Fine for one SMB; not engineered for multi-tenant SaaS (pagination/caching/read-models absent).
- **Disaster recovery:** Relies on Supabase defaults; no documented/tested RTO/RPO; no down-migrations.
- **Operational readiness:** Low — no runbook, no alerting, manual DB changes, deployment not working.
- **Deployment maturity:** Low — no CI/CD, production blocked by platform pipeline.

**Verdict:** **Not production-ready** as an operational system, despite a strong security core, primarily due to deployment failure, zero automated tests, and zero observability.

---

## 16. Known Issues

- **Deployment:** Production build fails (`build-frontend-artifacts.sh` missing) — platform; earlier CRA-static image served nginx default; earlier `sharp` direct-dep engine hard-fail (fixed).
- **Bugs/limitations:** Estimate form doesn't persist (by design, pending endpoint); invoice auto-create errors are silently swallowed; customer-role permissions untested; portal/mobile are scaffolds.
- **Scalability:** Unbounded list reads (no pagination); `no-store` everywhere.
- **Security:** No rate limiting; under-used audit logging; committed `southern-magnolia-source.zip`.
- **Reliability:** No tests, no monitoring, manual forward-only migrations.
- **Architecture:** Critical logic (dashboard/`me`) outside the repo; dead FastAPI/Mongo backend.

---

## 17. Engineering Roadmap (prioritized)

| # | Work | Biz value | Tech value | Risk reduction | Effort |
|---|------|-----------|-----------|----------------|--------|
| 1 | Unblock production deploy (Support + confirm Node/SSR pipeline) | ★★★★★ | ★★★ | ★★★★★ | S (platform-gated) |
| 2 | Apply `0018` + build Invoices UI (draft→sent→paid, payments, balance) | ★★★★★ | ★★★ | ★★ | M |
| 3 | Add automated tests: pgTAP for RPCs/RLS + Playwright e2e for core flows | ★★★ | ★★★★★ | ★★★★★ | M–L |
| 4 | Move Edge Functions (`mvp-dashboard`,`me`,`app-health`) into repo + CI deploy | ★★★ | ★★★★★ | ★★★★ | M |
| 5 | Observability: error tracking (Sentry) + minimal metrics + surface swallowed invoice errors | ★★★ | ★★★★ | ★★★★ | S–M |
| 6 | Secure public lead-intake endpoint (persist estimate form) + rate limiting + captcha | ★★★★ | ★★ | ★★★ | M |
| 7 | Pagination + server-side filtering on all list reads | ★★ | ★★★ | ★★★ | M |
| 8 | Remove dead FastAPI/Mongo backend + `REACT_APP_BACKEND_URL` + committed source zip | ★★ | ★★★ | ★★★ | S |
| 9 | Migration runner (Supabase CLI in CI) + document rollback strategy | ★★ | ★★★★ | ★★★★ | M |
| 10 | Customer portal auth + permission tests (close the deferred risk) | ★★★ | ★★ | ★★★ | M |
| 11 | Crew mobile write-path + secure photo upload (signed URLs, limits) | ★★★ | ★★ | ★★ | M–L |
| 12 | Data caching (React Query/SWR) to replace `no-store` | ★★ | ★★★ | ★★ | M |

Legend: S ≤ 2d, M ≈ 3–8d, L > 8d (single engineer).

---

## 18. Project Metrics (measured)

- **Total frontend TS/TSX files:** 71 (~**9,025 LOC**).
- **SQL migration files:** 34 total (21 forward `0001`–`0018` + preflight/verify), ~**4,626 LOC**.
- **Unused backend:** `server.py` 88 LOC; requirements 28 pinned deps.
- **Pages/route files:** 24. **UI components:** 12 primitives (+ feature components across auth/data/shell/brand/marketing/print).
- **Domain lib modules:** 16.
- **DB functions/RPCs:** 38 (incl. helpers/validators); ~21 client-callable.
- **DB tables (business):** ~18 declared across migrations (incl. 3 invoice tables pending apply).
- **Frontend prod dependencies:** 13; dev dependencies: 10.
- **Third-party integrations:** 1 (Supabase). AI: 0. Payments/email/SMS: 0 (planned).
- **Environment variables:** ~5 frontend (2 functional) + 3 backend (unused).
- **Automated tests:** ~0 (5 QA-agent iteration reports).
- **Estimated engineering hours invested:** ~**220–320 hrs** (inferred from 21 rigorously-authored migrations with preflight/verify, a 24-route typed frontend with a design system, and multiple deploy/security iterations). *Estimate, not measured.*

---

## 19. Engineering Self-Critique (unsoftened)

- **Poor decisions:** Shipping critical read logic (`mvp-dashboard`, `me`) as **Edge Functions that aren't in the repo** — unreviewable, untestable, undeployable from source, and a bus-factor landmine. Manual, forward-only migrations with **no runner and no down path** is fragile for a system handling money.
- **Over-engineering:** For a **single-company** tool, the full multi-tenant `company_id` + `has_company_role` matrix and 38-function RPC surface is heavier than the current need. It's defensible if SaaS is the goal, but it's speculative generality today.
- **Under-engineering:** **No tests, no observability, no CI, no rate limiting, no pagination.** For a financial workflow, the lack of pgTAP/e2e tests is the most serious omission. Invoice auto-create swallowing errors is a correctness landmine (a job can complete with no invoice and no alert).
- **Scalability risks:** Unbounded list reads and `no-store` fetching; advisory-lock numbering as a per-company serialization point.
- **Reliability risks:** One manual verification pass is the only proof any flow works; regressions will ship silently.
- **Maintainability issues:** Dead FastAPI/Mongo backend and a committed 1.7 MB source zip pollute the repo and the mental model of "what is the backend."
- **Hidden complexity:** The true behavior of the dashboard depends on off-repo Deno code; the deployment model depends on undocumented platform scripts.

---

## 20. Final Engineering Assessment

**Would I approve this for production?** **No — not yet.** The security/data core is strong, but (a) it doesn't deploy, (b) it has no automated tests for a money-handling multi-role system, and (c) it has no observability. Any one of these is a launch blocker.

**Approve the architecture for long-term growth?** **Conditionally.** The DB-enforced authz model is excellent and worth keeping. Two changes are required for growth: bring Edge Functions into the repo with CI, and introduce a proper migration runner + test harness. If the target is multi-tenant SaaS, add pagination/caching/read-models; if it's a single company, consider trimming speculative multi-tenancy.

**Technical risks that concern me most (ranked):** 1) can't deploy; 2) zero tests on financial logic; 3) off-repo critical logic; 4) no observability (esp. swallowed invoice errors); 5) untested customer-role/approval-token exposure.

**Must fix before launch:** production deploy; e2e + RPC/RLS tests for lead→quote→job→dispatch→invoice; error tracking + un-swallow invoice failures; verify approval-token entropy/expiry; rate-limit public endpoints; remove committed source zip.

**Can wait until after launch:** data caching layer; pagination (until volume grows); crew mobile completeness; portal payments; removing the dead backend (nice-to-have but low urgency).

**Recommended architectural changes:** version + CI-deploy Edge Functions; adopt Supabase CLI migrations with down/rollback; add read-model views instead of Edge-Function-only aggregation; introduce React Query for cache/invalidations.

**Biggest strengths:** (1) DB-enforced, defense-in-depth authorization; (2) disciplined, well-documented migrations with preflight/verify; (3) clean, consistent, typed frontend with real loading/error/empty states.

**Biggest weaknesses:** (1) no automated tests; (2) no observability; (3) production deployment broken; (4) critical logic off-repo; (5) operational immaturity (manual migrations, no CI).

### Engineering Scores (0–100)
| Dimension | Score | Rationale |
|---|---|---|
| Architecture | 74 | Strong authz model; weakened by off-repo logic + dead backend |
| Code Quality | 78 | Clean, consistent, superbly documented SQL; no tests drags it |
| Security | 80 | Excellent DB authz; gaps in rate limiting/audit/logging + committed zip |
| Performance | 66 | Fine for SMB; no pagination/caching, unmeasured |
| Reliability | 45 | No tests, no monitoring, swallowed errors |
| Scalability | 58 | Solid single-tenant; not engineered for SaaS scale |
| Maintainability | 62 | Great docs/consistency vs no CI/tests/manual migrations |
| Documentation | 72 | Excellent internal PRD/migrations; missing API/arch/runbook |
| Deployment Readiness | 30 | Standalone-ready code but production broken, no CI/CD |
| **Overall Engineering Quality** | **63** | Strong core, immature operations & verification |

---

## Appendix — 50 Highest-Impact Recommendations (ranked)

Ranking heuristic: high impact + high risk-reduction first, effort as tiebreaker. (Impact I / Risk-reduction R / Effort E: H/M/L.)

1. Unblock production deploy with Emergent Support (Node/SSR pipeline + missing build script). **I:H R:H E:L(gated)**
2. Add Playwright e2e for login + lead→quote→job→dispatch. **I:H R:H E:M**
3. Add pgTAP tests for every RPC + RLS policy (positive/negative/cross-company). **I:H R:H E:M**
4. Move `mvp-dashboard`,`me`,`app-health` Edge Functions into the repo. **I:H R:H E:M**
5. CI/CD pipeline (lint, typecheck, tests, build) as a merge gate. **I:H R:H E:M**
6. Integrate error tracking (Sentry) frontend + Edge Functions. **I:H R:H E:S**
7. Stop swallowing invoice auto-create errors; alert + retry/dead-letter. **I:H R:H E:S**
8. Apply `0018_invoices.sql`; run verify; wire Invoices UI. **I:H R:M E:M**
9. Adopt Supabase CLI migrations + CI apply to staging. **I:H R:H E:M**
10. Define and document rollback/down-migration strategy. **I:M R:H E:M**
11. Rate-limit public endpoints (`/q/[token]`, approval, future lead-intake). **I:H R:H E:M**
12. Verify quote-approval token entropy, single-use, and expiry. **I:M R:H E:S**
13. Build secure public lead-intake endpoint for the estimate form (+captcha). **I:H R:M E:M**
14. Server-side pagination + filtering on all list reads. **I:M R:M E:M**
15. Remove committed `southern-magnolia-source.zip` and scrub history. **I:M R:M E:S**
16. Remove dead FastAPI/Mongo backend + `REACT_APP_BACKEND_URL`/Mongo envs. **I:M R:M E:S**
17. Add uptime/health monitoring + alerting on Supabase + app. **I:M R:H E:S**
18. Introduce React Query/SWR; replace blanket `no-store`. **I:M R:M E:M**
19. Close the deferred **customer-role** permission model + tests. **I:M R:H E:M**
20. Structured audit logging via `activity_log` on every mutation RPC. **I:M R:H E:M**
21. Generate an API/RPC spec (typed contract + docs). **I:M R:M E:S**
22. Add architecture README + operational runbook. **I:M R:M E:S**
23. Crew mobile secure photo upload (signed URLs, size/type limits, EXIF strip). **I:M R:M E:M**
24. DB indexes review for common filters (status, company_id+created_at). **I:M R:M E:S**
25. Add DB-level backups verification + documented RTO/RPO + PITR test. **I:M R:H E:M**
26. Add `not-found`/`error` boundaries per route segment. **I:L R:M E:S**
27. Accessibility audit (focus trap in drawers/dialogs, aria, keyboard nav). **I:M R:L E:M**
28. Enforce ESLint in build (currently `ignoreDuringBuilds:true`). **I:M R:M E:S**
29. Add input length/format constraints on customer/lead free-text fields. **I:L R:M E:S**
30. Add CSP + security headers (next.config `headers`). **I:M R:M E:S**
31. Add e2e for quote approval public flow (token happy/expired/revoked). **I:M R:H E:M**
32. Add money-math property tests (rounding, discount>subtotal, tax edges). **I:M R:H E:S**
33. Add idempotency tests for convert/generate under concurrency. **I:M R:H E:M**
34. Centralize DB read logic into SQL views (portable, testable). **I:M R:M E:M**
35. Add loading/optimistic UX for RPC mutations (avoid double-submit). **I:L R:M E:S**
36. Add a feature-flag mechanism for portal/mobile scaffolds. **I:L R:L E:S**
37. Introduce environment/config validation at boot (zod on env). **I:L R:M E:S**
38. Add request tracing/correlation IDs across Edge Functions. **I:M R:M E:M**
39. Add automated dependency scanning (Dependabot/renovate + `yarn audit` in CI). **I:M R:M E:S**
40. Verify Supabase at-rest encryption + key management posture. **I:L R:M E:S**
41. Add rate-limited, audited `admin_set_profile_role` usage + UI. **I:L R:M E:S**
42. Add invoice PDF/print + email delivery (leverage `print/`). **I:M R:L E:M**
43. Add payments provider (Stripe) with webhook reconciliation. **I:M R:M E:L**
44. Add data retention/PII policy + deletion RPCs (GDPR/CCPA posture). **I:M R:M E:M**
45. Add performance budgets + Lighthouse CI on marketing pages. **I:L R:L E:S**
46. Add `job_status_events`/lifecycle audit trail wiring (currently unused). **I:L R:M E:M**
47. Add contract tests between frontend `lib/*` and RPC signatures. **I:M R:M E:M**
48. Add multi-environment (dev/staging/prod) Supabase projects + promotion. **I:M R:H E:M**
49. Add graceful degradation when Edge Functions/Supabase are down (cached shell). **I:L R:M E:M**
50. Document and test the deployment (standalone `node server.js`, `PORT`) end-to-end. **I:M R:H E:M**

---

*End of review. Confidence caveats: DB statements derive from migration DDL (not live introspection); Edge Function behavior and applied-migration state are asserted, not verified from source; LOC/metrics are measured, engineering-hours are estimated.*
