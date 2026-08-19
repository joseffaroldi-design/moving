-- 0032_website_media.sql
-- Tenant-scoped public website media with owner/operations-manager writes.
-- Uploaded files live under website-media/<company_id>/... and are public-read
-- because they are intended for the company's public marketing website.

begin;

create table if not exists public.website_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slot text not null,
  storage_path text not null,
  public_url text not null,
  alt_text text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_media_company_slot_unique unique (company_id, slot),
  constraint website_media_slot_check check (slot in (
    'hero_background','hero_crew','service_residential','service_commercial',
    'service_packing','service_specialty','service_local','service_long_distance'
  ))
);

create or replace function public.set_website_media_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_website_media_updated_at() from public, anon, authenticated;

drop trigger if exists trg_website_media_updated_at on public.website_media;
create trigger trg_website_media_updated_at
before update on public.website_media
for each row execute procedure public.set_website_media_updated_at();

revoke all on table public.website_media from public;
revoke all on table public.website_media from anon;
revoke all on table public.website_media from authenticated;
grant select on table public.website_media to anon, authenticated;
grant insert, update, delete on table public.website_media to authenticated;

alter table public.website_media enable row level security;

drop policy if exists "website_media_public_select" on public.website_media;
create policy "website_media_public_select"
on public.website_media for select to anon
using (is_published = true);

drop policy if exists "website_media_authenticated_select" on public.website_media;
create policy "website_media_authenticated_select"
on public.website_media for select to authenticated
using (is_published = true or public.is_company_member(company_id));

drop policy if exists "website_media_insert" on public.website_media;
create policy "website_media_insert"
on public.website_media for insert to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "website_media_update" on public.website_media;
create policy "website_media_update"
on public.website_media for update to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "website_media_delete" on public.website_media;
create policy "website_media_delete"
on public.website_media for delete to authenticated
using (public.can_manage_company(company_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-media', 'website-media', true, 8388608,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "website_media_storage_insert" on storage.objects;
create policy "website_media_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'website-media'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "website_media_storage_update" on storage.objects;
create policy "website_media_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'website-media'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'website-media'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "website_media_storage_delete" on storage.objects;
create policy "website_media_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'website-media'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

commit;
