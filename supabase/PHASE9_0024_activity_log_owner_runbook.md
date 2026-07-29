# Phase 9 — Hardened Activity Log (0024) — Owner Runbook & Design Dossier

Author-and-review only. Nothing executed. No UI built.
Migration file: `/app/supabase/migrations/0024_activity_log_hardened.sql`
Consumed by: `0025_customer_portal_access.sql` (`portal_approve_quote` audit write).

---

## 1. Why a new migration (not the legacy 0003)

`public.activity_log` does **not** exist in this database
(`to_regclass('public.activity_log') = null`; confirmed in portal Part A2/A2b).
The legacy `0003_activity_log.sql` was authored but never applied here, and its
design has two security gaps this hardened version fixes:

1. **No `company_id`** → staff `SELECT` could not be tenant-scoped, so a staff
   member of company A could read company B's audit rows (cross-tenant leak).
2. **Direct-INSERT policy checked only `actor_id = auth.uid()`** → any
   authenticated client could insert rows with a forged `actor_email`,
   `actor_role`, `action`, `entity_*`, `metadata`.

## 2. Every repository reference to `activity_log` (complete inventory)

- **Application code (frontend `src/`, backend): ZERO.** No client reads or writes.
- **SQL:**
  - `0003_activity_log.sql` — the legacy table definition (never applied here).
  - `0001_security_lockdown.sql:179` — a **comment only**:
    `-- TODO(Phase 10): insert an activity_log row here once that table exists`
    inside `admin_set_profile_role`. No executable reference.
  - `0017c_job_status_transitions.sql` — no functional reference (comment match).
- **Docs** (`memory/PRD.md`, `RC1_RISK_REGISTER.md`, `TECHNICAL_DESIGN_REVIEW.md`,
  `RC1_OBSERVABILITY_PLAN.md`) — all describe it as an intended, under-utilized
  audit sink.

**Conclusion:** no live dependency exists → creating a hardened table is purely
additive and cannot break anything. The only writer after this migration will be
`0025`'s `portal_approve_quote`.

## 3. Full original `0003_activity_log.sql` definition (for the record)

```sql
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users on delete set null,
  actor_email text,
  actor_role text,
  action text not null,               -- e.g. 'lead.created', 'quote.approved'
  entity_type text,                   -- e.g. 'lead','quote','job','invoice'
  entity_id text,
  summary text,                       -- safe, human-readable change summary
  metadata jsonb default '{}'::jsonb, -- NEVER store secrets/tokens/passwords
  created_at timestamptz not null default now()
);
create index ... on public.activity_log (entity_type, entity_id);
create index ... on public.activity_log (created_at desc);
alter table public.activity_log enable row level security;   -- NOT forced
-- read  policy: authenticated, role in (owner,manager,operations_manager,dispatcher,sales)
-- insert policy: authenticated, with check (actor_id = auth.uid())   <-- forgeable
-- (NO revoke of anon/public default grants; NO company scoping)
```

## 4. Column & trust-boundary matrix (hardened)

| Column | Type | Nullable | Who sets it | Client-forgeable? |
|---|---|---|---|---|
| id | uuid PK | no (default) | DB default | No |
| **company_id** | uuid → companies | **NOT NULL** | server (DEFINER derives from actor's own record) | No — clients have no INSERT grant |
| actor_id | uuid → auth.users | yes (SET NULL on user delete) | server (`auth.uid()`) | No |
| actor_email | text | yes | server (from the actor's own record) | No |
| actor_role | text | yes | server (trusted constant / active profile) | No |
| action | text | no | trusted DEFINER function body | No (client passes none) |
| entity_type | text | yes | trusted DEFINER function body | No |
| entity_id | text | yes | trusted DEFINER function body | No |
| summary | text | yes | trusted DEFINER function body | No |
| metadata | jsonb | no (default `{}`) | trusted DEFINER function body | No |
| created_at | timestamptz | no (default now()) | DB default | No |

**Trust boundary:** there is **no client write path at all**. `authenticated`
holds `SELECT` only; `anon`/`PUBLIC` hold nothing. Every insert originates from a
`SECURITY DEFINER` function (owned by `postgres`) that derives all identity and
tenant fields server-side. No client-facing `log_activity` RPC is created in this
migration (none is needed — the sole writer is `0025.portal_approve_quote`). Any
future staff-side logging must be added as its own `SECURITY DEFINER` RPC that
derives identity + company server-side; **direct browser INSERT must never be
granted**.

## 5. Exact grants & RLS policies

Grants (Part B3):
```
revoke all on table public.activity_log from anon, public;
revoke all on table public.activity_log from authenticated;
grant select on table public.activity_log to authenticated;   -- reads only
```
So the table is **append-only from every client** (no INSERT/UPDATE/DELETE/
TRUNCATE grant to any client role).

RLS (Part B4): `enable row level security` (see §6 re: FORCE) + one policy:
```sql
create policy "activity_log_staff_read"
on public.activity_log for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active is true
      and p.company_id = activity_log.company_id           -- company-scoped
      and p.role::text in ('owner','operations_manager','dispatcher','sales')
  )
);
```
Effect: an active staff member reads only **their own company's** audit rows;
customers (`role='customer'`) and everyone else read nothing. No INSERT/UPDATE/
DELETE policy exists (append-only; writes only via DEFINER).

Role note: the legacy `manager` label is intentionally omitted (PRD records it as
dead/removed). The four canonical staff roles match the rest of the project.

## 6. Is `FORCE ROW LEVEL SECURITY` necessary here? — No (and why it's safe)

- `FORCE` only changes behaviour for the **table owner's own statements**. Every
  client role (`anon`/`authenticated`) is subject to RLS the moment it is
  **ENABLED**, so `FORCE` adds **no** client-facing protection.
- Clients have **zero write grant** (§5), so there is no client write path for
  RLS to police, with or without `FORCE`.
- Writes come only from `SECURITY DEFINER` functions executing as the table owner
  (`postgres`). With RLS **enabled but not forced**, that owner context bypasses
  RLS, so the audit `INSERT` **always succeeds without depending on the
  `BYPASSRLS` role attribute** and without needing a permissive INSERT policy.
  If we instead `FORCE`d RLS with no INSERT policy, the owner would become subject
  to RLS and the DEFINER insert could be **blocked** on any database whose owner
  lacks `BYPASSRLS`.
- `SELECT` remains fully governed by the enabled policy above.

**Decision:** `ENABLE` RLS, do **not** `FORCE`. This both guarantees the intended
DEFINER audit insert and fully governs client reads. (This differs from other
project tables that `FORCE`, because those tables expose client-reachable rows and
client write paths that must subject even the owner; `activity_log` has neither.)
Confirmed: this will **not** interfere with the `0025` `portal_approve_quote`
SECURITY DEFINER insert.

## 7. Indexes

- `(company_id, created_at desc)` — tenant timelines (primary staff query).
- `(entity_type, entity_id)` — "history for this quote/job/invoice".
- `(actor_id)` — "everything this actor did".
- `(created_at desc)` — global recent-activity.

## 8. Owner runbook

1. **Part A (read-only).** Run A1–A4; paste results. Pass: A1 = null (absent),
   A2 shows both `companies` and `profiles` with expected columns, A3 = 0 rows
   (no name collision), A4 all four `true`. If A1 is not null → the table already
   exists; STOP and reconcile (do not run Part B).
2. **Part B.** Run the `begin … commit;` block once.
3. **Part C (read-only).** Run C1–C4; paste. Pass:
   - C1: `table_exists=true`, `company_id_nullable='NO'`, FK to `companies`.
   - C2: all 4 indexes present.
   - C3: exactly one grant row → `authenticated / SELECT`; no anon/PUBLIC; no
     INSERT/UPDATE/DELETE/TRUNCATE.
   - C4: `rls_enabled=true`, `rls_forced=false`; exactly one policy
     `activity_log_staff_read` / `SELECT` / `authenticated`.
   - C5 (manual, after portal 0025 + a link): as staff → only own-company rows;
     as customer → 0 rows.
4. **Then** proceed to `0025_customer_portal_access.sql` (its own runbook).

## 9. Rollback (Part D)

Drops the read policy, the 4 indexes, and the table (destroys audit rows). Must
be done only **after** `0025` is rolled back (or before `0025` is ever applied),
since `0025.portal_approve_quote` references the table. Fully reversible re-apply.

## 10. Compliance with the corrected requirements

- ✅ Standalone hardened migration; numbered **0024** so the dependency (table)
  precedes its consumer **0025** for clean future replays.
- ✅ Reliable tenant scope via `company_id NOT NULL` + company-scoped staff read.
- ✅ Clients cannot forge `actor_id`/`actor_email`/`actor_role`/`company_id`/
  action/entity — no client write grant exists; all fields server-derived by the
  DEFINER writer.
- ✅ Preferred trusted-DEFINER writes over direct browser INSERT (no client
  INSERT path created).
- ✅ Revoked all from PUBLIC/anon; `authenticated` granted only `SELECT`.
- ✅ Company-scoped, active-staff-only reads; customers excluded.
- ✅ RLS enabled; FORCE analysed and deliberately not applied (won't interfere
  with the DEFINER insert) — §6.
- ✅ Indexes for company, entity, actor, and `created_at desc`.
- ✅ Append-only (no client UPDATE/DELETE/TRUNCATE; no such policy).
- ✅ Portal approval audit insert stays in the same transaction as acceptance
  (implemented in 0025).
- ✅ Verification + rollback provided separately (this doc §8/§9).
