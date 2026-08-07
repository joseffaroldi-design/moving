-- =====================================================================
-- PHASE11A_activity_live_preflight.sql
-- Southern Magnolia Movers — Phase 11A live-state evidence collection
-- READ-ONLY ONLY. A1-A12. No DDL/DML. Safe to rerun.
-- =====================================================================

-- A1. activity_log live shape.
select c.column_name, c.data_type, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema='public' and c.table_name='activity_log'
order by c.ordinal_position;

-- A2. activity_log RLS + grants.
select cl.relrowsecurity as rls_enabled,
       cl.relforcerowsecurity as force_rls,
       has_table_privilege('anon','public.activity_log','SELECT') as anon_select,
       has_table_privilege('anon','public.activity_log','INSERT') as anon_insert,
       has_table_privilege('authenticated','public.activity_log','SELECT') as authenticated_select,
       has_table_privilege('authenticated','public.activity_log','INSERT') as authenticated_insert,
       has_table_privilege('authenticated','public.activity_log','UPDATE') as authenticated_update,
       has_table_privilege('authenticated','public.activity_log','DELETE') as authenticated_delete
from pg_class cl
where cl.oid=to_regclass('public.activity_log');

-- A3. activity_log policies.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='activity_log'
order by policyname;

-- A4. Safe live table inventory / gate for A5-A9.
select x.table_name, to_regclass('public.'||x.table_name) as regclass
from (values
 ('activity_log'),('leads'),('customers'),('quotes'),('jobs'),
 ('invoices'),('invoice_payments'),('job_photos')
) x(table_name)
order by x.table_name;

-- A5. activity_log volume / tenancy / actors / span.
select count(*) as activity_rows,
       count(distinct company_id) as companies,
       count(distinct actor_id) as actors,
       min(created_at) as first_at,
       max(created_at) as last_at
from public.activity_log;

-- A6. Actions actually present.
select action, entity_type, count(*) as rows
from public.activity_log
group by action, entity_type
order by rows desc, action, entity_type;

-- A7. Exact live row counts.
select 'leads' as table_name, count(*) as rows from public.leads
union all select 'customers', count(*) from public.customers
union all select 'quotes', count(*) from public.quotes
union all select 'jobs', count(*) from public.jobs
union all select 'invoices', count(*) from public.invoices
union all select 'invoice_payments', count(*) from public.invoice_payments;

-- A8. Real payment method distribution + totals.
select method, count(*) as payments, sum(amount) as total_amount,
       min(paid_at) as first_paid_at, max(paid_at) as last_paid_at
from public.invoice_payments
group by method
order by payments desc, method;

-- A9a. Quote lifecycle distribution.
select status::text as status, count(*) as rows
from public.quotes group by status order by status;

-- A9b. Job lifecycle distribution.
select status::text as status, count(*) as rows
from public.jobs group by status order by status;

-- A10. job-photos bucket existence/privacy.
select id, name, public
from storage.buckets
where id='job-photos';

-- A11a. job-photos storage object count/uploaders.
select count(*) as object_count,
       count(distinct owner_id) as distinct_uploaders,
       min(created_at) as first_created_at,
       max(created_at) as last_created_at
from storage.objects
where bucket_id='job-photos';

-- A11b. Live job_photos metadata volume (if table exists per A4).
select count(*) as job_photo_rows,
       count(distinct job_id) as distinct_jobs,
       count(distinct taken_by) as distinct_takers,
       min(created_at) as first_created_at,
       max(created_at) as last_created_at
from public.job_photos;

-- A12. Public RPC inventory + security/grants.
select n.nspname as schema_name,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by p.proname, signature;
