-- Read-only verification for the production reconciliation gate.

-- 1) Reconciliation migration is recorded.
select version,name
from supabase_migrations.schema_migrations
where name='production_email_reconciliation';

-- 2) Exactly eight V1 email templates exist per company.
select company_id,count(*) as template_count
from public.message_templates
where channel='email'
  and name in ('estimate_received','quote_ready','booking_confirmed','deposit_received','move_reminder','invoice_ready','payment_receipt','review_request')
group by company_id;

-- 3) Six lifecycle trigger groups exist.
select count(distinct trigger_name) as trigger_group_count
from information_schema.triggers
where trigger_schema='public' and trigger_name like 'phase3_email_%';

-- 4) Queue helper is service-only (no anon/authenticated/PUBLIC execute).
select p.proname,coalesce(array_to_string(p.proacl,' | '),'') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='_queue_v1_customer_email';

-- 5) Insecure automatic cron remains absent.
select count(*) as cron_job_count from cron.job;

-- 6) Production operational dataset remains clean after reconciliation.
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
