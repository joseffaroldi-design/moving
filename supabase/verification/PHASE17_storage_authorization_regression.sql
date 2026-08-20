-- Phase 17 — read-only regression verification for private Storage authorization.
-- Safe to run in production. Raises on drift; performs no writes.

do $$
declare
  v_helper regprocedure := 'app_private.can_access_private_storage_object(text,text,text)'::regprocedure;
  v_policy_count integer;
begin
  if has_function_privilege('anon', v_helper, 'EXECUTE') then
    raise exception 'FAIL: anon can execute private Storage helper';
  end if;

  if has_function_privilege('public', v_helper, 'EXECUTE') then
    raise exception 'FAIL: PUBLIC can execute private Storage helper';
  end if;

  if not has_function_privilege('authenticated', v_helper, 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute private Storage helper';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'can_access_private_storage_object'
      and p.prosecdef is true
      and pg_get_functiondef(p.oid) like '%SET search_path TO ''public'', ''pg_temp''%'
  ) then
    raise exception 'FAIL: private Storage helper SECURITY DEFINER/search_path contract drifted';
  end if;

  select count(*)
    into v_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'storage_documents_select',
      'storage_documents_insert',
      'storage_job_photos_select',
      'storage_job_photos_insert',
      'storage_receipts_select',
      'storage_receipts_insert'
    )
    and coalesce(qual, with_check, '') like '%app_private.can_access_private_storage_object%';

  if v_policy_count <> 6 then
    raise exception 'FAIL: expected 6 hardened private Storage policies, found %', v_policy_count;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'storage_documents_select',
        'storage_documents_insert',
        'storage_job_photos_select',
        'storage_job_photos_insert',
        'storage_receipts_select',
        'storage_receipts_insert'
      )
      and (coalesce(qual, '') like '%is_company_member%' or coalesce(with_check, '') like '%is_company_member%')
  ) then
    raise exception 'FAIL: legacy company-membership-only Storage authorization is present';
  end if;
end $$;

select 'PASS: Phase 17 private Storage authorization regression checks' as result;
