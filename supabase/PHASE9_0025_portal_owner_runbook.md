# Phase 9 — Customer Portal Access (0025) — Owner Runbook & Design Dossier

Author-and-review only. Nothing has been executed. No portal UI was built.
Migration file: `/app/supabase/migrations/0025_customer_portal_access.sql`
Depends on: `0024_activity_log_hardened.sql` (apply first — see its own runbook
`PHASE9_0024_activity_log_owner_runbook.md`).

Architecture (approved): **explicit-field read RPCs**. Customers never receive a
base-table `SELECT` policy; every read returns an explicit whitelist of
customer-safe fields as JSON via `SECURITY DEFINER` RPCs. RLS filters rows, not
columns — so a broad customer `SELECT` policy would have exposed every column of
the table through the Supabase Data API. Explicit RPCs eliminate that class of leak.

---

## 1. Column-exposure matrix

Legend — **Safe** = exposed to the portal customer (their own record only);
**Internal** = staff/ops only; **Financial-internal** = money staff keep private;
**Identity/security** = never exposed; **—** = not applicable.

Column lists below reflect the schema as defined by the applied migrations
(0006/0009 customers, 0011–0015 quotes, 0016b jobs, 0018 invoices). Part A2 of
the migration re-confirms every column against the live DB before Part B runs.

### customers (0006/0009)
| Column | Class | Exposed by portal? |
|---|---|---|
| id | Identity | No (used internally by resolver; never returned) |
| company_id | Internal | No |
| first_name, last_name, email, phone | Safe | Editable via `portal_update_contact` (not returned by a read RPC) |
| auth_user_id | Identity/security | No (added by 0025) |
| created_by | Internal | No |
| created_at / updated_at | Internal | No |
| notes (if present) | Internal | No |

### quotes (0011–0015)
| Column | Class | Exposed by portal? |
|---|---|---|
| id, quote_number, status | Safe | Yes |
| created_at, expires_at, accepted_at | Safe | Yes (accepted_at in detail only) |
| hourly_rate, estimated_hours, travel_fee, packing_fee, materials_fee, discount, subtotal, tax_rate, tax, total, deposit_percent, deposit_amount | Safe (customer-facing pricing) | Yes — identical set already exposed to customers by the 0015 token view `get_quote_by_approval_token` |
| company_id | Internal | No |
| customer_id | Identity | No (used as the ownership filter, never returned) |
| lead_id | Internal | No |
| created_by | Internal | No |
| sent_at, updated_at | Internal | No |
| status = **draft** | Internal | Hidden — draft quotes excluded from list & detail |

### quote_line_items (0011)
| Column | Class | Exposed? |
|---|---|---|
| description, quantity, unit_price, total, sort_order | Safe | Yes (only for owned, non-draft quotes) |
| id, quote_id | Identity/Internal | No |

### jobs (0016b)
| Column | Class | Exposed? |
|---|---|---|
| id, job_number, status | Safe | Yes |
| scheduled_start, scheduled_end | Safe | Yes |
| origin_address, destination_address | Safe (customer's own move) | Yes |
| **dispatch_notes** | Internal | **No** (staff dispatch instructions) |
| crew_size, truck_count | Internal (ops) | No (conservative) |
| company_id, quote_id, customer_id | Internal/Identity | No |
| created_by, created_at, updated_at | Internal | No |

### invoices (0018)
| Column | Class | Exposed? |
|---|---|---|
| id, invoice_number, status | Safe | Yes |
| subtotal, tax_rate, tax, total, amount_paid, balance | Safe (customer-facing bill) | Yes |
| notes | Safe (customer-facing terms; shown on printable invoice, Phase 8) | Yes |
| due_date, sent_at | Safe | Yes (sent_at = "issued") |
| company_id, job_id, quote_id, customer_id | Internal/Identity | No |
| created_by | Internal | No |
| created_at, updated_at | Internal | No |
| status = **draft** | Internal | Hidden — draft invoices excluded |

### invoice_line_items (0018)
| Column | Class | Exposed? |
|---|---|---|
| description, quantity, unit_price, total, sort_order | Safe | Yes (owned, non-draft invoice) |
| id, invoice_id | Internal | No |

### invoice_payments (0018)
| Column | Class | Exposed? |
|---|---|---|
| amount, method, paid_at, note | Safe | Yes (owned, non-draft invoice) |
| id, company_id, invoice_id | Internal | No |
| **recorded_by** | Internal (which staff took payment) | **No** |
| created_at | Internal | No |

---

## 2. Acceptance dependency & side-effect analysis

Question: what must `portal_approve_quote` reproduce so it is not a weaker
parallel path to the authoritative token acceptance in
`respond_to_quote_approval` (0015)?

Evidence gathered (read of 0003, 0011–0015):
- **No triggers on `public.quotes`.** No `CREATE TRIGGER` exists in any migration
  for quotes. Quote acceptance does not auto-create a job (conversion is a
  separate manual RPC `convert_quote_to_job`, 0016b).
- **Activity log is not trigger-driven.** No DB trigger writes an audit row on
  quote status change; `respond_to_quote_approval` (0015) itself does **not**
  log. (Also: `activity_log` did not exist in this DB until the new
  `0024_activity_log_hardened.sql` — see that runbook.)
- Therefore the complete set of authoritative acceptance side-effects is:
  1. **Expiry guard** — if `quotes.expires_at <= now()`, flip status to
     `expired` and refuse acceptance.
  2. **Status transition** — only `sent`/`viewed` may become `accepted`; set
     `accepted_at = now()`, `updated_at = now()`.
  3. **Token cleanup** — revoke all outstanding active
     `quote_approval_tokens` for the quote (`revoked_at = now()` where
     `revoked_at is null and decided_at is null`).

`portal_approve_quote` reproduces all three, in one transaction, with the quote
row locked `FOR UPDATE` to serialise against a concurrent token-path decision.
The accept uses a **status-guarded `UPDATE ... RETURNING`** so it succeeds for
exactly one eligible quote; if zero rows update, it raises (distinguishing
not-found vs. not-awaiting-decision).

**Shared-internal reuse:** 0015 exposes no reusable internal "accept" function
(its logic lives inside the token-bearer `respond_to_quote_approval`). Extracting
one would require editing 0015 and re-verifying the token path — out of scope for
this migration. Instead the invariants are reproduced verbatim and enumerated
here for audit.

**Audit behavior (owner-approved: ATOMIC / FAIL-CLOSED).** Step (iv) writes ONE
`activity_log` row for the approval **inside the same transaction as acceptance
and token revocation, with NO exception handler**. The three effects —
(ii) status→accepted, (iii) token revocation, (iv) audit insert — are atomic:
either all three commit, or ANY failure rolls the entire operation back (a failed
audit insert therefore prevents the quote status change and token revocation).
Every identity/tenant field is derived server-side from the **verified active
profile** and the **Auth user**, and cannot be forged by the client:
`actor_id = auth.uid()`; `actor_role` and `company_id` from the caller's own
active `public.profiles` row (**not** hardcoded); `actor_email` from
`auth.users` (the authenticated Auth-user email, **not** the customer-editable
`customers.email`). Only the descriptive fields (`action='quote.approved'`,
`entity_type='quote'`, `entity_id`, `summary`, `metadata`) are set by the trusted
function body — the client supplies none of them (it calls
`portal_approve_quote(quote_id)` only). Customers cannot read `activity_log`
(company-scoped, staff-only read policy in `0024_activity_log_hardened.sql`).
Verified by C10 (no exception handler) and by the transactional fail-closed test
(§5, T-FAILCLOSED).

---

## 3. RPC reference — names, parameters, returned fields

All are `SECURITY DEFINER`, `search_path = public, pg_temp`. anon/PUBLIC = no
EXECUTE. `authenticated` = EXECUTE on the 8 client RPCs only. The internal
resolver has no client grant. None accept a company_id or customer_id argument.

| RPC | Params | Returns |
|---|---|---|
| `_portal_current_customer_id()` *(internal)* | — | `uuid` (caller's linked customer id, or NULL). auth.uid()-only; validates active `customer` profile + non-null matching company. |
| `portal_list_quotes` | `p_limit int=20`, `p_offset int=0` | `{ items:[{id,quote_number,status,created_at,expires_at,total,deposit_amount}], count, limit, offset }`. Non-draft only. Order: created_at desc, id desc. Limit clamped 1..100. Built with explicit `json_build_object`. |
| `portal_get_quote` | `p_quote_id uuid` | `{id,quote_number,status,created_at,expires_at,accepted_at,hourly_rate,estimated_hours,travel_fee,packing_fee,materials_fee,discount,subtotal,tax_rate,tax,total,deposit_percent,deposit_amount, line_items:[{description,quantity,unit_price,total,sort_order}]}`. Owned + non-draft only. |
| `portal_list_jobs` | `p_limit int=20`, `p_offset int=0` | `{ items:[{id,job_number,status,scheduled_start,scheduled_end,origin_address,destination_address}], count, limit, offset }`. Order: scheduled_start desc nulls last, id desc. |
| `portal_get_job` | `p_job_id uuid` | `{id,job_number,status,scheduled_start,scheduled_end,origin_address,destination_address}`. Owned only. No dispatch_notes/crew/truck. |
| `portal_list_invoices` | `p_limit int=20`, `p_offset int=0` | `{ items:[{id,invoice_number,status,total,amount_paid,balance,due_date,sent_at}], count, limit, offset }`. Non-draft only. Order: sent_at desc nulls last, id desc. |
| `portal_get_invoice` | `p_invoice_id uuid` | `{id,invoice_number,status,subtotal,tax_rate,tax,total,amount_paid,balance,notes,due_date,sent_at, line_items:[...], payments:[{amount,method,paid_at,note}]}`. Owned + non-draft only. |
| `portal_approve_quote` | `p_quote_id uuid` | `{quote_id,status:'accepted'}`. Reproduces 0015 invariants + optional audit log. |
| `portal_update_contact` | `p_first_name,p_last_name,p_email,p_phone text` | `{customer_id,updated:true}`. Updates only own name/email/phone (blank = keep). |

---

## 4. Owner runbook (Part A–E)

1. **Part A (read-only preflight).** Run all of A1–A6. **Save A3's output** (prior
   defs/policies), the A3b legacy-resolver owner/grant capture, the A3c legacy
   dependency inventory (c1–c5), and the A5 + A6 snapshots. If A1 ≠ 0, if A2 is
   missing an expected row, if A3 shows any pre-existing `portal_*`/`_portal_*`
   function or `*_customer_self*`/`*portal*` policy, or if A4 is false → **STOP**
   and reconcile; do not run Part B. A3c is the gate for Part F: revoke-harden
   the legacy `current_customer_id()` only when c1–c5 all return zero rows.
2. **Part B (migration).** Run the whole `begin … commit;` block once.
3. **Part C (read-only verification).** Run C1–C10; paste results. Pass criteria:
   - C1 both true.
   - C2 all 9 rows: `security_definer=t`, `config` contains `search_path=public, pg_temp`, owner is your DB owner.
   - C3 returns **0 rows**.
   - C4: `authenticated=X` (execute) present on the 8 client RPCs; NO anon/PUBLIC execute; `_portal_current_customer_id` shows no client execute.
   - C5 returns **0 rows** (no customer table policy added).
   - C6 == Part A5 snapshot (staff policies unchanged).
   - C7 == Part A6 snapshot (grants unchanged).
   - C8 lists the 8 RPCs (or is empty on PG builds that don't record SQL-body deps — acceptable; rely on C3/C4 + negative tests).
   - C9 returns **0 rows**.
   - C10: `has_exception_handler = false` AND `references_activity_log = true`
     (proves the audit write is present and fail-closed — no handler can suppress it).
4. **Part D (link one customer).** Edit the two UUIDs, run the guarded `DO`
   block. It aborts on any validation failure and updates exactly one row.
   Then, signed in as that user, `select public._portal_current_customer_id();`
   must return the customer id.
5. **Security Advisor (Requirement 15).** In the Supabase Dashboard →
   *Advisors → Security Advisor*, run a fresh scan after Part B. Expected: no
   new ERROR/WARN attributable to 0025. Specifically confirm no
   "RLS disabled"/"policy exposes data" finding on the 7 base tables (0025 adds
   no policies), and that the new functions are not flagged for a mutable
   `search_path` (they pin `public, pg_temp`). Paste the diff vs. your last scan.

---

## 5. Positive / negative verification matrix

Run these as a **linked customer** (`role=customer`, active, linked via Part D)
and separately as a **staff** user and **anon**.

| # | Actor | Action | Expected |
|---|---|---|---|
| P1 | Linked customer | `portal_list_quotes()` | Only own non-draft quotes; draft absent; count matches; ordered created_at desc |
| P2 | Linked customer | `portal_get_quote(own non-draft)` | Full whitelisted quote + line items |
| P3 | Linked customer | `portal_list_jobs()` / `portal_get_job(own)` | Own jobs; **no** dispatch_notes/crew/truck fields present |
| P4 | Linked customer | `portal_list_invoices()` / `portal_get_invoice(own non-draft)` | Own invoices + line items + payments; **no** recorded_by/company_id |
| P5 | Linked customer | `portal_approve_quote(own 'sent'/'viewed')` | `{status:'accepted'}`; quote→accepted; accepted_at set; outstanding tokens revoked; exactly one `activity_log` row written **atomically** (company_id + actor_role from active profile; actor_email from auth.users) |
| P6 | Linked customer | `portal_update_contact('New','Name','e@x.com','555')` | `{updated:true}`; only name/email/phone changed |
| N1 | Linked customer | `portal_get_quote(other customer's quote id)` | error `Quote not found` (no leak) |
| N2 | Linked customer | `portal_get_quote(own **draft** quote id)` | error `Quote not found` (drafts hidden) |
| N3 | Linked customer | `portal_approve_quote(own 'draft'/'accepted'/'expired')` | error `not awaiting a decision` / `has expired`; status unchanged |
| N4 | Linked customer | `portal_approve_quote(expired-by-date, token still valid)` | quote flips to `expired`; error `has expired`; cannot accept |
| N5 | Linked customer | direct `select * from public.quotes` (Data API) | 0 rows (no customer SELECT policy) |
| N6 | Linked customer | direct `select * from public.jobs / invoices / customers` | 0 rows (staff-only policies) |
| N7 | Staff (owner/ops/sales/dispatch) | all existing quote/job/invoice reads & RPCs | unchanged — still work exactly as before |
| N8 | Staff | `portal_list_quotes()` etc. | `_portal_current_customer_id()` returns NULL → error `Not authorized as a customer` (staff aren't customers) |
| N9 | anon | any `portal_*` RPC | 401 / no EXECUTE |
| N10 | Unlinked / inactive / wrong-company customer | any `portal_*` RPC | error `Not authorized as a customer` |
| N11 | Two customers, one auth user (attempt) | Part D link | aborts (unique index + guard); 0 rows changed |

### T-FAILCLOSED — transactional proof that a failed audit insert rolls back everything

Prerequisites: `0024` + `0025` applied; one **linked** customer (Part D) who owns
a quote in status `sent` or `viewed`. You need that customer's `auth.users.id`
(`<AUTH_USER_ID>`) and the quote id (`<QUOTE_ID>`). Run in the SQL Editor.

Step 1 — install a trigger that forces every `activity_log` insert to fail:
```sql
create or replace function public._t_block_audit() returns trigger
  language plpgsql as $$ begin raise exception 'forced audit failure (test)'; end $$;
create trigger _t_block_audit before insert on public.activity_log
  for each row execute function public._t_block_audit();
```

Step 2 — record the pre-state (should show status sent/viewed and >=1 active token):
```sql
select q.id, q.status,
  (select count(*) from public.quote_approval_tokens t
     where t.quote_id = q.id and t.revoked_at is null and t.decided_at is null) as active_tokens
from public.quotes q where q.id = '<QUOTE_ID>';
```

Step 3 — attempt approval AS the linked customer (impersonate via JWT claim).
EXPECTED: the call ERRORS with `forced audit failure (test)`:
```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<AUTH_USER_ID>','role','authenticated')::text, true);
  select public.portal_approve_quote('<QUOTE_ID>');   -- raises; aborts the txn
rollback;
```

Step 4 — verify the post-state is IDENTICAL to Step 2 (status still sent/viewed,
same active token count) — proving the accept + token revocation rolled back with
the failed audit insert:
```sql
select q.id, q.status,
  (select count(*) from public.quote_approval_tokens t
     where t.quote_id = q.id and t.revoked_at is null and t.decided_at is null) as active_tokens
from public.quotes q where q.id = '<QUOTE_ID>';
```

Step 5 — teardown (MANDATORY — restores normal logging):
```sql
drop trigger if exists _t_block_audit on public.activity_log;
drop function if exists public._t_block_audit();
```

PASS = Step 3 errors AND Step 4 == Step 2. Then re-run P5 (with the trigger
removed) to confirm a real approval succeeds and writes exactly one audit row.

---

## 6. Rollback behavior (Part E)

Part E drops the 9 functions and the unique index (and, only if you choose, the
`auth_user_id` column). Because 0025:
- creates a **new** internal resolver name (`_portal_current_customer_id`) and
  does **not** touch legacy `public.current_customer_id()`,
- adds **no** base-table SELECT policies,
- changes **no** table grants or staff policies,

…the rollback restores the exact pre-0025 state with no residue. Staff RLS,
staff RPCs, invoice/quote/job business logic, and the `activity_log` table
(owned by 0024) are never affected by either the migration or the 0025 rollback.
If any customer has already been linked and you drop the column, those links are
lost (re-link via Part D after re-applying).

`Part F` is a **separate** legacy-resolver hardening step (run outside the Part B
transaction). Per owner decision the dormant email-based
`public.current_customer_id()` may not remain merely dormant: after the Part
A3b/A3c evidence confirms nothing depends on it (c1–c5 all zero), Part F
positively REVOKEs EXECUTE from PUBLIC/anon/authenticated. It does **not** drop
the function — a drop is deferred to a future, separately-approved migration and
only once the dependency inventory + saved definition make removal safe.

---

## 7. Compliance with the approval requirements

1. ✅ `auth_user_id` link + auth-UID-only resolver; no email match, no LIMIT 1.
2. ✅ Every RPC verifies caller present + active customer profile + non-null
   matching company + object ownership (via `_portal_current_customer_id` gate
   and per-row `customer_id = v_cust` filters).
3. ✅ No RPC accepts company_id or customer_id from the client.
4. ✅ Explicit `json_build_object` with fixed field lists everywhere; no
   `SELECT *` to the client, no `row_to_json`, no broad composite record, and
   no dynamic SQL.
5. ✅ Draft quotes and invoices excluded from list and detail.
6. ✅ List RPCs paginate with bounded limit (1..100) + deterministic order.
7. ✅ `portal_approve_quote` reproduces 0015 invariants incl. token revocation,
   atomically; shared-internal reuse evaluated (none exists) and documented.
8. ✅ Status-guarded atomic `UPDATE ... RETURNING`, exactly one eligible quote.
9. ✅ Server-side audit log is **atomic & fail-closed** (no exception handler):
   acceptance + token revocation + audit insert all commit together or all roll
   back. Identity is derived from the verified active profile (`actor_role`,
   `company_id`) and `auth.users` (`actor_email`), never the client or the
   editable `customers.email`. Verified by C10 + T-FAILCLOSED.
10. ✅ EXECUTE revoked from PUBLIC/anon on every function; authenticated granted
    only the 8 client RPCs.
11. ✅ Part C verifies owner, signature, SECURITY DEFINER, pinned search_path,
    grants, dependencies, and absence of email-based identity resolution.
12. ✅ Part D is a guarded owner-run transaction validating both IDs, active
    customer role, matching company, existing-link conflicts, and exactly one
    updated row.
13. ✅ Uses new object names; Part A3 aborts on unexpected pre-existing
    portal/self objects; rollback preserves prior state exactly.
14. ✅ No change to staff RLS, table grants, invoice/quote business logic, Edge
    Functions, or application code.
15. ✅ Part A5/A6 vs C6/C7 diff + Supabase Security Advisor scan step included.
