-- Phase 3: centralized customer email engine.
-- Extends existing communications/message_templates; no parallel subsystem.

alter table public.communications
  add column if not exists event_type text,
  add column if not exists idempotency_key text,
  add column if not exists template_id uuid references public.message_templates(id) on delete set null,
  add column if not exists related_object_type text,
  add column if not exists related_object_id uuid,
  add column if not exists error_message text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.communications drop constraint if exists communications_event_type_check;
alter table public.communications add constraint communications_event_type_check check (event_type is null or event_type in (
 'estimate_received','quote_ready','booking_confirmed','deposit_received','move_reminder','invoice_ready','payment_receipt','review_request'));
create unique index if not exists communications_company_idempotency_uidx on public.communications(company_id,idempotency_key) where idempotency_key is not null;
create index if not exists communications_company_status_created_idx on public.communications(company_id,status,created_at desc);
create index if not exists communications_event_type_idx on public.communications(company_id,event_type,created_at desc);

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
) v(name,subject,body)
where not exists(select 1 from public.message_templates mt where mt.company_id=c.id and mt.channel='email'::communication_channel and mt.name=v.name);

create or replace function public._queue_v1_customer_email() returns trigger language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_customer uuid; v_event text; v_key text; v_meta jsonb:='{}'::jsonb; v_related text; v_related_id uuid; v_lead uuid; v_quote uuid; v_job uuid;
begin
 if tg_table_name='leads' and tg_op='INSERT' then v_event:='estimate_received'; v_company:=new.company_id; v_customer:=new.customer_id; v_lead:=new.id; v_related:='lead'; v_related_id:=new.id; v_key:='estimate_received:'||new.id;
 elsif tg_table_name='quotes' and new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then v_event:='quote_ready'; v_company:=new.company_id; v_customer:=new.customer_id; v_lead:=new.lead_id; v_quote:=new.id; v_related:='quote'; v_related_id:=new.id; v_key:='quote_ready:'||new.id;
 elsif tg_table_name='quotes' and new.status='accepted' and (tg_op='INSERT' or old.status is distinct from new.status) then v_event:='booking_confirmed'; v_company:=new.company_id; v_customer:=new.customer_id; v_lead:=new.lead_id; v_quote:=new.id; v_related:='quote'; v_related_id:=new.id; v_key:='booking_confirmed:'||new.id;
 elsif tg_table_name='customer_deposits' and new.paid_at is not null and (tg_op='INSERT' or old.paid_at is null) then v_event:='deposit_received'; v_company:=new.company_id; v_customer:=new.customer_id; v_quote:=new.quote_id; v_job:=new.job_id; v_related:='deposit'; v_related_id:=new.id; v_key:='deposit_received:'||new.id; v_meta:=jsonb_build_object('amount',new.amount);
 elsif tg_table_name='invoices' and new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then v_event:='invoice_ready'; v_company:=new.company_id; v_customer:=new.customer_id; v_quote:=new.quote_id; v_job:=new.job_id; v_related:='invoice'; v_related_id:=new.id; v_key:='invoice_ready:'||new.id; v_meta:=jsonb_build_object('amount',new.balance,'invoice_number',new.invoice_number);
 elsif tg_table_name='invoice_payments' and tg_op='INSERT' then select i.customer_id,i.quote_id,i.job_id into v_customer,v_quote,v_job from public.invoices i where i.id=new.invoice_id; v_event:='payment_receipt'; v_company:=new.company_id; v_related:='payment'; v_related_id:=new.id; v_key:='payment_receipt:'||new.id; v_meta:=jsonb_build_object('amount',new.amount);
 elsif tg_table_name='jobs' and new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then v_event:='review_request'; v_company:=new.company_id; v_customer:=new.customer_id; v_quote:=new.quote_id; v_job:=new.id; v_related:='job'; v_related_id:=new.id; v_key:='review_request:'||new.id;
 else return new; end if;
 if v_customer is null then return new; end if;
 insert into public.communications(company_id,customer_id,lead_id,quote_id,job_id,channel,direction,provider,status,event_type,idempotency_key,related_object_type,related_object_id,metadata)
 values(v_company,v_customer,v_lead,v_quote,v_job,'email'::communication_channel,'outbound'::communication_direction,'resend','queued',v_event,v_key,v_related,v_related_id,v_meta)
 on conflict do nothing;
 return new;
end $$;
revoke all on function public._queue_v1_customer_email() from public,anon,authenticated;

drop trigger if exists phase3_email_lead on public.leads; create trigger phase3_email_lead after insert on public.leads for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_quote on public.quotes; create trigger phase3_email_quote after insert or update of status on public.quotes for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_deposit on public.customer_deposits; create trigger phase3_email_deposit after insert or update of paid_at on public.customer_deposits for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_invoice on public.invoices; create trigger phase3_email_invoice after insert or update of status on public.invoices for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_payment on public.invoice_payments; create trigger phase3_email_payment after insert on public.invoice_payments for each row execute function public._queue_v1_customer_email();
drop trigger if exists phase3_email_job on public.jobs; create trigger phase3_email_job after insert or update of status on public.jobs for each row execute function public._queue_v1_customer_email();

revoke update,delete on public.communications from anon,authenticated;
