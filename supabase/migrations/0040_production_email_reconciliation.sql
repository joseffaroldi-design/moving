-- Reconcile canonical source with the live production customer-email state.
-- Idempotent against the existing MoveOps schema. Intentionally DOES NOT create
-- a cron job; automatic queue processing stays disabled until a secret-backed
-- scheduler is configured.

begin;

alter table public.communications add column if not exists event_type text;
alter table public.communications add column if not exists idempotency_key text;
alter table public.communications add column if not exists template_id uuid;
alter table public.communications add column if not exists related_object_type text;
alter table public.communications add column if not exists related_object_id uuid;
alter table public.communications add column if not exists error_message text;
alter table public.communications add column if not exists retry_count integer not null default 0;
alter table public.communications add column if not exists last_attempt_at timestamptz;
alter table public.communications add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists communications_company_idempotency_uidx
  on public.communications(company_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists communications_company_job_idx
  on public.communications(company_id,job_id,created_at desc);
create index if not exists communications_company_status_created_idx
  on public.communications(company_id,status,created_at desc);
create index if not exists communications_event_type_idx
  on public.communications(company_id,event_type,created_at desc);

-- Preserve the production event vocabulary.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='communications_event_type_check' and conrelid='public.communications'::regclass) then
    alter table public.communications add constraint communications_event_type_check
      check (event_type is null or event_type = any(array[
        'estimate_received','quote_ready','booking_confirmed','deposit_received',
        'move_reminder','invoice_ready','payment_receipt','review_request'
      ]));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='communications_template_id_fkey' and conrelid='public.communications'::regclass) then
    alter table public.communications add constraint communications_template_id_fkey
      foreign key(template_id) references public.message_templates(id) on delete set null;
  end if;
end $$;

create or replace function public._queue_v1_customer_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_company uuid; v_customer uuid; v_event text; v_key text; v_meta jsonb:='{}'::jsonb;
  v_related text; v_related_id uuid; v_lead uuid; v_quote uuid; v_job uuid;
begin
  if tg_table_name='leads' and tg_op='INSERT' then
    v_event:='estimate_received'; v_company:=(n->>'company_id')::uuid; v_customer:=(n->>'customer_id')::uuid;
    v_lead:=(n->>'id')::uuid; v_related:='lead'; v_related_id:=(n->>'id')::uuid; v_key:='estimate_received:'||(n->>'id');
  elsif tg_table_name='quotes' and n->>'status'='sent' and (tg_op='INSERT' or o->>'status' is distinct from n->>'status') then
    v_event:='quote_ready'; v_company:=(n->>'company_id')::uuid; v_customer:=(n->>'customer_id')::uuid;
    v_lead:=nullif(n->>'lead_id','')::uuid; v_quote:=(n->>'id')::uuid; v_related:='quote'; v_related_id:=v_quote; v_key:='quote_ready:'||(n->>'id');
  elsif tg_table_name='quotes' and n->>'status'='accepted' and (tg_op='INSERT' or o->>'status' is distinct from n->>'status') then
    v_event:='booking_confirmed'; v_company:=(n->>'company_id')::uuid; v_customer:=(n->>'customer_id')::uuid;
    v_lead:=nullif(n->>'lead_id','')::uuid; v_quote:=(n->>'id')::uuid; v_related:='quote'; v_related_id:=v_quote; v_key:='booking_confirmed:'||(n->>'id');
  elsif tg_table_name='customer_deposits' and n->>'paid_at' is not null and (tg_op='INSERT' or o->>'paid_at' is null) then
    v_event:='deposit_received'; v_company:=(n->>'company_id')::uuid; v_customer:=nullif(n->>'customer_id','')::uuid;
    v_quote:=nullif(n->>'quote_id','')::uuid; v_job:=nullif(n->>'job_id','')::uuid; v_related:='deposit'; v_related_id:=(n->>'id')::uuid;
    v_key:='deposit_received:'||(n->>'id'); v_meta:=jsonb_build_object('amount',n->>'amount');
  elsif tg_table_name='invoices' and n->>'status'='sent' and (tg_op='INSERT' or o->>'status' is distinct from n->>'status') then
    v_event:='invoice_ready'; v_company:=(n->>'company_id')::uuid; v_customer:=nullif(n->>'customer_id','')::uuid;
    v_quote:=nullif(n->>'quote_id','')::uuid; v_job:=nullif(n->>'job_id','')::uuid; v_related:='invoice'; v_related_id:=(n->>'id')::uuid;
    v_key:='invoice_ready:'||(n->>'id'); v_meta:=jsonb_build_object('amount',n->>'balance','invoice_number',n->>'invoice_number');
  elsif tg_table_name='invoice_payments' and tg_op='INSERT' then
    select i.customer_id,i.quote_id,i.job_id into v_customer,v_quote,v_job from public.invoices i where i.id=(n->>'invoice_id')::uuid;
    v_event:='payment_receipt'; v_company:=(n->>'company_id')::uuid; v_related:='payment'; v_related_id:=(n->>'id')::uuid;
    v_key:='payment_receipt:'||(n->>'id'); v_meta:=jsonb_build_object('amount',n->>'amount');
  elsif tg_table_name='jobs' and n->>'status'='completed' and (tg_op='INSERT' or o->>'status' is distinct from n->>'status') then
    v_event:='review_request'; v_company:=(n->>'company_id')::uuid; v_customer:=nullif(n->>'customer_id','')::uuid;
    v_quote:=nullif(n->>'quote_id','')::uuid; v_job:=(n->>'id')::uuid; v_related:='job'; v_related_id:=v_job; v_key:='review_request:'||(n->>'id');
  else return new; end if;
  if v_customer is null then return new; end if;
  insert into public.communications(company_id,customer_id,lead_id,quote_id,job_id,channel,direction,provider,status,event_type,idempotency_key,related_object_type,related_object_id,metadata)
  values(v_company,v_customer,v_lead,v_quote,v_job,'email'::communication_channel,'outbound'::communication_direction,'resend','queued',v_event,v_key,v_related,v_related_id,v_meta)
  on conflict do nothing;
  return new;
end $$;
revoke all on function public._queue_v1_customer_email() from public,anon,authenticated;
grant execute on function public._queue_v1_customer_email() to service_role;

drop trigger if exists phase3_email_lead on public.leads;
create trigger phase3_email_lead after insert on public.leads for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_quote on public.quotes;
create trigger phase3_email_quote after insert or update on public.quotes for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_deposit on public.customer_deposits;
create trigger phase3_email_deposit after insert or update on public.customer_deposits for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_invoice on public.invoices;
create trigger phase3_email_invoice after insert or update on public.invoices for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_payment on public.invoice_payments;
create trigger phase3_email_payment after insert on public.invoice_payments for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_job on public.jobs;
create trigger phase3_email_job after insert or update on public.jobs for each row execute function public._queue_v1_customer_email();

insert into public.message_templates(company_id,name,channel,subject,body,is_active)
select c.id,v.name,'email'::communication_channel,v.subject,v.body,true from public.companies c cross join (values
 ('estimate_received','We received your moving request','Hi {{first_name}},\n\nWe received your moving request. Southern Magnolia Moving will review the details and contact you with next steps.\n\nThank you,\nSouthern Magnolia Moving'),
 ('quote_ready','Your Southern Magnolia Moving quote is ready','Hi {{first_name}},\n\nYour moving quote is ready. Please sign in to your customer portal to review it.\n\n{{action_url}}'),
 ('booking_confirmed','Your move is booked','Hi {{first_name}},\n\nYour quote has been accepted and your move is booked.\n\nMove date: {{move_date}}\n\nSouthern Magnolia Moving'),
 ('deposit_received','Deposit received','Hi {{first_name}},\n\nWe received your deposit of {{amount}}. Thank you.\n\nSouthern Magnolia Moving'),
 ('move_reminder','Reminder: your move is coming up','Hi {{first_name}},\n\nThis is a reminder that your Southern Magnolia move is scheduled for {{move_date}}.'),
 ('invoice_ready','Your invoice is ready','Hi {{first_name}},\n\nYour invoice is ready.\nInvoice: {{invoice_number}}\nBalance: {{amount}}'),
 ('payment_receipt','Payment received — thank you','Hi {{first_name}},\n\nWe received your payment of {{amount}}. Thank you for choosing Southern Magnolia Moving.'),
 ('review_request','How did we do?','Hi {{first_name}},\n\nThank you for choosing Southern Magnolia Moving. We would appreciate your feedback.\n\n{{action_url}}')
) as v(name,subject,body)
on conflict(company_id,name) do update set channel=excluded.channel,subject=excluded.subject,body=excluded.body,is_active=true,updated_at=now();

commit;

-- SECURITY INVARIANT: no pg_cron job is created here. Queue processing must be
-- invoked with service authorization by a separately configured secure scheduler.
