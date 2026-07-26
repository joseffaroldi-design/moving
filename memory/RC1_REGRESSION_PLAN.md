# RC1 Regression Plan — Southern Magnolia Movers (MoveOps)

Purpose: repeatable pre-release regression. Blocked tests are NEVER marked passing.
Group by what's runnable given current access. data-testids exist on interactive elements.

## GROUP 1 — Runnable NOW in preview (no login)
| # | Area | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 1 | Public homepage | GET / | 200; hero, "Free estimate" CTA, services, footer Staff-login link render | PASS (verified this session) |
| 2 | Estimate form (frontend-only) | fill + submit | Summary + "Online submission coming soon" + click-to-call; NO DB write | PASS (prior) |
| 3 | Protected redirects | GET /dashboard,/portal,/mobile unauth | 307 → /login?next=… | PASS (verified) |
| 4 | Public routes serve | GET /login,/q/<token> | 200 | PASS (verified) |
| 5 | Anon REST lockdown | curl customers/leads/quotes/jobs/... w/ anon key | 401 42501 (all business tables) | PASS (verified) |
| 6 | Anon exposure (regression guards) | curl mvp-dashboard, /rest/v1/invoices, /invoice_line_items, /companies | Must become 401/empty AFTER fixes; currently FAIL (B1/B2/B4) | FAIL (expected pre-fix) |
| 7 | Security headers | curl -I / and /dashboard | nosniff, DENY, Referrer-Policy, HSTS, CSP frame-ancestors, no X-Powered-By; /dashboard Cache-Control no-store | PENDING (this session change) |
| 8 | Build + typecheck | yarn build; tsc --noEmit | build OK (standalone), 0 TS errors | PASS (re-run after header change) |
| 9 | npm audit | yarn audit | 0 vulnerabilities | PASS (verified) |

## GROUP 2 — Requires a STAFF test account (owner/ops/dispatch/sales)
| # | Area | Steps | Expected |
|---|------|-------|----------|
| 10 | Login/logout | sign in, sign out | dashboard by role; session cleared |
| 11 | Email confirm / password reset | trigger reset email → /login redirect | email sent; reset works |
| 12 | Leads CRUD | list, open drawer, Edit lead, status change, add note | reads; edits persist; status legal transitions; note append-only |
| 13 | Customers | list/detail | staff-scoped reads |
| 14 | Quotes | create w/ line items, edit draft, mark sent, pricing totals | server-computed totals correct |
| 15 | Quote→Job conversion | convert accepted quote | idempotent; quote→converted; job J-000x |
| 16 | Jobs | list, status controls (confirm/cancel/complete) | legal transitions only |
| 17 | Dispatch | day-board, assign/edit drawer, conflict block | double-book hard-blocked |
| 18 | Role-restricted nav | login as each role | menu + RPC perms match role matrix |
| 19 | Print quote | /print/quote/[id] | renders; no PII leak to non-staff |
| 20 | RPC failure UX | invalid transition / bad input | friendly error, no raw PG error |
| 21 | Cache-Control | authenticated page responses | no-store present |

## GROUP 3 — Requires a CUSTOMER test account / public token
| # | Area | Steps | Expected |
|---|------|-------|----------|
| 22 | Quote approval link | create link → open /q/<token> → Approve/Decline | token view works; status → accepted/declined |
| 23 | Token replay/expiry | reuse expired/revoked token | rejected gracefully |
| 24 | Customer portal | login as customer | sees ONLY own records |

## GROUP 4 — Requires a SECOND company (tenant isolation)
| # | Area | Steps | Expected |
|---|------|-------|----------|
| 25 | Cross-tenant SELECT | company-B staff queries company-A ids | 0 rows / denied |
| 26 | Cross-tenant RPC | company-B calls RPC on company-A id | "does not belong to your company" |
| 27 | Cross-tenant storage | company-B reads company-A job photos | denied |

## GROUP 5 — Requires OWNER DB access (SQL editor)
| # | Area | Steps | Expected |
|---|------|-------|----------|
| 28 | Anon grants sweep | RC1_diag §3 | anon has NO privileges on any business table |
| 29 | FORCE RLS sweep | RC1_diag §4 | all business tables rls_enabled AND rls_forced |
| 30 | Invoice schema reconcile | RC1_diag §1/§6/§7 | legacy schema known; drift resolved before 0018 |
| 31 | RPC execute grants | verify_00xx | client RPCs → authenticated; helpers → none |

## GROUP 6 — Requires PRODUCTION deployment
| # | Area | Steps | Expected |
|---|------|-------|----------|
| 32 | Prod homepage | GET prod URL | app loads (not nginx default) |
| 33 | Prod owner login | sign in on prod | dashboard loads |
| 34 | Prod SSR/middleware | GET /dashboard unauth on prod | 307 → /login |
| 35 | Prod headers | curl -I prod | security headers present at edge |

Automation: GROUP 1 is CI-able (curl + build). GROUP 2–4 → testing_agent with seeded accounts. GROUP 5 → owner SQL.
