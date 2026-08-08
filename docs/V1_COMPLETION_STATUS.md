# Southern Magnolia Movers — V1 Completion Status

**Canonical source:** `joseffaroldi-design/moving` → `main`

This file records what is part of V1 and separates code-complete work from owner/platform activation steps.

## V1 application scope

- Public marketing site and estimate intake
- Staff authentication and role-aware dashboard
- Leads and customers
- Quotes, approvals, conversion to jobs
- Jobs and dispatch
- Customer portal
- Invoices and payment recording
- Crew mobile: assigned jobs, time clock, checklist, photos
- Business profile and brand/policy settings
- Staff invitations, role management, activation/deactivation
- Reporting dashboard
- SEO foundation, service pages, sitemap and robots
- Tenant isolation / RLS / guarded mutation RPCs
- Activity history and move-day activity capture

## Completed in the canonical source

- Reporting is no longer a roadmap placeholder. V1 reporting now exposes pipeline value, quote win rate, average quote, dispatch coverage, funnel conversion, and quote-value metrics from the normalized dashboard data.
- Business Profile settings now expose logo URL, brand colors, quote/invoice terms, cancellation policy, and payment instructions in addition to contact details and tax/deposit defaults.
- Staff Access is available from Settings. Owners/operations managers can invite staff, change allowed roles, and activate/deactivate staff. Owner protections and same-company enforcement remain server-side.
- Migration `0032_staff_management.sql` adds the guarded staff activation RPC and high-value staff lookup indexes. It has been applied to the live Magnolia Movers Supabase project.
- The `staff-invite` Edge Function is present in the canonical repo and deployed live with JWT verification enabled.

## Payments scope for V1

V1 supports invoice creation, invoice sending/status, customer balance/history visibility, and staff-recorded payments (cash, check, credit card, bank transfer, other) through the authoritative invoice payment RPC. Customer-facing online card checkout is **not enabled** until a payment processor account and production credentials are supplied. The existing customer portal intentionally directs customers to contact the business to arrange payment rather than pretending to collect a card.

## External go-live gates

These are not code defects and cannot be safely fabricated in source control:

1. **Hosting deployment:** reconnect the hosting platform's GitHub authorization and deploy the current canonical `main` branch. GitHub itself has write access; the prior 403 was isolated to the hosting platform's GitHub session.
2. **Production SMTP:** configure Supabase Auth SMTP so staff invitations and authentication emails use the business sender reliably.
3. **Auth hardening toggle:** enable Supabase leaked-password protection in Authentication settings.
4. **Backups:** confirm the production Supabase backup/PITR policy appropriate to the selected plan.
5. **Online card checkout (optional for V1):** connect Stripe or another processor before exposing a customer Pay button. Never store card details in this application database.

## Final acceptance

After deployment, run `docs/FINAL_OWNER_ACCEPTANCE.md` against the live URL. Do not mark a row PASS unless the behavior is observed in the deployed build.
