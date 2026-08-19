-- Phase 3: centralized customer email engine metadata.
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

alter table public.communications
  drop constraint if exists communications_event_type_check;
alter table public.communications
  add constraint communications_event_type_check check (
    event_type is null or event_type in (
      'estimate_received','quote_ready','booking_confirmed','deposit_received',
      'move_reminder','invoice_ready','payment_receipt','review_request'
    )
  );

create unique index if not exists communications_company_idempotency_uidx
  on public.communications(company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists communications_company_status_created_idx
  on public.communications(company_id, status, created_at desc);
create index if not exists communications_event_type_idx
  on public.communications(company_id, event_type, created_at desc);

-- Staff may read tenant communication history; only the service-backed email
-- engine mutates delivery state. Existing insert policy is retained for legacy use.

-- Seed exactly the eight V1 email templates for every current tenant.
insert into public.message_templates (company_id, name, channel, subject, body, is_active)
select c.id, v.name, 'email'::communication_channel, v.subject, v.body, true
from public.companies c
cross join (values
 ('estimate_received','We received your moving request','Hi {{first_name}},\n\nWe received your moving request. Southern Magnolia Moving will review the details and contact you with next steps.\n\nThank you,\nSouthern Magnolia Moving'),
 ('quote_ready','Your Southern Magnolia Moving quote is ready','Hi {{first_name}},\n\nYour moving quote is ready. Please review your quote and approval link.\n\n{{action_url}}\n\nSouthern Magnolia Moving'),
 ('booking_confirmed','Your move is booked','Hi {{first_name}},\n\nYour quote has been accepted and your move is booked with Southern Magnolia Moving.\n\nMove date: {{move_date}}\n\nWe will keep you updated as move day approaches.'),
 ('deposit_received','Deposit received','Hi {{first_name}},\n\nWe received your deposit of {{amount}}. Thank you.\n\nSouthern Magnolia Moving'),
 ('move_reminder','Reminder: your move is coming up','Hi {{first_name}},\n\nThis is a reminder that your Southern Magnolia move is scheduled for {{move_date}}.\n\nWe look forward to moving you forward.'),
 ('invoice_ready','Your invoice is ready','Hi {{first_name}},\n\nYour Southern Magnolia Moving invoice is ready.\n\nInvoice: {{invoice_number}}\nBalance: {{amount}}'),
 ('payment_receipt','Payment received — thank you','Hi {{first_name}},\n\nWe received your payment of {{amount}}. Thank you for choosing Southern Magnolia Moving.'),
 ('review_request','How did we do?','Hi {{first_name}},\n\nThank you for choosing Southern Magnolia Moving. We would appreciate your feedback about your move.\n\n{{action_url}}')
) as v(name,subject,body)
where not exists (
  select 1 from public.message_templates mt
  where mt.company_id=c.id and mt.channel='email'::communication_channel and mt.name=v.name
);

-- Keep direct table access tenant-scoped. Delivery/retry writes happen through
-- the service-role Edge Function after caller authorization.
revoke update, delete on public.communications from anon;
revoke update, delete on public.communications from authenticated;
