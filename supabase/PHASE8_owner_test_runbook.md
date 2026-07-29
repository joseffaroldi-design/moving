# Phase 8 — Owner Test Runbook (Checkpoint 4)

Preview only. Do NOT deploy. Sign in at the preview URL as each role. Record PASS/FAIL
and paste evidence back. UI role-gating is a usability aid; the DATABASE is the authority —
several tests confirm the DB blocks an action even if the UI were bypassed.

Preview: https://magnolia-movers-rc1.preview.emergentagent.com
Mutator roles (create/edit/send/pay/void) = owner, operations_manager, sales.
Read-only staff = dispatcher. Customers/inactive/unauthenticated = no access.

Prerequisite data: at least one COMPLETED job without an invoice (to generate one). If none,
complete a job first (Jobs → open a job → progress to Completed).

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
A6. Send — On a DRAFT with total > 0 → "Mark as sent" → status becomes SENT, "Issued" date set.
    PASS. (A zero-total invoice should refuse to send — see A11.)
A7. Record partial payment — On a SENT invoice → "Record payment" → amount LESS than balance →
    status becomes PARTIALLY PAID; balance reduces by the amount; payment appears in history. PASS.
A8. Record final payment — Record the remaining balance → status becomes PAID; balance = $0.00. PASS.
A9. Overdue display — On a SENT/PARTIALLY PAID invoice, set a due date in the past (edit while draft,
    or use one already past) → list + detail show the red "Overdue" badge; dashboard "Overdue" count
    includes it. PASS. (Overdue is derived, not a stored status.)
A10. Void — On a non-paid invoice → "Void" → confirm → status VOID; actions disabled. PASS.
     On a PAID invoice, confirm there is NO Void button. PASS.
A11. Print/PDF — Invoice detail → "Print / PDF" opens /print/invoice/<id> branded document; browser
     Print → Save as PDF works; shows line items, subtotal, tax, total, amount paid, balance,
     payment history. PASS.
A12. Dashboard summary — Dashboard shows "Outstanding Invoices" card with Outstanding $, Unpaid count,
     Overdue count, all reflecting your company's real invoices. PASS.

## B. INPUT GUARDS (as OWNER) — UI blocks, DB also enforces
B1. Payment amount 0 or negative → submit disabled / rejected with a clear message. PASS.
B2. Payment amount non-numeric → rejected. PASS.
B3. Payment amount GREATER than remaining balance → rejected with "cannot exceed remaining balance".
    PASS.
B4. Duplicate submit — click "Record payment" / "Mark as sent" rapidly → button disables while
    pending; exactly ONE payment / one send occurs (check payment history count). PASS.
B5. Editing a NON-draft invoice — confirm "Edit draft" is not offered once SENT/paid. PASS.

## C. ROLE AUTHORIZATION
C1. OPERATIONS MANAGER — sign in; can see Invoices nav, create/edit/send/pay/void. PASS.
C2. SALES — sign in; can see Invoices nav and perform mutations (create/edit/send/pay/void). PASS.
C3. DISPATCHER — sign in; can OPEN Invoices (read-only). Detail shows the read-only note and NO
    Edit/Send/Pay/Void buttons. Confirm a direct write is impossible: in the browser console run
    `await window.__sb?.rpc` is not available — instead verify via the UI that no mutation controls
    render. (DB also blocks: dispatcher is not an invoice mutator.) PASS.
C4. UNAUTHORIZED STAFF (any non-mutator, e.g. a role without invoice mutate) — mutation controls
    hidden; if a mutation RPC were called it returns "Insufficient privileges for invoice operations".
    PASS.
C5. CUSTOMER — sign in as a customer account → cannot reach /dashboard/invoices (redirected;
    customers are not staff). PASS.
C6. INACTIVE user — sign in with an inactive staff account → dashboard/invoice reads fail / no access
    (RLS + is_active). PASS.
C7. UNAUTHENTICATED — open /dashboard/invoices and /dashboard/invoices/<id> logged out → 307 redirect
    to /login. Open /print/invoice/<id> logged out → "Invoice not available". PASS.

## D. COMPANY ISOLATION
D1. Note an invoice id + number while signed in as Company #1 owner.
D2. Sign in as a Company #2 staff user → Invoices list shows ONLY company #2 invoices (none of
    company #1's). PASS.
D3. As company #2, open company #1's invoice id directly: /dashboard/invoices/<company1_invoice_id>
    → "not found / no access" (RLS blocks the read). PASS.
D4. As company #2, /print/invoice/<company1_invoice_id> → "Invoice not available". PASS.

## E. DB INVARIANTS (owner, Supabase SQL editor OR via the UI above)
E1. One invoice per job — attempting a second invoice for a job errors at the DB (partial unique
    index invoices_job_id_unique) and the RPC returns the existing invoice (created=false). Confirmed
    by A2/A3 in the UI.
E2. Duplicate-payment / status guard — record_invoice_payment on a DRAFT, PAID, or VOID invoice is
    rejected ("Payments can only be recorded on a sent invoice"). Try via A-flows.
E3. Non-fan-out dashboard — the dashboard Outstanding total equals the sum of balances on your
    sent/partially_paid invoices (no inflation). Cross-check against the Invoices list balances.

Return: a PASS/FAIL line per item (A1–E3), plus any error text shown. Do NOT paste tokens/passwords.
