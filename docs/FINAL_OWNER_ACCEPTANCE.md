# Final Owner Acceptance Test — Full Business Lifecycle

Run once against the live app. Record each row PASS / FAIL / BLOCKED / NOT RUN with a note or screenshot.
Use ONE test customer (ideally the existing linked one). Don't create duplicates.

| # | Route | Role | Action | Expected result | Status | Evidence |
|---|-------|------|--------|-----------------|--------|----------|
| 1 | /login | owner | Sign in | Land on /dashboard | | |
| 2 | /dashboard/leads | owner | New Lead + save | Lead created; success toast | | |
| 3 | /dashboard/customers | owner | Confirm paired customer exists | Customer row present for that lead | | |
| 4 | /dashboard/quotes | owner | New Quote for that customer | Draft quote created; totals preview correct | | |
| 5 | /dashboard/quotes | owner | Send quote | Status → Sent | | |
| 6 | /portal/login → /portal/quotes | customer | Approve quote | Status → Accepted; success toast | | |
| 7 | /dashboard/quotes | owner | Convert quote → job | Job created (job #) | | |
| 8 | /dashboard/dispatch | owner | Confirm job appears / assignable | Job visible in dispatch | | |
| 9 | /dashboard/jobs | owner | Generate invoice | Draft invoice created from job | | |
| 10 | /dashboard/invoices | owner | Send invoice | Status → Sent; balance = total | | |
| 11 | /dashboard/invoices | owner | Record partial payment | Status → Partially paid; balance reduced | | |
| 12 | /portal/payments | customer | Verify remaining balance | Outstanding = correct balance; payment in history | | |
| 13 | /portal/quotes | customer | Print quote | Branded quote PDF; print works | | |
| 14 | /portal/payments | customer | Print invoice | Branded invoice PDF w/ correct balance | | |
| 15 | /portal | customer | Verify portal | Overview/Quotes/My Move/Payments correct; no internal data | | |
| 16 | /dashboard | restricted staff (e.g. mover/sales) | Attempt an owner-only action | Denied / control not available | | |
| 17 | any | staff | Attempt to view another company's data | No cross-company data returned (RLS tenant isolation) | | |
| 18 | /portal, /dashboard | signed-out | Visit protected route | Redirect: /portal/* → /portal/login; /dashboard,/mobile → /login | | |
| 19 | /portal/login | customer | Sign in with matching verified email | Self-activation links only the correct customer; own quote/job/invoice visible | | |
| 20 | /mobile | assigned crew | Open job; clock in/out, checklist, status, photo | Actions persist; unassigned job is denied | | |
| 21 | job documents / portal | staff + customer | Finalize and sign required documents | Signed version is preserved; required gates enforced | | |
| 22 | customer communications | staff | Check sent/failed queue after controlled send | Verified sender and recipient; correct content; provider accepted; no unexplained failed rows | | |
| 23 | quote/invoice send | staff | Use a phone-only customer | Explicit call/text handoff shown; no claim that email was delivered | | |
| 24 | /workflow, /portal/payments | public + customer | Review payment wording | Describes contact-to-pay flow; no online payment promise or card form | | |

Notes:
- Steps 6/12/13/14/15 use `/portal/login` (customer). Steps 16–17 need a second staff account with a limited role.
- Step 17: create (or use) a staff user in a DIFFERENT company and confirm they never see this company's records.
- Do not mark PASS without observed evidence.

The email provider and sender domain must be configured before attempting step 22. Do not bulk retry historical failures or send test mail to real customers without checking the recipient and message. A successful cron execution alone does not pass step 22.
