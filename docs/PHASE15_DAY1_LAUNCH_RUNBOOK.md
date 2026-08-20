# Phase 15 — Day-1 Launch Runbook

Production tenant: Southern Magnolia Movers
Timezone: America/Chicago
Canonical site: https://ops-preview-7.emergent.host

## Go / No-Go baseline

Before taking a real customer, confirm:
- Supabase project is healthy.
- Production owner can sign in.
- Company/business profile is Southern Magnolia Movers.
- Tax default is 8.45% and deposit default is 25%.
- Website is https://ops-preview-7.emergent.host so portal links resolve.
- Secure customer-email scheduler is active every 5 minutes.
- No test operational data is present.
- Online card payments remain intentionally disabled; use manual payment recording only.

## Day-1 operating workflow

1. Lead capture
   - Website estimate intake or staff Dashboard → Leads.
   - Confirm customer name, phone/email, move date, origin, destination and notes.

2. Quote
   - Create quote from the lead/customer.
   - Review labor, fees, tax, discount and deposit percentage.
   - Send quote / create approval link.
   - Do not manually convert until the quote is accepted.

3. Booking / job creation
   - Convert an accepted quote to a scheduled job.
   - Confirm scheduled start/end, origin/destination, crew size and truck count.

4. Dispatch
   - Assign dispatch date and, when available, truck and crew lead.
   - The backend blocks overlapping primary truck or crew-lead assignments.

5. Crew mobile
   - Crew members must have active crew_lead or mover profiles and be assigned to the job.
   - Use clock-in/out, checklist, job photos and status updates.
   - If no crew accounts exist yet, owner/staff may operate the job from the staff workflow; crew-mobile features remain unavailable until crew accounts are invited.

6. Move documents
   - Finalize required move-document snapshots before signature.
   - Customer signs through the portal where signature is required.
   - Finalized/signed records are immutable by design.

7. Complete job
   - Progress scheduled → confirmed → in_progress → completed.
   - Completing the job attempts to create a draft invoice automatically.

8. Invoice
   - Review draft invoice and line items.
   - A zero-dollar invoice cannot be sent.
   - Mark/send the invoice only after review.

9. Payment recording
   - Until a real payment provider is integrated, record received payments manually.
   - Payments are accepted only against sent/partially-paid invoices.
   - The backend recomputes paid amount, balance and invoice status.

10. Customer communications
   - Lifecycle events queue email communications server-side.
   - Secure cron processes the customer-email queue every 5 minutes.
   - Failed messages may be retried by authorized staff.

## First real job checklist

- Verify customer contact data before sending quote.
- Verify quote total and 8.45% tax/default 25% deposit where applicable.
- Confirm acceptance before job conversion.
- Confirm schedule and addresses.
- Assign truck/crew only if the resources exist and are correct.
- Finalize/sign required move documents.
- Complete the job only after work is actually complete.
- Review invoice before sending.
- Record only payments actually received.
- Confirm customer communications show sent/failed status as expected.

## Known launch boundaries

- Online card checkout is intentionally deferred.
- Leaked Password Protection is still a Supabase dashboard setting to enable separately.
- pg_net remains installed in public; do not relocate without dependency testing.
- Remaining performance-advisor findings are primarily dormant modules and backup-schema noise.
- Crew mobile requires real crew accounts; do not create placeholder production users.

## Stop / escalate conditions

Stop the workflow and investigate if any of the following occurs:
- Cross-company data is visible.
- A protected route works without authentication.
- Quote/job/invoice status changes skip required states.
- A duplicate or overlapping dispatch assignment is accepted unexpectedly.
- Finalized move documents can be edited or deleted.
- Payment totals or balances differ from the actual received amount.
- Queue processing succeeds without scheduler/service authorization.
- Customer emails repeatedly fail because provider configuration is missing.

## Launch-state principle

Do not seed fake production customers, crew, jobs, invoices or payments. The first persistent operational rows should represent real Southern Magnolia Movers activity.
