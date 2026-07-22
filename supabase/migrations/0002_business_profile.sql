-- 0002_business_profile.sql
-- Southern Magnolia Movers — Business Profile (Phase 1)
-- SAFE / ADDITIVE: creates a NEW table only. Does not touch existing tables or data.
-- Depends on public.profiles(id, role) for write policies. RUN AFTER 0001.
-- NOTE: p.role is compared via ::text so this works whether role is text OR enum.

create table if not exists public.business_profile (
  id uuid primary key default gen_random_uuid(),
  -- Singleton guard: only one row can ever exist.
  is_singleton boolean not null default true,
  business_name text not null default 'Southern Magnolia Movers',
  logo_url text,
  phone text,
  email text,
  address text,
  website text,
  tagline_primary text,
  tagline_secondary text,
  brand_primary_color text default '#0E2A4A',
  brand_secondary_color text default '#C89A3D',
  brand_cream_color text default '#F7F0DF',
  quote_terms text,
  invoice_terms text,
  default_tax_rate numeric(6,3) default 0,
  default_deposit_percentage numeric(6,3) default 0,
  cancellation_policy text,
  payment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profile_singleton unique (is_singleton),
  constraint business_profile_singleton_true check (is_singleton = true)
);

-- Uniquely named updated_at trigger fn (does NOT touch any shared function).
create or replace function public.set_business_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_profile_updated_at on public.business_profile;
create trigger trg_business_profile_updated_at
before update on public.business_profile
for each row execute procedure public.set_business_profile_updated_at();

-- Seed exactly one row if empty (idempotent; unique constraint prevents duplicates).
insert into public.business_profile
  (business_name, phone, email, tagline_primary, tagline_secondary,
   quote_terms, invoice_terms, default_tax_rate, default_deposit_percentage,
   payment_instructions, cancellation_policy)
select
  'Southern Magnolia Movers', '(504) 559-6340', 'smagnoliamoving@gmail.com',
  'Moving You Forward. Cleaning Out the Past.', 'Big or Small, We Haul It All.',
  'This quote is valid until the expiration date shown. A deposit is required to reserve your move date.',
  'Payment is due upon receipt unless otherwise agreed. Thank you for your business.',
  8.45, 25, 'Please remit payment by the due date. We accept card, cash, and check.',
  'Cancellations within 48 hours of the scheduled move may incur a fee.'
where not exists (select 1 from public.business_profile);

-- Explicit Data API grants (Supabase usually auto-grants, but be explicit).
-- No sequences to grant (id is uuid default gen_random_uuid()).
grant select, insert, update on public.business_profile to authenticated;

-- Row Level Security
alter table public.business_profile enable row level security;

-- READ: any authenticated user may read the single company profile.
drop policy if exists "business_profile_select" on public.business_profile;
create policy "business_profile_select"
on public.business_profile for select to authenticated
using (true);

-- INSERT: only owner/manager.
drop policy if exists "business_profile_insert" on public.business_profile;
create policy "business_profile_insert"
on public.business_profile for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('owner','manager','operations_manager')
  )
);

-- UPDATE: only owner/manager.
drop policy if exists "business_profile_update" on public.business_profile;
create policy "business_profile_update"
on public.business_profile for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('owner','manager','operations_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('owner','manager','operations_manager')
  )
);

-- No DELETE policy: deletion is intentionally not permitted (no business need).
