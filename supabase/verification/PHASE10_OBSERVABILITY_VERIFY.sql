-- Phase 10 read-only verification: audit coverage, RLS hot-path optimization,
-- production-critical FK indexes, and clean production data.

-- 1) Migration recorded.
select version,name
from supabase_migrations.schema_migrations
where name='phase10_core_observability_hardening';

-- 2) All 21 Phase 10 indexes exist.
select count(*) as phase10_index_count
from pg_indexes
where schemaname='public' and indexname like 'phase10_%';

-- 3) Targeted RLS policies. These should show init-plan-friendly
--    `(SELECT auth.uid())` forms rather than per-row direct auth.uid() calls.
select tablename,policyname,qual,with_check
from pg_policies
where schemaname='public'
  and policyname in (
    'profiles_member_select',
    'profiles_self_update',
    'crew_time_entries_self_insert',
    'crew_time_entries_self_or_manager_update',
    'lead_notes_staff_insert',
    'activity_log_staff_read'
  )
order by tablename,policyname;

-- 4) Canonical activity capture triggers on the V1 workflow.
select event_object_table,trigger_name,action_timing,
       string_agg(event_manipulation,',' order by event_manipulation) as events
from information_schema.triggers
where trigger_schema='public'
  and trigger_name ilike '%activity%'
group by event_object_table,trigger_name,action_timing
order by event_object_table,trigger_name;

-- 5) Central activity writer remains SECURITY DEFINER and is not broadly
--    executable by anon/authenticated users.
select p.proname,p.prosecdef,
       coalesce(array_to_string(p.proacl,' | '),'') as acl
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='_activity_write_forward';

-- 6) Production operational data remains clean after the hardening migration.
select 'customers' entity,count(*) n from public.customers
union all select 'leads',count(*) from public.leads
union all select 'quotes',count(*) from public.quotes
union all select 'jobs',count(*) from public.jobs
union all select 'invoices',count(*) from public.invoices
union all select 'documents',count(*) from public.documents
union all select 'communications',count(*) from public.communications
union all select 'notification_queue',count(*) from public.notification_queue
union all select 'activity_log',count(*) from public.activity_log
order by entity;
