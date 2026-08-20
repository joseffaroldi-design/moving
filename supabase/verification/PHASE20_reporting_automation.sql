-- Phase 20 reporting + automation verification (read-only)
-- Expected result: PASS

do $$
begin
  if has_function_privilege('anon','public.staff_report_summary()','EXECUTE') then
    raise exception 'anon must not execute staff_report_summary';
  end if;
  if not has_function_privilege('authenticated','public.staff_report_summary()','EXECUTE') then
    raise exception 'authenticated must execute staff_report_summary';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='staff_report_summary' and p.prosecdef is true
  ) then
    raise exception 'staff_report_summary must be SECURITY DEFINER';
  end if;
  if not exists (
    select 1 from public.message_templates where name='quote_follow_up' and channel::text='email' and is_active is true
  ) then
    raise exception 'quote_follow_up email template missing';
  end if;
  if not exists (
    select 1 from public.message_templates where name='deposit_request' and channel::text='email' and is_active is true
  ) then
    raise exception 'deposit_request email template missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.communications'::regclass
      and conname='communications_event_type_check'
      and pg_get_constraintdef(oid) like '%quote_follow_up%'
      and pg_get_constraintdef(oid) like '%deposit_request%'
  ) then
    raise exception 'communications event constraint missing follow-up event types';
  end if;
  if not exists (
    select 1 from cron.job where jobname='customer_email_process_queue_secure' and active is true
  ) then
    raise exception 'secure customer email queue cron is not active';
  end if;
end $$;

select 'PASS: Phase 20 reporting + targeted automation verification' as result;
