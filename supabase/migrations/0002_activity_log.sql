-- 0002_activity_log.sql
-- Phase 10 — Activity logging & auditability.
-- SAFE / ADDITIVE: creates a NEW table only.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users on delete set null,
  actor_email text,
  actor_role text,
  action text not null,               -- e.g. 'lead.created', 'quote.approved'
  entity_type text,                   -- e.g. 'lead','quote','job','invoice'
  entity_id text,
  summary text,                       -- safe, human-readable change summary
  metadata jsonb default '{}'::jsonb, -- NEVER store secrets/tokens/passwords
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_entity on public.activity_log (entity_type, entity_id);
create index if not exists idx_activity_log_created on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

-- Authenticated staff can read the log.
drop policy if exists "activity_log_read" on public.activity_log;
create policy "activity_log_read"
on public.activity_log for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','manager','operations_manager','dispatcher','sales')
  )
);

-- Any authenticated user can append their own actions.
drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert"
on public.activity_log for insert to authenticated
with check (actor_id = auth.uid());
