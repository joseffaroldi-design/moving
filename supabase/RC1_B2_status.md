# RC1 — B2 (Database-wide Anonymous Exposure) — Remediation Status

**Project ref:** yrvgovkkukmtdmgejtxc
**Decision date:** 2026-06 (Option C: accept documented residual + pursue platform removal in parallel)

## Classification
**B2 = MITIGATED / PRACTICALLY CLOSED, WITH DOCUMENTED PLATFORM-OWNED RESIDUAL**

Not to be classified as *fully remediated* until Supabase either removes the
`supabase_admin` public-schema default privileges, or confirms in writing that
they are platform-managed and cannot be changed.

## Evidence trail (owner-executed; agent has no DB access)
| Step | Item | Result |
|------|------|--------|
| R1 | Read-only object matrix (M1–M13) | Catalog captured; 42 relations, 37 tables + 5 views |
| R2 | Pre-change snapshot (`rc1_backup.grant_snapshot`, `default_priv_snapshot`) | VERIFIED — 588 grant rows / 42 relations / 2 grantees; 48 default-priv rows |
| R3 | Existing-object lockdown (`REVOKE ALL` on 42 relations from anon/authenticated/PUBLIC) | VERIFIED — final VERIFY returned ZERO residual grant rows |
| R3 | Live owner smoke test (Login, Dashboard, Leads, Quotes, Jobs, Dispatch) | PASSED — no errors, all pages render real data |
| R5 A | `postgres` public-schema defaults revoke (tables/sequences/functions, anon+authenticated) | VERIFIED — 0 `grantor=postgres` rows remain |
| R5 B | `supabase_admin` public-schema defaults revoke | SKIPPED — `insufficient_privilege` |

## Residual (platform-owned)
- **Remaining VERIFY rows: 24, all `grantor = supabase_admin`.** Remaining `postgres` rows: **0**.
- Coverage of residual: future **public**-schema **tables** (full DML incl. TRUNCATE),
  **sequences** (USAGE/SELECT/UPDATE), **functions** (EXECUTE) — for `anon` and `authenticated`.
- **No current anonymous exposure demonstrated from the residual.** It affects only
  objects **created as `supabase_admin`**; it does not apply to objects created as `postgres`.
- **Future project migrations executed as `postgres` are protected** by R5 Part A.
- **Compensating control (REQUIRED, ongoing):** every future migration that creates a
  public object MUST explicitly `REVOKE` anon/authenticated (and grant least-privilege
  explicitly). This project already follows this per-phase discipline (0006/0011/0016a/
  0017a/0018/0019).

## Rollback posture
- `rc1_backup.grant_snapshot` + `rc1_backup.default_priv_snapshot` remain valid and untouched.
- Emergency rollback = `RC1_R4_rollback.sql` (not needed; smoke test passed).
- Do NOT re-run `RC1_R2_pre_snapshot.sql` (would overwrite the valid snapshot).

## Gate status (unchanged by this decision)
- B1 (mvp-dashboard anonymous PII) — OPEN (verification pending).
- B3 (legacy invoice schema drift) — OPEN.
- **Production: NOT approved. Phase 8: LOCKED.** Do not unlock until B1 + B3 resolved.
