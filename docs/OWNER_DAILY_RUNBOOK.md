# Southern Magnolia Movers — Daily Operations Runbook (Owner Guide)

Plain-English steps using the real screens. Your app opens at your web address.

## 1. Sign in
Go to `/login`, enter your email + password, click **Sign in**. You land on the **Operations** dashboard.

## 2. Create a lead
Left menu → **Leads** → **New Lead**. Enter the person's name, phone/email, move date, and addresses → Save. (A customer record is created automatically alongside the lead.)

## 3. Add a customer
Most customers are created with the lead (step 2). To see/edit them: **Customers** in the left menu.

## 4. Create a quote
**Quotes** → **New Quote** → choose **Existing customer** (or Lead) → pick the person → enter hourly rate, hours, any fees, tax %, deposit % → optionally **Add line item** → check the Total/Deposit preview → **Create Quote**. (It saves as **Draft**.)

## 5. Send a quote
Open the quote → **Send**. Status becomes **Sent** and it appears in that customer's portal.
> The customer is not emailed automatically yet — call/text them or share the portal so they can review it.

## 6. See whether a customer approved it
Open the quote; the status shows **Accepted** once they approve in the portal. (You can also create an **approval link** to send.)

## 7. Convert a quote to a job
Open the accepted quote → **Convert** → fill schedule (start/end), pickup + dropoff addresses, crew size, trucks, dispatch notes → save. A **Job** is created.

## 8. Schedule the move
The start/end you set on convert is the schedule. Adjust in **Jobs** (open the job).

## 9. Assign dispatch resources
**Dispatch** → assign the job to a day/truck/crew as needed.

## 10. Update job status
Open the job → use the status control to move it forward (Scheduled → Confirmed → In Progress → Completed). You cannot skip backward.

## 11. Generate an invoice
Open the job → **Generate invoice**. This creates a **Draft** invoice from the job.

## 12. Send an invoice
Open the invoice → set a due date if asked → **Send**. Status becomes **Sent** and it shows in the customer portal.

## 13. Record a payment
Open the invoice → **Record payment** → enter amount + method → save. Status updates to **Partially paid** or **Paid**, and the balance recalculates.

## 14. See outstanding balances
**Invoices** shows each invoice's balance/status. The dashboard summary shows unpaid totals.

## 15. Use the Customer Portal
Customers sign in at `/portal/login` to view quotes (and approve), track their move, and see invoices/balances. They cannot see your internal notes, crew, or truck info.

## 16. Print quotes and invoices
Open a quote or invoice → **Print / PDF** → your browser's print dialog opens (Save as PDF). Works for both staff and customer views.

## 17. Update company information
**Settings** → **Business Profile** → edit name, phone, email, address, website, tax %, deposit % → **Save**.

## 18. Add or manage staff
No in-app staff manager yet. New staff sign up at `/login`; you (owner) then set their role/company in Supabase. To remove access, deactivate them (`is_active=false`) in Supabase.

## 19. Every morning — check
- Today's **Jobs** / **Dispatch** schedule.
- New **Leads** to follow up.
- Quotes **Sent** awaiting approval.
- **Invoices** overdue / unpaid balances.

## 20. At closing — check
- Jobs completed today are marked **Completed**.
- Invoices generated/sent for completed jobs.
- Payments recorded for money collected.

## 21. When something fails
- Try refresh / sign out and back in.
- **Settings → Run health check** to confirm the backend is reachable.
- If a screen shows an error banner, note the message and contact your builder/Emergent support.

## 22. Never share
- Your password, the Supabase **service-role key**, API keys, JWTs, or database credentials. Staff each use their own login.
