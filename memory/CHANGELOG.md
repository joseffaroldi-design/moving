# Southern Magnolia Movers — Changelog

## 2026-08-01 — Production smoke test + homepage polish audit (read-only, no code changes)

Target: https://ops-preview-7.emergent.host
- PASS: homepage 200; all nav anchors resolve; 14/14 images load; estimate intake POST→201
  {"ok":true,"status":"created"} (single request, no company_id/key_hash/payload_hash leak);
  0 console errors (only benign Cloudflare /cdn-cgi/rum beacon abort); desktop/tablet/mobile
  no horizontal overflow; mobile hamburger opens full nav; footer complete; metadata title/
  description customer-facing; favicon + OG + Twitter tags present.
- NOT TESTED (no staff account exists — signup-only, none seeded): staff login, dashboard,
  Leads pipeline verification, quotes/jobs/dispatch/invoices/portal, PDFs.
- CRITICAL P0 defects (live):
  1. Fabricated testimonials (Sarah M./Marcus T./Danielle R.) shown as genuine 5-star reviews
     (Testimonials.tsx — code comment even says "PLACEHOLDER… Do not present as genuine").
  2. Footer Privacy Policy + Terms of Service are dead links (href="#") in SiteFooter.tsx.
- Polish: no og:image/twitter:image (twitter:card=summary) → weak social preview; no canonical.
- Housekeeping: two real prod test leads created during verification (LiveIntakeZZ, ProdAuditZZ)
  — owner to remove.

## 2026-07-31 — Production deploy failure FIXED (build-blocker) + readiness fixes

- Root cause of failed prod build (Docker step 2 `pip install`): `/app/backend/requirements.txt`
  pinned `emergentintegrations==0.2.0`, which is NOT on public PyPI (404). The prod build's pip
  omits the Emergent cloudfront extra-index (only `litellm` is special-cased), so resolution
  failed → exit 1. Backend `server.py` is default boilerplate and never imports it → removed the line.
- Deployment readiness fixes (via deployment_agent): removed `.env`/`.env.*`/`*.env` from
  `/app/.gitignore` (so Emergent can inject prod values) and switched frontend supervisor
  command `yarn start` → `yarn dev` (expected hot-reload mode; also resolves earlier stale-chunk drift).
- deployment_agent re-scan: PASS (remaining notes non-blocking). Backend `/api/` 200, homepage 200.

## 2026-07-31 — Public Estimate Intake: LIVE E2E VERIFIED (slug fix, supersedes CORS note below)

- Corrected frontend Edge Function slug `public-estimate-intake` → `public-lead-intake`.
  Live browser POST → 201 `{"ok":true,"status":"created"}`, single POST, loading+disabled seen,
  success shown, no company_id/key_hash/payload_hash/service-role in payload. UTC 2026-07-31T10:22:15Z.

## 2026-06 — Public Estimate Intake: ACTIVATED (flag ON) — LIVE E2E BLOCKED BY CORS ALLOWLIST

- Set `NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED=true` in `frontend/.env` (public URL + anon key
  present; NO service-role key exposed). Rebuilt (`next build` clean, types pass, 20/20 static
  pages; only pre-existing unrelated @supabase/supabase-js Edge Runtime warning) + restarted frontend.
- Live browser submit (LiveIntakeZZ / DoNotKeep / 5045550199) fired the integration path
  (confirms flag ON), but the Edge Function CORS preflight rejected the PREVIEW origin
  `https://magnolia-movers-rc1.preview.emergentagent.com`:
  "blocked by CORS policy: Response to preflight request doesn't pass access control check:
   It does not have HTTP ok status." → net::ERR_FAILED.
- Because the OPTIONS **preflight** failed, the POST NEVER reached the server → **ZERO
  customer/lead/activity_log/idempotency rows created. No cleanup required.**
- Client behaved correctly on failure: safe fallback error, values preserved, call/text CTA,
  NO SQL/RPC/stack/internal detail exposed.
- OWNER ACTION REQUIRED (not done by agent — Edge Function is owner-owned): add the preview
  origin to the Edge Function's origin allowlist, OR run the live E2E from an already-allowlisted
  production domain. No Edge Function/SQL/RLS changes were made by the agent.

## 2026-06 — Public Estimate Intake: Frontend validation + tests — COMPLETE & VERIFIED

Finalized the frontend integration (feature flag stays OFF in committed env; deploy owner-gated).
- `frontend/src/lib/estimateValidation.ts` — zod schema mirroring server bounds
  (required first/last name ≤80, email OR phone required, email/phone format,
  move-type enum, move-date within today..+2yr). Authoritative validation stays server-side.
- `frontend/src/components/marketing/EstimateForm.tsx` — client validation + focus-first-error,
  double-submit guard (ref), honeypot short-circuit, loading/disabled states, ARIA
  (aria-invalid/aria-describedby, role=status success region), graceful failure + call/text fallback.
- Tests (plain Node .mjs, NO new deps; real TS transpiled via installed `typescript`):
  - `src/lib/__tests__/estimateValidation.test.mjs` — 19/19 pass (schema rules).
  - `src/lib/__tests__/publicIntake.test.mjs` — 16/16 pass (flag ON via env override + mocked
    fetch: success, server field errors, malformed/network fallback, no company_id/key_hash/
    payload_hash leakage, honeypot + idempotency_key in body, missing-config fallback).
- Build: `next build` clean, types valid, 20 pages generated (~32s).
- Live UX (frontend testing agent, flag OFF placeholder mode): 12/12 pass — render, required
  errors, contact rule, invalid email/phone/date, valid submit → success with ZERO network,
  edit restores values, honeypot hidden, tab order, focus-to-success, mobile 375px.
- Note: `yarn build` against the running `next start` server briefly caused a stale chunk-hash
  400; resolved by `supervisorctl restart frontend`. Frontend now serves a consistent build.

## 2026-06 — Public Estimate Intake (security-first) — CODE COMPLETE, OWNER-GATED DEPLOY

Approved architecture: Browser → Edge Function `public-estimate-intake` →
service-role-only atomic RPC `create_public_lead(jsonb)` → minimal generic
response. `anon` gains NOTHING; no existing RLS/auth/role/table modified.

Delivered (all build-verified; deploy is owner-gated — agent cannot run SQL/deploy):
- `supabase/migrations/preflight_0029_public_estimate_intake.sql` — READ-ONLY Part A
  (single compact JSON report; STOP conditions for created_by nullability, actor_role,
  triggers, name collision, single business_profile).
- `supabase/migrations/0029_public_estimate_intake.sql` — write migration (owner-run).
  Adds `public_intake_idempotency` (service-owned, RLS, no client grant) + SECURITY
  DEFINER `create_public_lead(jsonb)` granted to `service_role` ONLY. Atomic
  customer+lead (status 'new', source 'website', created_by NULL) + one activity_log
  audit row (actor_id NULL, actor_role 'public', no PII values). Tenant resolved
  in-function via the documented constant (0028 skipped — reserved for Crew Mobile).
- `supabase/functions/public-estimate-intake/index.ts` — origin-allowlist CORS,
  OPTIONS, POST-only, JSON-only, 8KB cap, strict allowlist+validation+normalization,
  honeypot, Deno KV best-effort rate limiting (fail-open, documented), DB-enforced
  idempotency (sha256 key_hash), request timeout, generic errors, no PII/secret logs.
- `frontend/src/lib/publicIntake.ts` + `EstimateForm.tsx` wired behind
  `NEXT_PUBLIC_ESTIMATE_INTAKE_ENABLED` (default OFF → homepage behavior unchanged).
  When ON: success only after server confirm, values preserved on failure, honeypot,
  client double-click guard, call/text fallback.
- Docs: `/app/docs/PUBLIC_ESTIMATE_INTAKE_PREFLIGHT.md` (design + threat model),
  `/app/docs/PUBLIC_ESTIMATE_INTAKE_ACTIVATION.md` (owner runbook).

Field-mapping (base tables unaltered): city+zip → composed origin/destination
addresses; move_type/home_size/services/notes → structured plain-text `leads.notes`
block (React-escaped; not executable). Behavior: one new customer + one new lead
per request; no weak email/phone merge; atomic; no orphans.

Next (owner): run preflight → apply 0029 → deploy function → set flag → verify.



## 2026-06 — Public Marketing Homepage Redesign (P0) — COMPLETE & VERIFIED

Complete premium, NOLA-themed redesign of the public homepage at route `/`.
Ops platform (auth, dashboard, portal, dispatch, quotes, jobs, invoices,
Supabase, RLS) was NOT touched — frontend-only marketing work.

### What was built
- Luxury editorial homepage in brand palette (navy `#0E2A4A` / antique gold
  `#C89A3D` / cream). Serif Playfair headings, IBM Plex body, gold accents.
- Section order: Hero → Trust Bar → Why Choose Us → Services (6 cards) →
  Process Timeline (5 steps) → Testimonials (carousel) → FAQ (accordion) →
  Estimate section (Service Area + Estimate form) → Footer.
- Cinematic hero reuses signature artwork `/public/brand/login-art.jpg`
  (never redrawn) blended with real moving photography + navy gradients + grain.
- Official logo added: `/public/brand/logo-official.jpg` (raw) processed into
  `/public/brand/logo-lockup.png` (ornamental frame removed for web, identity
  preserved) — used in header (cream) and footer (cream plaque on navy).
- 11 warm, professional photos downloaded locally to
  `/public/brand/photos/` (hero, why-us x3, services x6, process). Zero CLS.
- CSS-only premium motion: scroll-reveal (`Reveal.tsx`, visible-by-default,
  arms only below-fold elements — robust if JS/observer fails), hover lift,
  image zoom, gold rules, grain overlay.
- SEO metadata + OpenGraph on the homepage.

### Estimate form — IMPORTANT (frontend-only by design)
- The public estimate form (`EstimateForm.tsx`) is intentionally FRONTEND-ONLY.
  On submit it shows a local success/thank-you state with a call CTA. It does
  NOT persist or transmit any data.
- Reason: `create_lead_with_customer` RPC is `authenticated`-only + role-gated
  and derives company_id from the staff session (migration 0009). Anonymous
  visitors are deliberately locked out of lead/customer tables (RC1_R3). Per
  owner instruction, the public intake backend (an anon-safe RPC/Edge Function
  with validation + rate-limiting + honeypot) will be reviewed and wired
  separately. DO NOT point the public form at the staff-only RPC.

### Files added
- src/components/marketing/: SiteHeader, Hero, TrustBar, WhyChooseUs,
  ServicesGrid, ProcessTimeline, Testimonials, FAQ, EstimateSection,
  SiteFooter, BrandLogo, Reveal (all new). EstimateForm rewritten.
- src/app/page.tsx rewritten; globals.css motion utilities added.

### Verification
- Testing agent iteration_7.json: 15/15 checks PASS, frontend 100%. No UI/design
  bugs, 0 horizontal overflow at 1440/768/390, all images load, scroll + anchor
  nav work, carousel + accordion + mobile menu + form success all functional.
- Next.js production build passes (TS strict, ignoreBuildErrors:false). Homepage
  is static-prerendered (~5.7 kB, 124 kB First Load JS).

### Follow-ups / backlog
- P1: Build + review the anon-safe public lead-intake path, then wire the
  estimate form to it (validation, rate-limit, honeypot).
- P2: Replace PLACEHOLDER testimonials with real verified reviews before launch.
- P2: Optional dedicated /services/* deep-link pages for the header dropdown.
- P2: Real service-area map graphic; real Southern Magnolia photography swap-in.
