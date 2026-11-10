-- PR25 containment ONLY: pause automatic quote->job creation without deleting records.
-- Run if the new web UI is unavailable or automatic job scheduling is malfunctioning.
-- Do not drop columns, overwrite customers, or delete existing created jobs.
begin;
do $pr25$
begin
  if exists(select 1 from pg_trigger
            where tgname='zz_auto_job_on_quote_accepted'
              and tgrelid='public.quotes'::regclass and not tgisinternal) then
    execute 'alter table public.quotes disable trigger zz_auto_job_on_quote_accepted';
  end if;
end $pr25$;
commit;
-- Verification: select tgname,tgenabled from pg_trigger
-- where tgname='zz_auto_job_on_quote_accepted';
-- Expected tgenabled = 'D'. Customer acceptance will no longer auto-create jobs.
-- Existing converted quotes/jobs must be reconciled individually, not deleted.
