# Phase 8 — Owner Test Runbook (Checkpoint 4)

Preview only. Do NOT deploy. Sign in at the preview URL as each role. Record PASS/FAIL
and paste evidence back. UI role-gating is a usability aid ONLY — several tests below prove
the DATABASE itself enforces authorization even if the UI were bypassed.

Preview: https://magnolia-movers-rc1.preview.emergentagent.com
Supabase REST base: https://yrvgovkkukmtdmgejtxc.supabase.co/rest/v1
Publishable (anon) key: sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb
Mutator roles (create/edit/send/pay/void) = owner, operations_manager, sales.
Read-only staff = dispatcher. Customers / inactive / unauthenticated = no access.

Prerequisite data: at least one COMPLETED job WITHOUT an invoice (to generate one). If none,
complete a job first (Jobs → open a job → progress to Completed).

⚠️ NEVER paste JWTs, access tokens, or passwords into chat. Tokens are used LOCALLY in the
commands below and then discarded.

---
## 0. TEST ACCOUNT INVENTORY (owner provides; do NOT assume credentials)
Have these accounts ready before starting. Each must belong to the correct company.

| # | Account            | Role / state              | Company    | Used in            |
|---|--------------------|---------------------------|------------|--------------------|
| 1 | owner              | owner                     | Company #1 | A, B, D1, E        |
| 2 | operations_manager | operations_manager        | Company #1 | C1                 |
| 3 | sales              | sales                     | Company #1 | C2                 |
| 4 | dispatcher         | dispatcher (read-only)    | Company #1 | C3                 |
| 5 | unauthorized staff | any non-mutator staff role| Company #1 | C4                 |
| 6 | customer           | customer                  | Company #1 | C5                 |
| 7 | inactive staff     | staff, is_active = false  | Company #1 | C6                 |
| 8 | company #2 staff   | any staff role            | Company #2 | D2–D4              |
|   | (none)             | unauthenticated           | —          | C7                 |

---
## HOW TO OBTAIN A USER'S ACCESS TOKEN LOCALLY (for C3/C4 probes)
The app stores its session in cookies (@supabase/ssr), so read the token from a live request:
1. Sign in AS the test user in a browser.
2. DevTools → Network → click any request to `*.supabase.co/rest/v1/...`.
3. Copy the `Authorization: Bearer <token>` value. That `<token>` is `<ROLE>_ACCESS_TOKEN`.
Use it only in the local command; do not store or paste it into chat.

---
## A. FUNCTIONAL (sign in as OWNER)
A1. Create from job — Invoices → "New invoice" → pick a completed job → invoice detail opens as
    DRAFT with line items seeded from the linked quote (if any). PASS if a draft invoice appears.
A2. Create from Job detail — Jobs → open a COMPLETED job → "Generate invoice". PASS if it opens the
    invoice. Re-open the SAME job → button now reads "View invoice" (NOT "Generate"). PASS if so.
A3. One-invoice-per-job — On a job that already has an invoice, confirm you CANNOT create a second
    (Job detail shows "View invoice"; the New-invoice dialog no longer lists that job). PASS.
A4. Edit draft — On a DRAFT invoice → "Edit draft" → add/remove line items, set tax rate + due date
    + notes → Save. PASS if totals recompute (subtotal, tax, total, balance) and match the lines.
A5. Totals authority — Note the preview total in the editor, save, and confirm the DETAIL page total
    equals the server-computed value (subtotal + subtotal*tax_rate/100, rounded). PASS if equal.
A6. Send (positive total) — On a DRAFT with total > 0 → "Mark as sent" → status becomes SENT and the
    "Issued" date is set. PASS.
A7. Zero-total send guard — Create or edit a DRAFT invoice so its total is exactly $0.00 (e.g. remove
    all line items, or set every unit price/quantity to 0) → attempt "Mark as sent".
    - Expected: the action is REJECTED and the invoice REMAINS in DRAFT.
    - Expected error (from deployed RPC mark_invoice_sent): "Cannot send an invoice with a zero total"
    - PASS: send is refused AND status stays draft AND the exact error above is shown.
    - FAIL: invoice becomes SENT, or any other/no error. Record the exact error text shown.
A8. Record partial payment — On a SENT invoice → "Record payment" → amount LESS than balance →
    status becomes PARTIALLY PAID; balance reduces by the amount; payment appears in history. PASS.
A9. Record final payment — Record the remaining balance → status becomes PAID; balance = $0.00. PASS.
A10. Overdue display — On a SENT/PARTIALLY PAID invoice with a due date in the past → list + detail
     show the red "Overdue" badge; dashboard "Overdue" count includes it. PASS.
     (Overdue is a DERIVED display state, never a stored status.)
A11. Void — On a non-paid invoice → "Void" → confirm → status VOID; actions disabled. PASS.
     On a PAID invoice, confirm there is NO Void button (DB also rejects: "Cannot void a paid invoice").
A12. Print/PDF — Invoice detail → "Print / PDF" opens /print/invoice/<id> branded document; browser
     Print → Save as PDF works; shows line items, subtotal, tax, total, amount paid, balance,
     payment history. PASS.
A13. Dashboard summary — Dashboard shows "Outstanding Invoices" card with Outstanding $, Unpaid count,
     Overdue count, all reflecting your company's real invoices. PASS.

## B. INPUT GUARDS (as OWNER) — UI blocks, DB also enforces
B1. Payment amount 0 or negative → submit disabled / rejected with a clear message.
    (DB also rejects: "Payment amount must be greater than zero".) PASS.
B2. Payment amount non-numeric → rejected. PASS.
B3. Payment amount GREATER than remaining balance → rejected with "cannot exceed the remaining
    balance". PASS.
B4. Duplicate submit — click "Record payment" / "Mark as sent" rapidly → button disables while
    pending; exactly ONE payment / one send occurs (check payment history count). PASS.
B5. Editing a NON-draft invoice — "Edit draft" is not offered once SENT/paid (DB also rejects:
    "Only draft invoices can be edited (current status: <status>)"). PASS.

## C. ROLE AUTHORIZATION
C1. OPERATIONS MANAGER — sign in; can see Invoices nav, create/edit/send/pay/void. PASS.
C2. SALES — sign in; can see Invoices nav and perform mutations (create/edit/send/pay/void). PASS.

C3. DISPATCHER — DATABASE-level denial probe (UI hiding is NOT sufficient evidence).
    First, in the UI: sign in as dispatcher → can OPEN Invoices (read-only), sees the read-only note,
    and NO Edit/Send/Pay/Void buttons.
    Then prove the DB denies a mutation even when the RPC is called directly with the dispatcher's
    OWN valid JWT (the RPC is granted to `authenticated`, so it executes and the DB guard rejects it):

    Obtain <DISPATCHER_ACCESS_TOKEN> per "HOW TO OBTAIN A USER'S ACCESS TOKEN LOCALLY".
    Pick any invoice id from Company #1 as <INVOICE_ID> (mark_invoice_sent has no side effect when
    authorization fails — it raises before touching any row).

    curl (run locally):
    ```
    curl -s -o /tmp/probe.json -w "HTTP %{http_code}\n" \
      -X POST "https://yrvgovkkukmtdmgejtxc.supabase.co/rest/v1/rpc/mark_invoice_sent" \
      -H "apikey: sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb" \
      -H "Authorization: Bearer <DISPATCHER_ACCESS_TOKEN>" \
      -H "Content-Type: application/json" \
      -d '{"p_invoice_id":"<INVOICE_ID>"}'
    cat /tmp/probe.json
    ```
    Browser-console alternative (while signed in as dispatcher):
    ```
    const r = await fetch("https://yrvgovkkukmtdmgejtxc.supabase.co/rest/v1/rpc/mark_invoice_sent", {
      method: "POST",
      headers: {
        "apikey": "sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb",
        "Authorization": "Bearer <DISPATCHER_ACCESS_TOKEN>",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_invoice_id: "<INVOICE_ID>" })
    });
    console.log("HTTP", r.status, await r.json());
    ```
    - Expected HTTP status: 400
    - Expected error message (exact, deployed): "Insufficient privileges for invoice operations"
      (JSON body: {"code":"P0001","details":null,"hint":null,"message":"Insufficient privileges for
      invoice operations"})
    - PASS criteria: HTTP 400 AND message is EXACTLY the string above.
    - FAIL criteria: HTTP 200, any 2xx, any different message, or the invoice status changes.
    - No-change confirmation (owner, Supabase SQL editor — run BEFORE and AFTER the probe; results
      MUST be identical):
      ```
      select status, updated_at, sent_at from public.invoices where id = '<INVOICE_ID>';
      select count(*) as payments from public.invoice_payments where invoice_id = '<INVOICE_ID>';
      ```
      PASS if status/updated_at/sent_at and the payment count are unchanged.

C4. UNAUTHORIZED STAFF (any non-mutator staff role, e.g. a role that is not owner/operations_manager/
    sales) — repeat the C3 probe using <UNAUTHORIZED_ACCESS_TOKEN>.
    - Expected HTTP 400 with message EXACTLY "Insufficient privileges for invoice operations".
    - Optionally also probe record_invoice_payment to confirm the same denial:
      ```
      curl -s -o /tmp/probe2.json -w "HTTP %{http_code}\n" \
        -X POST "https://yrvgovkkukmtdmgejtxc.supabase.co/rest/v1/rpc/record_invoice_payment" \
        -H "apikey: sb_publishable_000cPYytJDxLqPYZZbz3ow_YWqSIqvb" \
        -H "Authorization: Bearer <UNAUTHORIZED_ACCESS_TOKEN>" \
        -H "Content-Type: application/json" \
        -d '{"p_invoice_id":"<INVOICE_ID>","p_amount":1}'
      cat /tmp/probe2.json
      ```
      Expected HTTP 400, message "Insufficient privileges for invoice operations".
    - PASS: both probes return 400 with the exact message; the no-change SQL check (as in C3) shows
      the invoice row and payment count are unchanged.
    - FAIL: any 2xx, different message, or any row/payment change.

C5. CUSTOMER — sign in as a customer account → cannot reach /dashboard/invoices (redirected;
    customers are not staff). PASS.
C6. INACTIVE user — sign in with an inactive staff account → dashboard/invoice reads fail / no access
    (RLS + is_active). If you also run the C3 probe with this user's token, the DB rejects with
    "Caller account is not active" (HTTP 400). PASS.
C7. UNAUTHENTICATED — open /dashboard/invoices and /dashboard/invoices/<id> logged out → 307 redirect
    to /login. Open /print/invoice/<id> logged out → "Invoice not available". PASS.

## D. COMPANY ISOLATION
D1. Note an invoice id + number while signed in as Company #1 owner.
D2. Sign in as a Company #2 staff user → Invoices list shows ONLY company #2 invoices (none of
    company #1's). PASS.
D3. As company #2, open company #1's invoice id directly: /dashboard/invoices/<company1_invoice_id>
    → "not found / no access" (RLS blocks the read). PASS.
D4. As company #2, /print/invoice/<company1_invoice_id> → "Invoice not available". PASS.

## E. DB INVARIANTS (owner)
E1. One invoice per job — attempting a second invoice for a job cannot create a duplicate: the partial
    unique index invoices_job_id_unique + the idempotent creator return the EXISTING invoice
    (generate_invoice_for_job → created=false). Confirmed by A2/A3 in the UI.
E2. Payment status guard — record_invoice_payment is allowed ONLY when the invoice status is
    'sent' or 'partially_paid'. It is REJECTED for 'draft', 'paid', and 'void'.
    - Exact deployed error: "Payments can only be recorded on a sent invoice (current status: <status>)"
      (e.g. for a draft invoice: "...(current status: draft)").
    - Verify via the UI (the Record-payment action is only offered on sent/partially_paid) and, if
      probing directly, by calling record_invoice_payment against a draft/paid/void invoice with a
      mutator token → HTTP 400 with the message above. PASS if allowed only on sent/partially_paid.
E3. Non-fan-out dashboard — the dashboard Outstanding total equals the sum of balances on your
    sent/partially_paid invoices (no inflation). Cross-check against the Invoices list balances. PASS.

---
Return: a PASS/FAIL line per item (A1–A13, B1–B5, C1–C7, D1–D4, E1–E3), plus the exact error text /
HTTP status for A7, C3, C4, E2. Do NOT paste tokens or passwords.
