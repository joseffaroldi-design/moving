-- Phase 4 Crew Move-Day 2.0 — read-only post-deploy verification
-- Expected: all checks return PASS/expected values. No writes.

select 'P4-01 issue_category column' as check_name,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='operational_issues' and column_name='issue_category'
       ) then 'PASS' else 'FAIL' end as result;

select 'P4-02 issue photo link table' as check_name,
       case when to_regclass('public.operational_issue_photos') is not null then 'PASS' else 'FAIL' end as result;

select 'P4-03 RLS issue photo links' as check_name,
       case when c.relrowsecurity then 'PASS' else 'FAIL' end as result
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='operational_issue_photos';

select 'P4-04 required RPCs' as check_name,
       count(*) as found,
       case when count(*)=4 then 'PASS' else 'FAIL' end as result
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'crew_move_day_readiness','crew_report_issue','crew_register_job_photo','crew_set_move_day_status'
);

select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'crew_move_day_readiness','crew_report_issue','crew_register_job_photo','crew_set_move_day_status'
)
order by p.proname, args;

select 'P4-05 issue photo SELECT policy' as check_name,
       case when exists (
         select 1 from pg_policies
         where schemaname='public' and tablename='operational_issue_photos'
           and policyname='operational_issue_photos_company_select'
       ) then 'PASS' else 'FAIL' end as result;

select 'P4-06 photo categories function body' as check_name,
       case when pg_get_functiondef(p.oid) like '%existing_condition%'
              and pg_get_functiondef(p.oid) like '%special_item%'
              and pg_get_functiondef(p.oid) like '%completion%'
            then 'PASS' else 'FAIL' end as result
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='crew_register_job_photo'
  and pg_get_function_identity_arguments(p.oid) like '%p_operational_issue_id uuid%';

select 'P4-07 completion guard present' as check_name,
       case when pg_get_functiondef(p.oid) like '%Only the crew lead can complete a move%'
              and pg_get_functiondef(p.oid) like '%crew_move_day_readiness%'
            then 'PASS' else 'FAIL' end as result
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='crew_set_move_day_status';

select 'P4-08 no cross-company issue-photo reads' as check_name,
       case when exists (
         select 1 from pg_policies
         where schemaname='public' and tablename='operational_issue_photos'
           and qual like '%is_company_member%'
       ) then 'PASS' else 'FAIL' end as result;

-- Operational snapshot; informational only.
select
  (select count(*) from public.crew_time_entries where clock_out_at is null) as active_clock_ins,
  (select count(*) from public.operational_issues where is_resolved=false) as open_operational_issues,
  (select count(*) from public.job_photos) as job_photos,
  (select count(*) from public.job_checklists where not is_completed) as incomplete_checklist_items;
