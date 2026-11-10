# PR #25 — Coordinated production release (2026-11-09)

## Current status
- **Code:** corrected SQL and quote PDF date handling committed to the PR branch; GitHub CI required green before merging.
- **Production Supabase:** PR25 migration **not** applied as of last read-only check. Existing two accepted quotes must not be automatically backfilled.
- **Production website:** hosted via Emergent; this GitHub/Supabase connection does not operate its deployment controls.
- **Database:** Preview and production share the same database. Do **not** use preview to apply changes and assume production is insulated.
- **Rollback:** keep the original deployment and recent database backup available.

## Required coordinated release order
1. Confirm a restorable **current** Supabase backup. No automated tool in this chat can confirm its backup state. Record timestamp and restore strategy.
2. Check latest GitHub PR #25 head and green Frontend CI + Public Edge Functions CI.
3. Execute read-only `supabase/verification/PR25_release_preflight.sql` against the production project. All core/RPC/index/no-duplicates checks must be true; 0 PR25 quote columns and disabled/absent trigger expected before release.
4. Confirm an authorized Emergent operator can publish the exact PR branch build. Prepare rollback to current published build.
5. Open a coordinated release window. Apply corrected migration `supabase/migrations/20261107120000_service_details_auto_job.sql` with Supabase migrations. This migration includes a trigger that will affect **future acceptance events** as soon as installed.
6. Deploy `supabase/functions/public-lead-intake/index.ts` preserving existing origin settings/secrets and `verify_jwt=false`. Verify live version.
7. Publish the matching frontend branch release through Emergent immediately. Do not leave the old frontend connected to the new database for normal business operation.
8. Run postdeploy schema verification and carefully tagged non-customer acceptance tests (below). Confirm old jobs, quotes, logins and domain unaffected.
9. If the frontend cannot publish promptly, run the **containment** script `supabase/rollback/20261107120000_service_details_auto_job_containment.sql` to disable only the new trigger; do not revert schema or delete jobs blindly.

## Read-only schema verification
```sql
select
 (select count(*) from information_schema.columns
  where table_schema='public' and table_name='quotes' and column_name in
 ('service_type','service_date','origin_address','destination_address','access_details','service_notes')) as quote_fields,
 (select count(*) from pg_trigger where tgrelid='public.quotes'::regclass
  and tgname='zz_auto_job_on_quote_accepted' and tgenabled='O') as enabled_acceptance_triggers,
 (select count(*) from (select quote_id from public.jobs
   where quote_id is not null group by quote_id having count(*)>1) x) as duplicate_quoted_jobs;
```
Expected after deployment: quote_fields=6, enabled_acceptance_triggers=1, duplicate_quoted_jobs=0.

## Acceptance tests — use clearly labeled synthetic TEST PR25 records only
1. Submit public Junk Removal lead, confirm database record and no duplicate on retried idempotency key.
2. Create Junk Removal and Moving estimates; inspect crew hourly rate x members x hours and any flat junk-removal items.
3. Edit draft quote service date, pickup, destination, stairs/elevator/access instructions, and inventory. Confirm staff PDF displays the saved values and does not move the preferred date by one day.
4. Send one test quote and use the customer-facing acceptance link. Verify accurate details and no exposure of staff-only notes.
5. Accept once; confirm quote converted and exactly one unscheduled job created. Retry acceptance; confirm no duplicate job and an appropriate already-decided response.
6. Confirm dashboard unscheduled-jobs alert, schedule exact date/time and addresses, verify scheduled state. Crew assignment remains optional.
7. Confirm staff cannot start an unscheduled job and cross-tenant / anonymous users cannot invoke staff-only RPCs.
8. Confirm customer notification is queued only where an email address exists; use provider logs to validate an actual sent message. Do not claim delivery from the queue alone.
9. Verify existing customer records, two historical accepted quotes, auth, domains and prior jobs remain unchanged.
10. Remove only clearly tagged TEST PR25 records after checking FK and communication dependencies; do not delete production data indiscriminately.

## Preconditions requiring operator confirmation
- Backup exists and is restorable.
- Emergent is ready to publish the matching frontend and can roll back.
- Database migration was validated on disposable PostgreSQL test database, not solely via frontend CI.
- Customer-email sender domain/secret is configured and verified if notifications are in scope.

## Deployment safety
Do not merge solely because GitHub CI is green; it does not execute database migrations on a disposable server or publish Emergent. Never apply the new acceptance trigger without a functional scheduling interface on the live website.
