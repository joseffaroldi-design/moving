-- Phase 16 — tighten private Storage authorization to match application-level access.
-- Mirrors production migration 20260820093756.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.can_access_private_storage_object(
  p_bucket text,
  p_name text,
  p_mode text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_folders text[];
  v_path_company uuid;
  v_job_id uuid;
begin
  if v_uid is null or p_bucket not in ('documents','job-photos','receipts') then
    return false;
  end if;

  select p.company_id, p.role::text
    into v_company, v_role
  from public.profiles p
  where p.id = v_uid
    and p.is_active is true;

  if v_company is null or v_role is null then
    return false;
  end if;

  v_folders := storage.foldername(p_name);
  if coalesce(array_length(v_folders, 1), 0) < 1 then
    return false;
  end if;

  begin
    v_path_company := v_folders[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_path_company <> v_company then
    return false;
  end if;

  -- Preserve company-wide access for trusted staff roles.
  if v_role in ('owner','operations_manager','dispatcher','sales') then
    return true;
  end if;

  -- Crew access must be tied to an assigned job encoded as company/job/...
  if v_role in ('crew_lead','mover') then
    if coalesce(array_length(v_folders, 1), 0) < 2 then
      return false;
    end if;

    begin
      v_job_id := v_folders[2]::uuid;
    exception when invalid_text_representation then
      return false;
    end;

    return exists (
      select 1
      from public.jobs j
      join public.job_crew jc
        on jc.job_id = j.id
       and jc.profile_id = v_uid
      where j.id = v_job_id
        and j.company_id = v_company
    );
  end if;

  -- Customers may only read stored documents that are actually theirs.
  if v_role = 'customer' and p_mode = 'select' and p_bucket = 'documents' then
    return exists (
      select 1
      from public.documents d
      join public.customers c on c.id = d.customer_id
      where d.company_id = v_company
        and d.storage_path = p_name
        and c.company_id = v_company
        and c.auth_user_id = v_uid
    );
  end if;

  return false;
end;
$$;

revoke all on function app_private.can_access_private_storage_object(text,text,text) from public, anon;
grant execute on function app_private.can_access_private_storage_object(text,text,text) to authenticated;

drop policy if exists storage_documents_select on storage.objects;
create policy storage_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and app_private.can_access_private_storage_object(bucket_id, name, 'select')
);

drop policy if exists storage_documents_insert on storage.objects;
create policy storage_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and app_private.can_access_private_storage_object(bucket_id, name, 'insert')
);

drop policy if exists storage_job_photos_select on storage.objects;
create policy storage_job_photos_select
on storage.objects for select to authenticated
using (
  bucket_id = 'job-photos'
  and app_private.can_access_private_storage_object(bucket_id, name, 'select')
);

drop policy if exists storage_job_photos_insert on storage.objects;
create policy storage_job_photos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-photos'
  and app_private.can_access_private_storage_object(bucket_id, name, 'insert')
);

drop policy if exists storage_receipts_select on storage.objects;
create policy storage_receipts_select
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and app_private.can_access_private_storage_object(bucket_id, name, 'select')
);

drop policy if exists storage_receipts_insert on storage.objects;
create policy storage_receipts_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and app_private.can_access_private_storage_object(bucket_id, name, 'insert')
);
