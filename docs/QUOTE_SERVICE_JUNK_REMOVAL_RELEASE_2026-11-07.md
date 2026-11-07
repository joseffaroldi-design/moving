# MoveOps service, PDF, and accepted-job release checkpoint
Date: 2026-11-07

## Scope
- Staff leads: select/edit Moving or Junk Removal.
- Public estimate: Junk Removal is a primary move-type option (previously only an add-on service).
- Quotes: store service type, preferred date, pickup/destination, access constraints, items/instructions; show in staff quote PDF and customer approval.
- Crew pricing: uses the already deployed rate **per worker × crew count × hours** and server-side recalculation.
- Acceptance: on future status transitions to `accepted`, Postgres creates exactly one `confirmed` job with **no fabricated appointment time** and moves quote to `converted`. Crew assignments stay optional.
- Scheduling: staff fills an exact start time, origin, optional junk destination, end, crew size, and truck count before progress/dispatch.

## Release ordering (no production changes from this branch alone)
1. Ensure PR #25 CI passes (frontend lint, TypeScript, build; Edge Function CI).
2. Check a recent Supabase backup is restorable and preserve the current deployed frontend release.
3. Deploy the database migration `supabase/migrations/20261107120000_service_details_auto_job.sql` **only as a coordinated release**. This changes the quote acceptance transaction immediately; deploy the compatible frontend in the same release window.
4. Deploy the updated `public-lead-intake` Edge Function, retaining `verify_jwt=false`, existing allowed-origin and secret settings. Do not deploy from a stale source if its currently deployed code differs materially.
5. Publish the compatible frontend from this PR using the connected hosting/deploy platform and verify the custom domain serves the new build.
6. Do not backfill 2 historically accepted quotes automatically. Existing quote-to-job manual conversion remains available.
7. Verify the checks below; if any fail, roll back frontend and **disable the new acceptance trigger** before attempting to roll back nullable job columns (existing unscheduled jobs may then exist).

## Manual acceptance matrix (do not mark PASS without real evidence)
| Test | Expected |
|---|---|
| New staff Junk Removal lead / reopen edit | Service value persists |
| Website Junk Removal estimate | Accepted by Edge Function and database; correct lead |
| Moving quote, 2 workers × $65 × 4 hours | Labor $520 before fees/tax |
| Junk quote with flat charge | Line item totals correct; no mandatory second address |
| Staff edits quote details | Saved on draft; printed PDF reflects them |
| Quote PDF preferred date | No one-day UTC offset in Louisiana |
| Customer opens approval link | Service details visible; only scoped quote data |
| Approve once | Quote converted, exactly one job, job not yet scheduled |
| Attempt replay/second acceptance | No duplicate job |
| Job scheduling | Real date/time and addresses saved; status scheduled |
| Start unscheduled job | Database blocks the transition |
| Crew assignment omitted | Quote/job process works for a small operator |
| Cross-company access | Quote/job RPCs deny other-company staff |
| Previously accepted quote | Remains unchanged unless staff converts |

## Read-only verification SQL
```sql
select
  (select count(*) from pg_trigger
    where tgname='zz_auto_job_on_quote_accepted' and not tgisinternal) as acceptance_triggers,
  (select count(*) from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and p.proname in
      ('set_draft_quote_details','create_quote_with_service','update_draft_quote_with_service',
       'duplicate_quote_with_service','schedule_confirmed_job')) as required_rpcs,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='quotes' and column_name in
      ('service_type','service_date','origin_address','destination_address',
       'access_details','service_notes')) as quote_detail_columns,
  (select count(*) from
    (select quote_id from public.jobs where quote_id is not null
     group by quote_id having count(*)>1) d) as duplicate_quote_jobs;
```
Expected: acceptance_triggers=1, required_rpcs=5, quote_detail_columns=6, duplicate_quote_jobs=0.

## Rollback caution
An old frontend cannot schedule accepted-but-unscheduled jobs. Do not enable the acceptance trigger without publishing the matching UI. For a fast containment rollback, disable the new trigger first; retain schema changes and stored jobs until reviewed. Never blindly restore a production backup over newer customer records.
