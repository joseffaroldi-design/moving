-- PR25 READ-ONLY production release preflight. No customer data is modified.
-- Run before migration and retain results in the release report.
select
  current_database() as database_name,
  (select count(*) from information_schema.tables where table_schema='public' and table_name in ('quotes','jobs','leads','customers','quote_approval_tokens')) = 5 as core_tables_exist,
  to_regprocedure('public.create_quote_with_crew(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamp with time zone,jsonb,integer)') is not null as crew_quote_rpc_exists,
  to_regprocedure('public.update_draft_quote_with_crew(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamp with time zone,jsonb,integer)') is not null as crew_edit_rpc_exists,
  to_regprocedure('public.respond_to_quote_approval(text,text)') is not null as approval_rpc_exists,
  to_regprocedure('public.portal_approve_quote(uuid)') is not null as portal_approval_rpc_exists,
  to_regprocedure('public.convert_quote_to_job(uuid,timestamp with time zone,text,text,timestamp with time zone,integer,integer,text)') is not null as legacy_job_conversion_exists,
  exists(select 1 from pg_indexes where schemaname='public' and tablename='jobs' and indexname='jobs_quote_id_unique') as duplicate_job_prevention_exists,
  (select count(*) from public.jobs where quote_id is not null) as existing_quoted_jobs,
  (select count(*) from public.quotes where status::text='accepted') as historically_accepted_quotes,
  (select count(*) from (select quote_id from public.jobs where quote_id is not null group by quote_id having count(*)>1) x) = 0 as no_duplicate_jobs,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='quotes' and column_name in ('service_type','service_date','origin_address','destination_address','access_details','service_notes')) as pr25_quote_columns_already_present,
  exists(select 1 from pg_trigger where tgrelid='public.quotes'::regclass and tgname='zz_auto_job_on_quote_accepted' and tgenabled='O') as pr25_trigger_already_enabled;
-- Verify backups separately in Supabase Dashboard > Database > Backups.
-- STOP if any core/RPC/index/no-duplicate boolean is false, or if unexpected PR25 objects already exist.
