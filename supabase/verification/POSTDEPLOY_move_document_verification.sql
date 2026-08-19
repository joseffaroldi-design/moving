-- Southern Magnolia V1 Phase 2 post-deploy verification (read-only)

select
  to_regclass('public.documents') is not null as documents_exists,
  to_regclass('public.document_signatures') is not null as signatures_exists,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_key') as document_key_present,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='content_sha256') as content_hash_present,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='document_signatures' and column_name='signed_content_sha256') as signed_hash_present;

select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'staff_finalize_move_document_snapshot','staff_list_move_documents','staff_void_unsigned_move_document',
  'portal_list_move_documents','portal_get_move_document','portal_sign_move_document','crew_list_move_documents'
)
order by p.proname;

select event_object_table,trigger_name,event_manipulation,action_timing
from information_schema.triggers
where trigger_schema='public' and trigger_name in (
  'move_document_validate_signature_link','move_document_guard_document_immutability','move_document_guard_signature_immutability'
)
order by event_object_table,trigger_name,event_manipulation;

select table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('documents','document_signatures')
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name,grantee,privilege_type;
