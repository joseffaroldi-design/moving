# RC1 Risk Register — Southern Magnolia Movers (MoveOps)

Updated 2026-07-24. Severity: CRITICAL/HIGH/MEDIUM/LOW. Status: OPEN/MITIGATED/BLOCKED/ACCEPTED.
Owner: OWNER = business owner action · SUP = Emergent Support · ENG = main agent (repo).

| ID | Issue | Sev | Likelihood | Impact | Mitigation | Owner | Status | Verification |
|----|-------|-----|-----------|--------|-----------|-------|--------|--------------|
| B1 | mvp-dashboard returns full customer PII to anonymous callers | CRITICAL | Certain | Full-company PII breach | Rewrite Edge Function to require valid staff JWT + derive company server-side; stop anon payload | OWNER+ENG | OPEN (fn source not in repo) | anon curl → 200 w/ PII (VERIFIED). Fix = anon curl must 401 |
| B2 | Legacy `invoices`/`invoice_line_items` anon-readable via REST | CRITICAL | Certain | Financial/PII exposure once rows exist | Revoke anon+authenticated grants, FORCE RLS, staff-only SELECT policies (via reconciliation migration) | OWNER+ENG | OPEN | anon REST → 200 (VERIFIED). Fix = 401 |
| B3 | Legacy invoice schema drift (tables outside migration history) | HIGH | Certain | 0018 binds to wrong schema; runtime failures | Inspect live schema (RC1_diag), then author reconciliation `0019a` (align or drop+recreate); DO NOT run 0018 as-is | OWNER+ENG | OPEN | RC1_diag output pending |
| B4 | `companies` anon SELECT grant (RLS=0 rows today) | MEDIUM | Low now / High under drift | Company records exposed if policy loosens | `0020_companies_anon_revoke.sql` (authored, not run) | OWNER | OPEN (fix prepared) | anon REST → 200 now; post-fix 401 |
| R1 | Vestigial FastAPI+Mongo backend live & possibly deployed; CORS `*`+credentials | MED-HIGH | Medium | Extra attack surface / arch confusion | Remove from deploy or lock down; fix CORS | OWNER+ENG | OPEN | `backend/server.py` review (VERIFIED live) |
| R2 | Public self-signup enabled | MEDIUM | Medium | Unbounded account creation / spam tenants | Disable public signup in Supabase Auth (invite-only) or env-gate signup UI; email-confirm ON mitigates | OWNER | OPEN | Auth setting review |
| R3 | Invoice auto-draft failure swallowed (raise notice only) | HIGH (Phase 8) | Medium | Silent missing invoice → lost revenue | Log to durable sink (activity_log / failures table) before Phase 8 go-live | ENG | OPEN (0018 not run) | Code review of set_job_status hook |
| R4 | `record_invoice_payment` not idempotent (double-click → double payment) | MEDIUM (Phase 8) | Medium | Over/duplicate payment recorded | Client submit-guard + optional idempotency key | ENG | OPEN (Phase 8) | Design review |
| R5 | Tenant / customer / storage isolation unproven with live JWT | HIGH | Unknown | Cross-tenant data access if RLS gap | Run isolation tests w/ 2 tenants (see regression plan) | OWNER+ENG | BLOCKED | Needs staff + 2nd-company accounts |
| R6 | SSR production deploy blocked (missing platform build script) | HIGH | Certain | Cannot ship to prod | Emergent Support fixes deploy template | SUP | BLOCKED | Deploy retry after SUP fix |
| R7 | No observability (frontend errors, edge errors, auth/authZ events, uptime, alerts) | HIGH | Certain | Blind to incidents in prod | Implement RC1_OBSERVABILITY_PLAN.md MVP | ENG+OWNER | OPEN | Plan authored |
| R8 | No documented DB rollback/backup/recovery procedure | HIGH | Certain | Slow/unsafe recovery | Document PITR/backup + per-migration rollback | OWNER+ENG | OPEN | Doc pending |
| R9 | Web Lock disabled → multi-tab refresh race | LOW | Low | Rare transient auth glitch | Documented tradeoff; leave as-is | ENG | ACCEPTED | Code comment |
| R10 | `next` post-login redirect ignored | LOW | Low | Minor UX (not returned to page) | Defer post-RC1 | ENG | ACCEPTED | login/page.tsx |

Hardening applied (repo, safe): RC-SEC-HEADERS (next.config security headers + PII no-store) — status MITIGATED,
verified via build + curl + testing_agent regression.
