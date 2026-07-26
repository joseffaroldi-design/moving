# RC1 Test-Account Matrix — Southern Magnolia Movers (MoveOps)

⚠️ Owner creates these later. NEVER paste passwords into chat or commit them. Deliver credentials to
the testing harness via LOCAL ENV VARS only (placeholders below). Use throwaway addresses. Delete after RC1.

## Credential delivery (env placeholders — values set locally, never committed)
```
TEST_OWNER_EMAIL=            TEST_OWNER_PASSWORD=
TEST_OPS_EMAIL=              TEST_OPS_PASSWORD=
TEST_DISPATCH_EMAIL=         TEST_DISPATCH_PASSWORD=
TEST_SALES_EMAIL=            TEST_SALES_PASSWORD=
TEST_CREWLEAD_EMAIL=         TEST_CREWLEAD_PASSWORD=
TEST_MOVER_EMAIL=            TEST_MOVER_PASSWORD=
TEST_CUSTOMER_EMAIL=         TEST_CUSTOMER_PASSWORD=
TEST_B2_STAFF_EMAIL=         TEST_B2_STAFF_PASSWORD=
TEST_B2_CUSTOMER_EMAIL=      TEST_B2_CUSTOMER_PASSWORD=
```
(Reference in scripts as process.env.TEST_OWNER_EMAIL etc.; store in an untracked `.env.test` or CI secrets.)

## Company A (primary tenant) accounts
| Account | Role | Company | Active | Min seed records to enable tests | Tests enabled |
|---------|------|---------|--------|----------------------------------|---------------|
| Owner | owner | A | yes | full role visibility | 10,11,12–21, mutation authZ, generate-invoice |
| Ops manager | operations_manager | A | yes | shares A data | 12–21 (ops perms), quote/job/dispatch mutations |
| Dispatcher | dispatcher | A | yes | ≥2 trucks, 1 dispatch day | 16,17 dispatch + status; NOT quote mutate (read) |
| Sales | sales | A | yes | ≥1 lead, 1 quote | 14,15 quote create/convert; NOT job status |
| Crew lead | crew_lead | A | yes | ≥1 assigned job | Phase 7 mobile (future); limited reads |
| Mover | mover | A | yes | ≥1 assigned job | least-privilege read checks; must NOT edit company data (deferred customer/mover test) |
| Customer | customer (portal) | A | yes | own quote + approval token | 22,23,24 approval + portal self-only |
| Inactive user | any (e.g. sales) | A | **no (is_active=false)** | — | verify inactive caller blocked by `_require_*` guards |

## Company B (second tenant — isolation)
| Account | Role | Company | Active | Min seed | Tests enabled |
|---------|------|---------|--------|----------|---------------|
| B-staff | owner or ops | B | yes | 1 lead/quote/job in B | 25,26 cross-tenant SELECT + RPC denial |
| B-customer | customer | B | yes | own quote in B | 24,27 customer + storage isolation |

## Minimum safe seed data (per company)
- 1 company row, 1 owner profile, ≥2 customers, ≥2 leads, ≥1 quote (draft) + 1 sent quote w/ approval token,
  ≥1 job (schedulable), 1 dispatch day, ≥2 trucks. Keep amounts trivial. No real customer PII.

## Cleanup procedure
1. Revoke approval tokens (revokeQuoteApprovalLinks) for test quotes.
2. Delete test auth users (Supabase Dashboard → Authentication → Users) — cascades profiles.
3. Delete Company A/B test rows (owner SQL, scoped by company_id) OR use a disposable Supabase project.
4. Unset local `.env.test` / CI secrets. Confirm no test creds in git (`git ls-files | grep -i env`).

## Notes
- Public self-signup should be DISABLED for prod (R2); create these via admin/invite instead.
- Deferred security test (from prior phases): confirm a `mover`/`customer` cannot mutate company data — run with
  the Mover + Customer accounts above.
