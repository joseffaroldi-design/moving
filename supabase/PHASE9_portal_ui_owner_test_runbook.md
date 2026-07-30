# Phase 9 — Customer Portal UI · Owner Manual Test Runbook

The automated boundary is **no stored credentials**: the agent verified TypeScript,
production build, unauthenticated route redirects, print-page graceful states, and
pure-logic fixture tests. The **authenticated customer flows below require a live
`test-customer@example.com` session** and must be run by the owner.

Prereq: migration `0026` applied and `test-customer@example.com` linked to a customer
row (Part D). Sign in at `/login` as that customer → you should land on `/portal`.

## 1. Overview (`/portal`)
- [ ] Loads without error; nav shows Overview, Quotes, My Move, Payments, Profile, Documents.
- [ ] With NO data: three stat cards render (Outstanding $0.00 / Quotes to review 0 / Next move —)
      and the "Nothing here just yet" empty state shows.
- [ ] After staff sends this customer a quote/job/invoice: stat cards + recent lists populate;
      "Outstanding balance" equals the sum of unpaid (non paid/void/draft) invoice balances.

## 2. Quotes (`/portal/quotes`)
- [ ] Empty state shows when no non-draft quotes exist.
- [ ] List shows sent/viewed/accepted/etc. quotes (NOT drafts). Row click opens detail drawer.
- [ ] Detail drawer shows itemized estimate, line items, total, deposit.
- [ ] For a `sent`/`viewed`, non-expired quote: "Approve quote" button appears → confirm →
      status flips to Approved, toast success, list + drawer refresh.
- [ ] Approving an expired-by-date quote shows the "expired" info toast and status becomes Expired
      (persisted — reload confirms).
- [ ] "Print / PDF" opens `/print/portal/quote/<id>` in a new tab with the branded quote and the
      browser print dialog works.

## 3. My Move (`/portal/jobs`)
- [ ] Empty state when no jobs. Otherwise cards show job #, schedule, route, status.
- [ ] Detail drawer shows the 4-stage progress (Scheduled→Confirmed→In Progress→Completed),
      schedule, and route. A cancelled job shows the cancelled banner.
- [ ] Confirm NO dispatch notes / crew / truck counts are shown (RPC omits them).

## 4. Payments (`/portal/payments`)
- [ ] Empty state when no non-draft invoices.
- [ ] Outstanding banner appears when there is a positive outstanding balance.
- [ ] List shows invoice #, issued, due, balance, status; a past-due unpaid invoice shows
      "Overdue" (derived, not a stored status).
- [ ] Detail drawer shows charges, totals, balance, and payment history. "Print / PDF" opens
      `/print/portal/invoice/<id>`.
- [ ] View-only: no online-payment control; "Contact us to arrange payment" links to the phone.

## 5. Profile (`/portal/profile`)
- [ ] "Signed in as <email>" card shows the session email.
- [ ] All fields start blank with the "leave blank to keep current value" note.
- [ ] Submitting with all blank → info toast (nothing changed).
- [ ] Submitting an invalid email → error toast.
- [ ] Submitting one or more fields → success toast; verify the customer row updated
      (staff Customers page) — only first/last name, email, phone change.

## 6. Documents (`/portal/documents`)
- [ ] Polished "coming soon" empty state (no table queries).

## 7. Security spot checks (optional)
- [ ] Sign in as a STAFF account and open `/portal` → "This portal is for customers" state
      (portal RPCs raise Not authorized as a customer).
- [ ] Confirm no direct table reads occur (Network tab shows only `rpc/portal_*` calls).
