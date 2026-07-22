-- =====================================================================
-- 0002_business_profile.sql
-- Southern Magnolia Movers — Phase 1: per-company Business Profile.
--
-- Company-scoped (NOT a global singleton). One row per company via
-- UNIQUE(company_id). Access is gated by the existing trusted helpers:
--   SELECT  -> public.is_company_member(company_id)
--   INSERT  -> public.can_manage_company(company_id)   (owner / ops-manager)
--   UPDATE  -> public.can_manage_company(company_id)
-- No DELETE policy. Additive + non-destructive to all existing data.
-- Transactional. Seeds ONLY the known company if a row does not exist.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Table (additive; created only if absent).
-- ---------------------------------------------------------------------
create table if not exists public.business_profile (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id) on delete cascade,
  business_name              text not null default 'Southern Magnolia Movers',
  logo_url                   text,
  phone                      text,
  email                      text,
  address                    text,
  website                    text,
  tagline_primary            text,
  tagline_secondary          text,
  brand_primary_color        text default '#0E2A4A',
  brand_secondary_color      text default '#C89A3D',
  brand_cream_color          text default '#F7F0DF',
  quote_terms                text,
  invoice_terms              text,
  default_tax_rate           numeric(6,3) default 0,
  default_deposit_percentage numeric(6,3) default 0,
  cancellation_policy        text,
  payment_instructions       text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- One business profile per company.
  constraint business_profile_company_unique unique (company_id)
);

-- ---------------------------------------------------------------------
-- Uniquely named updated_at trigger fn (does NOT touch any shared function).
-- SECURITY INVOKER (default); search_path pinned for safety.
-- ---------------------------------------------------------------------
create or replace function public.set_business_profile_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_profile_updated_at on public.business_profile;
create trigger trg_business_profile_updated_at
before update on public.business_profile
for each row execute procedure public.set_business_profile_updated_at();

-- ---------------------------------------------------------------------
-- Data API grants. RLS below still governs which rows/actions are allowed.
-- id is uuid default gen_random_uuid() -> no sequence to grant.
-- ---------------------------------------------------------------------
grant select, insert, update on table public.business_profile to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security — separate SELECT / INSERT / UPDATE. No DELETE.
-- ---------------------------------------------------------------------
alter table public.business_profile enable row level security;

-- READ: any ACTIVE member of the company may read its profile.
drop policy if exists "business_profile_select" on public.business_profile;
create policy "business_profile_select"
on public.business_profile for select to authenticated
using (public.is_company_member(company_id));

-- INSERT: only owner / operations_manager of that company.
drop policy if exists "business_profile_insert" on public.business_profile;
create policy "business_profile_insert"
on public.business_profile for insert to authenticated
with check (public.can_manage_company(company_id));

-- UPDATE: only owner / operations_manager of that company (both USING + CHECK).
drop policy if exists "business_profile_update" on public.business_profile;
create policy "business_profile_update"
on public.business_profile for update to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

-- No DELETE policy: deletion is intentionally not permitted.

-- ---------------------------------------------------------------------
-- Seed the known company's profile ONLY if it does not already exist.
-- Runs as the migration role (postgres); safe and idempotent.
-- ---------------------------------------------------------------------
insert into public.business_profile
  (company_id, business_name, phone, email, tagline_primary, tagline_secondary,
   quote_terms, invoice_terms, default_tax_rate, default_deposit_percentage,
   payment_instructions, cancellation_policy)
select
  'f05941f2-13db-4779-a1f3-2d6a74ccffcd',
  'Southern Magnolia Movers', '(504) 559-6340', 'smagnoliamoving@gmail.com',
  'Moving You Forward. Cleaning Out the Past.', 'Big or Small, We Haul It All.',
  'This quote is valid until the expiration date shown. A deposit is required to reserve your move date.',
  'Payment is due upon receipt unless otherwise agreed. Thank you for your business.',
  8.45, 25, 'Please remit payment by the due date. We accept card, cash, and check.',
  'Cancellations within 48 hours of the scheduled move may incur a fee.'
where not exists (
  select 1 from public.business_profile
  where company_id = 'f05941f2-13db-4779-a1f3-2d6a74ccffcd'
);

commit;
