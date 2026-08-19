-- Phase 3 delivery worker. The endpoint accepts no caller-supplied recipient or
-- lifecycle event in process_queue mode; it only sends server-created queued rows.
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname='southern-magnolia-customer-email-worker') then
    perform cron.unschedule('southern-magnolia-customer-email-worker');
  end if;
end $$;

select cron.schedule(
  'southern-magnolia-customer-email-worker',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://yrvgovkkukmtdmgejtxc.supabase.co/functions/v1/customer-email',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"mode":"process_queue"}'::jsonb
    );
  $job$
);
