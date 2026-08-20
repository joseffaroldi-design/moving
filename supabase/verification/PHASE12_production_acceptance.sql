-- Phase 12 production acceptance verification (READ ONLY)
-- Southern Magnolia Movers / MoveOps
-- This script intentionally creates or changes no business data.

-- A. Production baseline counts
select 'companies' as entity, count(*)::int as n from public.companies
union all select 'business_profile', count(*)::int from public.business_profile
union all select 'profiles', count(*)::int from public.profiles
union all select 'customers', count(*)::int from public.customers
union all select 'leads', count(*)::int from public.leads
union all select 'quotes', count(*)::int from public.quotes
union all select 'jobs', count(*)::int from public.jobs
union all select 'dispatch_assignments', count(*)::int from public.dispatch_assignments
union all select 'crew_time_entries', count(*)::int from public.crew_time_entries
union all select 'job_checklists', count(*)::int from public.job_checklists
union all select 'job_photos', count(*)::int from public.job_photos
union all select 'documents', count(*)::int from public.documents
union all select 'document_signatures', count(*)::int from public.document_signatures
union all select 'invoices', count(*)::int from public.invoices
union all select 'invoice_payments', count(*)::int from public.invoice_payments
union all select 'communications', count(*)::int from public.communications
union all select 'activity_log', count(*)::int from public.activity_log
order by entity;

-- B. Critical table RLS / client grants
select c.relname as table_name,
       c.relrowsecurity as rls,
       c.relforcerowsecurity as force_rls,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert') as anon_insert,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'update') as authenticated_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'customers','leads','quotes','jobs','dispatch_assignments','crew_time_entries',
    'job_checklists','job_photos','documents','document_signatures','invoices',
    'invoice_line_items','invoice_payments','communications','activity_log'
  )
order by c.relname;

-- C. Critical RPC presence / execution grants
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       array_to_string(p.proacl, ',') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_lead_with_customer','create_quote_with_items','mark_quote_sent',
    'create_quote_approval_link','respond_to_quote_approval','convert_quote_to_job',
    'assign_job_to_dispatch','set_job_status','set_job_crew','crew_clock_in',
    'crew_clock_out','crew_prepare_checklist','crew_set_checklist_item',
    'staff_finalize_move_document_snapshot','portal_sign_move_document',
    'generate_invoice_for_job','mark_invoice_sent','record_invoice_payment',
    'portal_list_quotes','portal_list_jobs','portal_list_invoices'
  )
order by p.proname;

-- D. Secure email scheduler
select jobid, jobname, schedule, active
from cron.job
where jobname = 'customer_email_process_queue_secure';

select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='customer_email_process_queue_secure')
order by start_time desc
limit 10;

-- E. Email scheduler secrets exist without exposing values
select name
from vault.secrets
where name in ('customer_email_cron_secret','customer_email_project_url')
order by name;

-- F. Queue verifier is not public/client callable
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public'
  and routine_name='verify_customer_email_cron_secret'
order by grantee;

-- G. Customer lifecycle triggers enabled
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema='public'
  and trigger_name like 'phase3_email_%'
order by event_object_table, trigger_name, event_manipulation;
