# Southern Magnolia Movers — Changelog

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
