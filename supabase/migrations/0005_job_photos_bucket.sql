-- 0004_job_photos_bucket.sql
-- Phase 6 — Private storage bucket for crew job photos.
-- SAFE / ADDITIVE. Creates a private bucket + RLS policies on storage.objects.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

-- Authenticated staff/crew can read photos in the bucket.
drop policy if exists "job_photos_read" on storage.objects;
create policy "job_photos_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'job-photos'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('owner','manager','operations_manager','dispatcher','crew','crew_lead','mover')
  )
);

-- Authenticated users can upload; the object is owned by the uploader.
drop policy if exists "job_photos_insert" on storage.objects;
create policy "job_photos_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'job-photos' and owner = auth.uid());

-- Uploader may update/delete only their own objects.
drop policy if exists "job_photos_modify" on storage.objects;
create policy "job_photos_modify"
on storage.objects for update to authenticated
using (bucket_id = 'job-photos' and owner = auth.uid())
with check (bucket_id = 'job-photos' and owner = auth.uid());

drop policy if exists "job_photos_delete" on storage.objects;
create policy "job_photos_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'job-photos' and owner = auth.uid());
