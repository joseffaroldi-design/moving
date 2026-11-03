# Outside workflow review — 2026-11-03

Scope: read-only review of the canonical `main` source, live MoveOps database and deployed Edge Functions, plus Resend sending-domain status. No production customer rows or settings were changed. This is not a successful authenticated end-to-end browser acceptance run.

## Simulated move

1. **Lead:** Website or office captures contact and move details. Public intake permits phone-only leads, so an email must not be invented or treated as universally required.
2. **Quote:** Staff prepares and sends an itemized estimate. Customer can accept via approval token; portal approval requires a linked customer login.
3. **Booking:** Staff converts an accepted quote into a job, checks schedule/addresses, then separately assigns dispatch resources. Acceptance alone does not assign a truck or crew.
4. **Move day:** An active assigned crew account uses time clock, checklist, status, and photos. Required agreement/valuation/completion documents must be finalized and signed according to the job's configuration.
5. **Billing:** Staff reviews the draft invoice, sends it, and records only money actually received. The portal displays balance and history and instructs the customer to contact the office for payment. Online checkout is not offered in the V1 portal.
6. **Communications:** The five-minute scheduler queues and attempts lifecycle email. Delivery depends on a customer email address, an active template, verified sender, and configured provider credentials. A successful cron run is not proof of delivery.

## Observed production snapshot

- Supabase MoveOps project: ACTIVE_HEALTHY.
- 1 company, 2 profiles (owner and mover), 10 customers, 7 leads, 11 quotes, 3 jobs, 1 dispatch assignment, 1 paid invoice, 1 recorded payment.
- No customer has `auth_user_id` linked. Self-activation is coded for portal login, but no successful live linked-customer session was observed.
- Crew: 1 time entry, 8 checklist rows, 0 job photos. Move documents and signatures: 0 rows each. These counts do not prove that existing jobs required documents.
- Customer email: 32 communication rows, all failed. 16 have "Customer email missing"; 16 have "Email provider configuration missing". Seven of ten customer records have no email. The cron job is active on a five-minute schedule and its recent runs succeeded; sending still failed.
- Resend sending domain `southernmagnoliamovers.com` is in failed verification state. DKIM TXT and the `send` subdomain MX/TXT are each marked failed. An API key named for this project exists in Resend, but the deployed Edge Function's error shows that its own `RESEND_API_KEY` or sender configuration is missing. This review did not inspect or expose a key value.
- The deployed `customer-email` function checks `RESEND_API_KEY` and `CUSTOMER_EMAIL_FROM` (falling back to business profile email), and the existing failed records should only be retried after the provider and recipient issues are fixed.

## Release gates, in order

1. Publish the exact DNS records currently shown in the Resend domain settings at the authoritative DNS host; verify the domain reaches `verified`. Do not substitute the parade domain as sender.
2. Set a project-specific `RESEND_API_KEY` and verified `CUSTOMER_EMAIL_FROM` in **Supabase Edge Function secrets**. Configure Supabase Auth SMTP separately for invitations and sign-in email. Never commit a key to GitHub or this document.
3. For phone-only customers, use an explicit staff call/text handoff. For email-capable customers, verify the address before a quote or invoice notification. Do not automatically fill missing addresses or retry all 32 failures indiscriminately.
4. Send a controlled notification to a consenting test/customer address, verify the provider response and the application's `sent` record, then retry only relevant failed rows after reviewing content, recipient and timing. A `sent` API response does not yet prove inbox delivery.
5. Run one genuine portal activation and the full quote, job, invoice viewing path using the matching verified customer email. Verify the customer cannot see another customer's data or staff-only notes.
6. Run the assigned crew flow with an active crew account; test document readiness and signature gates using a job configured for them.
7. Record screenshots and PASS/FAIL in `docs/FINAL_OWNER_ACCEPTANCE.md`. Keep unobserved cases NOT RUN.

## Source of truth and limits

- `docs/PHASE15_DAY1_LAUNCH_RUNBOOK.md` describes the operating sequence.
- `frontend/src/app/portal/payments/page.tsx` shows the manual-payment customer path.
- `frontend/src/app/auth/callback/route.ts` and `frontend/src/app/portal/login/page.tsx` call customer self-activation.
- `supabase/functions/customer-email/index.ts` contains the provider and retry logic.
- Database row counts may include historical/test records; this review did not infer their business legitimacy.
- No live authenticated UI, email delivery, legal document wording, or payment-processor transaction was verified here.
