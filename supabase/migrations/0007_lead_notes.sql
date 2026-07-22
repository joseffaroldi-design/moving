-- =====================================================================
-- 0007_lead_notes.sql
-- Southern Magnolia Movers — Phase 3: append-only lead notes.
--
-- Dedicated notes table (NOT the single leads.notes field). Company-scoped,
-- staff-only, append-only for Phase 3 (no client UPDATE/DELETE). Authorization
-- is validated against the RELATED LEAD's company — a client cannot supply a
-- company_id that differs from the lead's company, and cannot forge authorship.
--
-- Additive, transactional, non-destructive.
-- =====================================================================

begin;

create table if not exists public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id    uuid not null references public.leads(id)     on delete cascade,
  author_id  uuid references public.profiles(id)           on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  -- Append-only in Phase 3: no updated_at (no client UPDATE permitted).
  constraint lead_notes_body_not_empty check (btrim(body) <> '')
);

create index if not exists lead_notes_lead_id_idx    on public.lead_notes (lead_id);
create index if not exists lead_notes_company_id_idx on public.lead_notes (company_id);
create index if not exists lead_notes_created_at_idx on public.lead_notes (created_at desc);

-- ---------------------------------------------------------------------
-- Grants: strip anon/public; authenticated gets ONLY select + insert.
-- No update/delete/truncate/trigger/references for clients.
-- ---------------------------------------------------------------------
revoke all on table public.lead_notes from anon;
revoke all on table public.lead_notes from public;
grant  select, insert on table public.lead_notes to authenticated;

-- ---------------------------------------------------------------------
-- RLS: staff who work leads may read; authorized staff may insert.
--   Staff set: owner, operations_manager, dispatcher, sales.
--   INSERT additionally binds company_id to the lead's company and pins
--   author_id to the caller (auth.uid()). No UPDATE/DELETE policy.
-- ---------------------------------------------------------------------
alter table public.lead_notes enable row level security;

drop policy if exists "lead_notes_staff_select" on public.lead_notes;
create policy "lead_notes_staff_select"
on public.lead_notes for select to authenticated
using (
  public.has_company_role(
    company_id,
    array['owner','operations_manager','dispatcher','sales']::public.user_role[]
  )
);

drop policy if exists "lead_notes_staff_insert" on public.lead_notes;
create policy "lead_notes_staff_insert"
on public.lead_notes for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.leads l
    where l.id = lead_id
      and l.company_id = lead_notes.company_id
      and public.has_company_role(
        l.company_id,
        array['owner','operations_manager','dispatcher','sales']::public.user_role[]
      )
  )
);

-- No UPDATE policy and no DELETE policy: notes are append-only for clients.

commit;
