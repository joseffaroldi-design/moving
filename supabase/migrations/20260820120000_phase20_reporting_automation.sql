-- Phase 20 — lean V1 reporting + targeted follow-up templates
-- Keeps reporting company-scoped and derives tenant/role from auth.uid().

create or replace function public.staff_report_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_leads bigint := 0;
  v_quoted_leads bigint := 0;
  v_quotes_sent bigint := 0;
  v_quotes_decided bigint := 0;
  v_quotes_won bigint := 0;
  v_jobs_from_quotes bigint := 0;
  v_upcoming_jobs bigint := 0;
  v_dispatched_upcoming bigint := 0;
  v_open_pipeline numeric := 0;
  v_avg_quote numeric := 0;
  v_collected numeric := 0;
  v_unpaid_count bigint := 0;
  v_unpaid_balance numeric := 0;
  v_labor_hours numeric := 0;
  v_completed_billed numeric := 0;
  v_completed_expenses numeric := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select p.company_id, p.role::text
    into v_company, v_role
    from public.profiles p
   where p.id = v_uid and p.is_active is true;

  if v_company is null or v_role not in ('owner','operations_manager','dispatcher','sales') then
    raise exception 'Active staff access required';
  end if;

  select count(*) into v_leads
    from public.leads where company_id = v_company;

  select count(distinct lead_id) into v_quoted_leads
    from public.quotes
   where company_id = v_company and lead_id is not null and status::text <> 'draft';

  select
    count(*) filter (where status::text <> 'draft'),
    count(*) filter (where status::text in ('accepted','converted','rejected','expired','cancelled')),
    count(*) filter (where status::text in ('accepted','converted')),
    coalesce(sum(total) filter (where status::text in ('sent','viewed')),0),
    coalesce(avg(total) filter (where status::text <> 'draft'),0)
    into v_quotes_sent, v_quotes_decided, v_quotes_won, v_open_pipeline, v_avg_quote
    from public.quotes
   where company_id = v_company;

  select count(distinct quote_id) into v_jobs_from_quotes
    from public.jobs
   where company_id = v_company and quote_id is not null;

  select count(*) into v_upcoming_jobs
    from public.jobs
   where company_id = v_company
     and status::text in ('scheduled','confirmed','in_progress')
     and scheduled_start >= now();

  select count(distinct da.job_id) into v_dispatched_upcoming
    from public.dispatch_assignments da
    join public.jobs j on j.id = da.job_id and j.company_id = da.company_id
   where da.company_id = v_company
     and j.status::text in ('scheduled','confirmed','in_progress')
     and j.scheduled_start >= now();

  select coalesce(sum(amount),0) into v_collected
    from public.invoice_payments
   where company_id = v_company;

  select
    count(*) filter (where balance > 0 and status::text in ('sent','partially_paid','overdue')),
    coalesce(sum(balance) filter (where balance > 0 and status::text in ('sent','partially_paid','overdue')),0)
    into v_unpaid_count, v_unpaid_balance
    from public.invoices
   where company_id = v_company;

  select coalesce(sum(
    greatest(0, extract(epoch from (clock_out_at - clock_in_at))/3600.0 - coalesce(break_minutes,0)/60.0)
  ),0)
    into v_labor_hours
    from public.crew_time_entries
   where company_id = v_company and clock_out_at is not null;

  select coalesce(sum(i.total),0) into v_completed_billed
    from public.invoices i
    join public.jobs j on j.id = i.job_id and j.company_id = i.company_id
   where i.company_id = v_company
     and j.status::text = 'completed'
     and i.status::text <> 'void';

  select coalesce(sum(e.amount),0) into v_completed_expenses
    from public.job_expenses e
    join public.jobs j on j.id = e.job_id and j.company_id = e.company_id
   where e.company_id = v_company and j.status::text = 'completed';

  return jsonb_build_object(
    'lead_count', v_leads,
    'quoted_lead_count', v_quoted_leads,
    'quotes_sent_count', v_quotes_sent,
    'quotes_decided_count', v_quotes_decided,
    'quotes_won_count', v_quotes_won,
    'jobs_from_quotes_count', v_jobs_from_quotes,
    'upcoming_jobs_count', v_upcoming_jobs,
    'dispatched_upcoming_jobs_count', v_dispatched_upcoming,
    'open_pipeline_value', round(v_open_pipeline,2),
    'average_quote_value', round(v_avg_quote,2),
    'collected_revenue', round(v_collected,2),
    'unpaid_invoice_count', v_unpaid_count,
    'unpaid_invoice_balance', round(v_unpaid_balance,2),
    'labor_hours', round(v_labor_hours,2),
    'completed_job_billed', round(v_completed_billed,2),
    'completed_job_expenses', round(v_completed_expenses,2),
    'basic_job_margin', round(v_completed_billed - v_completed_expenses,2)
  );
end;
$$;

revoke all on function public.staff_report_summary() from public, anon;
grant execute on function public.staff_report_summary() to authenticated;

alter table public.communications
  drop constraint if exists communications_event_type_check;
alter table public.communications
  add constraint communications_event_type_check check (
    event_type is null or event_type = any(array[
      'estimate_received','quote_ready','booking_confirmed','deposit_received',
      'move_reminder','invoice_ready','payment_receipt','review_request',
      'quote_follow_up','deposit_request'
    ]::text[])
  );

insert into public.message_templates (company_id, name, channel, subject, body, is_active)
select c.id,
       'quote_follow_up',
       'email'::public.communication_channel,
       'A quick follow-up on your moving quote',
       'Hi {{first_name}}, just checking in on the moving quote we sent. If you have any questions or would like to move forward, you can review your quote here: {{action_url}}',
       true
from public.companies c
on conflict (company_id, name) do nothing;

insert into public.message_templates (company_id, name, channel, subject, body, is_active)
select c.id,
       'deposit_request',
       'email'::public.communication_channel,
       'Your moving deposit is ready',
       'Hi {{first_name}}, your moving quote has been approved. Please review your account and arrange the required deposit so we can keep your move on track: {{action_url}}',
       true
from public.companies c
on conflict (company_id, name) do nothing;

comment on function public.staff_report_summary() is
  'Lean company-scoped V1 reporting summary for active staff. Basic margin excludes payroll/labor wage cost unless recorded as job expenses.';
