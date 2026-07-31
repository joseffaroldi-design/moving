# Public Estimate Intake — Security-First Preflight (DESIGN ONLY)

Status: **Awaiting owner approval. No SQL executed, no Edge Function deployed,
no homepage change.** The homepage estimate form remains frontend-only until
this design is approved and the backend path is deployed.

---

## 1. Recommended architecture

**Option A — Edge Function boundary + a new locked-down `SECURITY DEFINER` RPC,
invoked by the Edge Function using the service-role key.**

```
Public browser (homepage form)
  → POST /functions/v1/public-estimate-intake   (Supabase Edge Function)
      • CORS allowlist, payload-size cap, JSON parse guard
      • honeypot check, field allowlist, validate + normalize
      • best-effort rate limit + server-side idempotency
      • calls RPC with the SERVICE ROLE key (never exposed to browser)
  → public.create_public_lead(...)               (SECURITY DEFINER, service_role-only)
      • re-validates, derives company_id server-side
      • atomic customers + leads insert (mirrors 0009)
      • appends one activity_log audit row (same txn)
  → returns minimal {ok, message}
```

**Why Option A over Option B (anon-executable RPC called directly from the
browser):** Option B cannot rate-limit, cannot hold secrets, cannot enforce
payload size before the DB, has no clean CAPTCHA seam, and exposes a new
anon-executable surface whose PostgREST error/response shapes leak more than a
hand-written generic response. Option A keeps **anon with zero new privileges**
(no base-table grant, no RPC grant), puts all abuse controls at one server
boundary, and keeps the service-role secret server-side. Defense in depth:
validation happens in BOTH the Edge Function and the RPC.

---

## 2. Exact endpoint / function names

- Edge Function: **`public-estimate-intake`** → `POST /functions/v1/public-estimate-intake`
- Database RPC: **`public.create_public_lead(p_payload jsonb)`** (single jsonb arg;
  `SECURITY DEFINER`; `search_path=public, pg_temp`; **granted to `service_role` ONLY**).

---

## 3. Existing schema findings (from repo; live shape to be re-confirmed in Part A)

Base tables (`customers`, `leads`, `companies`, `profiles`) predate the
migrations and live only in the DB — so exact defaults/constraints/triggers/
nullability MUST be confirmed by the read-only Part A preflight SQL (§16) before
implementation. Derived from code (`lib/customers.ts`, `lib/leads.ts`,
`0009_create_lead_with_customer.sql`, dashboard leads form):

**`public.customers`**: `id, company_id, created_by, first_name, last_name,
email, phone, secondary_phone, billing_address_line1, billing_address_line2,
billing_city, billing_state, billing_postal_code, notes, created_at, updated_at`.

**`public.leads`**: `id, company_id, created_by, customer_id, status
(enum lead_status), source (text), move_date (date), origin_address (text),
destination_address (text), bedrooms (int), estimated_volume_cuft (int),
notes (text), assigned_to, created_at, updated_at`.

**`lead_status` enum**: `new, contacted, qualified, quoted, booked, lost`
(public intake will hardcode `new`).

**`public.activity_log` (0024, hardened)**: `id, company_id (NOT NULL, FK),
actor_id (nullable FK auth.users ON DELETE SET NULL), actor_email, actor_role,
action, entity_type, entity_id, summary, metadata jsonb, created_at`. Writes
ONLY via `SECURITY DEFINER` functions; no client INSERT grant. Perfect audit
sink for a public event (actor_id = NULL, actor_role = 'public').

**Normalization / duplicate / activity behavior today**: The staff New-Lead flow
(`create_lead_with_customer`) **always inserts a fresh customer + lead** — there
is **no dedup/merge** anywhere. Frontend normalization is minimal (`trim()`,
empty→null, basic email regex, non-negative number checks). We will REUSE this
"always create new, never weak-merge" behavior for the public path.

**Public approval-link architecture (0015)**: precedent for anon-facing endpoints
— `SECURITY DEFINER` funcs, SHA-256 token hashes, generic errors, minimal
returns. We follow the same discipline.

**Edge Functions today**: only `mvp-dashboard` — JWT-required, company derived
server-side, generic errors, no PII/JWT logging, `no-store`. Our public function
follows the same secret/error/logging discipline (but is intentionally
unauthenticated, protected by honeypot + validation + rate limit instead).

**⚠️ Field-mapping gap (important):** The public schema wants `move_type,
origin_city, origin_zip, destination_city, destination_zip, home_size, services`
— **these columns DO NOT EXIST** on `leads`/`customers`, and we must NOT alter
base tables. Mapping (no schema change): compose `origin_address` = "city ZIP",
`destination_address` = "city ZIP"; put `move_type`, `home_size`, `services`,
free-text `notes`, and safe UTM into `leads.notes` as a clean structured block;
`move_date`→`move_date`; `source`='website'. `bedrooms`/`estimated_volume_cuft`
left null unless we later derive `bedrooms` from `home_size`.

---

## 4. Exact request schema (Edge Function accepts ONLY these keys)

```jsonc
{
  "first_name": "string (required, 1–80)",
  "last_name":  "string (required, 1–80)",
  "phone":      "string (0–40)",          // at least one of phone/email required
  "email":      "string (0–160)",
  "move_type":  "enum: Residential Moving | Commercial Moving | Packing Services | Specialty Items | Local Moving | Long-Distance",
  "origin_city":        "string (0–80)",
  "origin_zip":         "string (0–10, ^[0-9-]*$)",
  "destination_city":   "string (0–80)",
  "destination_zip":    "string (0–10, ^[0-9-]*$)",
  "move_date":  "string YYYY-MM-DD (optional; today..+2y)",
  "home_size":  "enum (allowlist, optional)",
  "services":   "string[] (each from approved allowlist, max 12)",
  "notes":      "string (0–2000)",
  "utm_source": "string (0–120)",  "utm_medium": "string (0–120)",
  "utm_campaign":"string (0–120)", "utm_term": "string (0–120)", "utm_content":"string (0–120)",
  "referrer":   "string (0–300)",
  "company_website": "string — HONEYPOT (must be empty/absent)",
  "idempotency_key": "string uuid-ish (16–64 chars)"
}
```
Any key not on this allowlist is **ignored** (never forwarded to the DB).
Total raw body hard-capped (see §10). The client can **never** send/influence
`company_id, tenant, staff/owner id, assigned_to, created_by, status,
customer role, pricing, quote values, internal ids` — none are accepted or read.

## 5. Exact response schema (public, minimal)

```json
{ "ok": true,  "message": "Your estimate request was received." }
{ "ok": false, "message": "We couldn't submit your request. Please call or text us." }
```
- Honeypot hit / duplicate idempotency key → return the **success** shape
  (silent no-op) so bots learn nothing.
- Never returns customer/lead/company ids, dup status, DB text, or staff data.
- HTTP: 200 for accepted; 400 generic for validation; 429 for rate limit; 500
  generic. Body always the minimal shape above (no stack/DB detail).
- Optional (future): a random opaque `reference` code with no DB linkage —
  omitted for v1 (no real use yet).

---

## 6. Tenant derivation method

Company is **derived entirely server-side** and never accepted from the client:

- Primary: inside `create_public_lead`, select the single `business_profile`
  row's `company_id` (single-tenant deployment). If exactly one row → use it.
- The known constant is `f05941f2-13db-4779-a1f3-2d6a74ccffcd` (seed in
  `0002_business_profile.sql`) — used only as an assertion/fallback guard, not
  as a client input.
- Cross-tenant insertion is impossible because the client value (if any) is
  discarded and the RPC writes only the derived id. No tenant id is ever
  returned, and errors are generic so tenant existence can't be inferred.

## 7. Validation rules (enforced in Edge Function AND re-checked in RPC)

- Reject if body > size cap or not valid JSON → generic 400.
- Reject if honeypot `company_website` non-empty → silent success.
- `first_name`/`last_name`: trim, collapse whitespace, reject whitespace-only,
  length 1–80.
- Require at least one of a **valid** email OR a phone with ≥7 digits.
- `email`: lowercase+trim, RFC-lite regex, ≤160.
- `phone`: strip to digits/`+`, 7–15 digits, ≤40.
- `move_type`/`home_size`/`services`: must be in server allowlists (else drop
  the value, don't error).
- `move_date`: valid ISO date within `today … today+2y`, else null.
- city ≤80; zip matches `^[0-9-]{0,10}$`; notes ≤2000; UTM/referrer length-capped.
- Unknown keys ignored. No raw DB error ever surfaced.

## 8. Duplicate-handling plan (reuse existing safe behavior — no weak merges)

- **Default = always create a new customer + lead** (identical to today's staff
  flow). We do **not** auto-merge on email/phone (matches current system;
  avoids cross-record contamination and mismatched email/phone edge cases).
- **Double-click / rapid resubmit** handled by **server-side idempotency**: the
  client sends a per-session `idempotency_key`; the Edge Function records
  recently-seen keys (short TTL) and returns success without a second insert on
  replay. Also client-side: disable button on submit (already the pattern).
- **Missing email / missing phone**: allowed as long as the other exists.
- **Customer insert ok but lead insert fails**: impossible to orphan — both
  happen in ONE plpgsql transaction in the RPC (rolls back together, exactly
  like 0009).
- **Existing open lead for same person**: not merged automatically (staff triage
  in the pipeline, as today). Optional future: attach a flag in `metadata` if an
  email/phone match exists — deferred, requires owner rule.

## 9. Atomic transaction plan

`create_public_lead` body (single statement, plpgsql = atomic):
1. Re-validate inputs; derive `company_id`.
2. `insert into customers (...) returning id` (created_by NULL, source data).
3. `insert into leads (..., customer_id, status='new', source='website',
   created_by NULL) returning id`.
4. `insert into activity_log (...)` audit row.
Any failure raises → whole function rolls back → **no orphan rows**. Returns
`json_build_object('ok', true)` only (no ids).

## 10. Rate-limit & abuse-protection plan

- **Honeypot** `company_website` (hidden field) → silent success drop.
- **Payload cap**: reject bodies larger than ~8 KB before parsing.
- **Idempotency**: per-submit key → dedupes double-clicks/replays (short TTL).
- **Client**: submit button disabled while in-flight (existing pattern).
- **Rate limiting**: best-effort per-IP + per-email fixed window using a small
  server-side store (Deno KV if available in the Edge runtime, else a tiny
  `public_intake_rate` table written by the RPC). **We will only CLAIM the
  throttling we actually implement and verify** — if reliable per-IP limiting
  isn't available in the runtime, we document it as best-effort and rely on
  honeypot + idempotency + Cloudflare/infra limits, with a clean seam to add
  CAPTCHA (Turnstile/hCaptcha) later.
- **Generic errors** only; **no full request-body logging**; logs carry event +
  timestamp + result + coarse source (no raw PII, no secrets, no JWT).

## 11. Audit / logging behavior

- One `activity_log` row per accepted request, written inside the RPC txn:
  `action='lead.public_intake'`, `entity_type='lead'`, `entity_id=<lead id>`,
  `actor_id=NULL`, `actor_role='public'`, `company_id=<derived>`,
  `summary='Website estimate request received'`,
  `metadata = { source:'website', has_email:bool, has_phone:bool, move_type,
  utm_source, utm_medium, utm_campaign }` — **flags/enums only, no PII values**.
- Edge Function logs: `{event, ts, result, ratelimited?}` — no body, no PII.

## 12. Threat model

| Threat | Mitigation |
|---|---|
| Spam / flooding | Honeypot, payload cap, idempotency, best-effort rate limit, CAPTCHA seam |
| Arbitrary field injection | Strict allowlist; unknown keys dropped; RPC ignores non-mapped fields; client can't set company/status/created_by/pricing |
| Cross-tenant insertion | company_id derived server-side from `business_profile`; client value discarded; no tenant id returned; generic errors |
| Duplicate creation | Server idempotency + client button-disable; no silent merges |
| Information leakage | Minimal `{ok,message}`; no ids/DB text/dup status; no PII in logs |
| Privilege escalation | RPC granted to `service_role` ONLY; anon/authenticated get NOTHING new; RLS/policies untouched |
| Base-table access | anon still has zero grants on customers/leads/etc.; writes only via DEFINER RPC owned by postgres |
| Secret exposure | Service-role key stays in Edge runtime env; never shipped to browser |

## 13. Exact files & migration artifacts proposed (NOT yet created)

1. `supabase/migrations/0028_public_lead_intake.sql` — additive only:
   - `create function public.create_public_lead(p_payload jsonb) ... security definer`
   - `revoke execute ... from public, anon, authenticated;`
     `grant execute ... to service_role;`
   - (optional) `create table public.public_intake_rate (...)` + `public_intake_idempotency (...)`
     if runtime KV is unavailable — service-role-only, RLS-enabled, no client grant.
   - Part A (preflight read-only), Part B (txn), Part C (verify), Part D (rollback).
2. `supabase/functions/public-estimate-intake/index.ts` — new Edge Function.
3. `frontend/src/lib/publicIntake.ts` — typed client `submitEstimate(payload)`.
4. `frontend/src/components/marketing/EstimateForm.tsx` — wire submit to the
   function AFTER approval; **only** swap the frontend-only success for a real
   call; **no visual/layout change**. Keep genuine success/error states (never a
   false success).
- No existing migration/table/policy/function is modified.

## 14. Exact grants & permissions proposed

- `grant execute on function public.create_public_lead(jsonb) to service_role;`
  `revoke execute ... from public, anon, authenticated;`
- Any new helper tables: `revoke all ... from anon, authenticated, public;`
  RLS enabled, no client policy (service-role writes only).
- **No change** to grants/policies on `customers, leads, companies, profiles,
  activity_log`, or any existing function. `anon` gains nothing.

## 15. Rollback plan

- Migration Part D: `drop function if exists public.create_public_lead(jsonb);`
  and drop any new helper tables. Fully removes everything 0028 added; no
  existing object touched, so nothing to restore.
- Edge Function: delete/disable `public-estimate-intake` deployment.
- Frontend: revert `EstimateForm.tsx` to the current frontend-only success.
- Because the change is purely additive, rollback = delete the new artifacts.

## 16. Verification plan (post-approval, with evidence)

Part A (read-only, run FIRST): confirm live nullability of
`customers.created_by`, `leads.created_by` (must be NULL-able for a
user-less insert), the `lead_status` enum labels, and that exactly one
`business_profile` row exists. **If `created_by` is NOT NULL, stop and get an
owner decision** (dedicated system approach) before Part B.

Then verify:
- Valid anonymous POST → creates exactly one customer + one lead (status `new`,
  source `website`) + one audit row; visible in staff Leads pipeline.
- anon still cannot call `create_lead_with_customer` or `create_public_lead`
  directly (403/denied), and cannot read/write base tables.
- Client-sent `company_id`/`status`/`created_by`/`assigned_to` are ignored.
- Cross-tenant creation impossible (only the derived company appears).
- Oversized/invalid/whitespace payloads → generic failure, no rows.
- Honeypot submissions → silent success, no rows.
- Duplicate (same idempotency key / double-click) → single record.
- No orphan records under forced lead-insert failure.
- Response never contains ids/DB detail.
- Existing staff/portal/auth/security tests still pass; `tsc` passes; production
  build passes; homepage appearance + responsive behavior unchanged.

## 17. Owner configuration required

- Approve this design (and the field-mapping into `notes`/addresses).
- Confirm/allow deploying one new Edge Function `public-estimate-intake`.
- Provide/confirm the Supabase **service-role key** is available to the Edge
  runtime (Supabase injects `SUPABASE_SERVICE_ROLE_KEY` by default — confirm).
- Decide the rate-limit posture (Deno KV vs. helper table vs. infra/Cloudflare)
  and whether to add CAPTCHA now or later.
- Run Part A preflight SQL and paste results (confirms `created_by` nullability
  + enum + single business_profile) before Part B.
- Confirm the public `move_type`/`home_size`/`services` allowlist values.

---

### Boundary reminder
Homepage stays visually unchanged. Form remains frontend-only during preflight
and shows **no false "saved" success**. After approval + deploy, we wire the
existing form without any redesign.
