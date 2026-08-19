-- Southern Magnolia V1 Phase 2: move documents and customer signatures
-- Additive extension of legacy public.documents + public.document_signatures.
-- Legal/customer-facing wording is intentionally NOT embedded here.

begin;

alter table public.documents
  add column if not exists document_key text,
  add column if not exists version_no integer not null default 1,
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists content_snapshot text,
  add column if not exists content_sha256 text,
  add column if not exists signature_required boolean not null default false,
  add column if not exists finalized_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists supersedes_document_id uuid references public.documents(id) on delete set null;

alter table public.document_signatures
  add column if not exists signer_role text,
  add column if not exists signed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists signed_content_sha256 text;

alter table public.documents drop constraint if exists documents_move_document_key_check;
alter table public.documents add constraint documents_move_document_key_check
  check (document_key is null or document_key in (
    'service_agreement',
    'valuation_acknowledgment',
    'scope_change_authorization',
    'completion_acknowledgment'
  ));

alter table public.documents drop constraint if exists documents_lifecycle_status_check;
alter table public.documents add constraint documents_lifecycle_status_check
  check (lifecycle_status in ('draft','finalized','voided'));

alter table public.documents drop constraint if exists documents_version_no_check;
alter table public.documents add constraint documents_version_no_check check (version_no >= 1);

alter table public.document_signatures drop constraint if exists document_signatures_signer_role_check;
alter table public.document_signatures add constraint document_signatures_signer_role_check
  check (signer_role is null or signer_role in ('customer','staff','crew'));

create unique index if not exists documents_job_key_version_uidx
  on public.documents(job_id, document_key, version_no)
  where job_id is not null and document_key is not null;

create unique index if not exists document_signatures_customer_document_uidx
  on public.document_signatures(document_id, customer_id)
  where customer_id is not null;

create index if not exists documents_job_move_key_idx
  on public.documents(job_id, document_key, lifecycle_status)
  where document_key is not null;

create index if not exists document_signatures_document_status_idx
  on public.document_signatures(document_id, status);

create or replace function public._move_document_validate_signature_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = new.document_id;
  if not found then raise exception 'Document not found'; end if;
  if new.company_id <> v_doc.company_id then raise exception 'Signature company mismatch'; end if;
  if new.customer_id is not null and v_doc.customer_id is not null and new.customer_id <> v_doc.customer_id then
    raise exception 'Signature customer mismatch';
  end if;
  return new;
end;
$$;

revoke execute on function public._move_document_validate_signature_link() from public, anon, authenticated;

drop trigger if exists move_document_validate_signature_link on public.document_signatures;
create trigger move_document_validate_signature_link
before insert or update on public.document_signatures
for each row execute procedure public._move_document_validate_signature_link();

create or replace function public._move_document_guard_document_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.lifecycle_status = 'finalized'
       or exists (select 1 from public.document_signatures s where s.document_id=old.id and s.status::text='signed') then
      raise exception 'Finalized or signed documents are immutable';
    end if;
    return old;
  end if;

  if exists (select 1 from public.document_signatures s where s.document_id=old.id and s.status::text='signed') then
    raise exception 'Signed documents are immutable';
  end if;

  if old.lifecycle_status = 'finalized' then
    if new.lifecycle_status = 'voided'
       and (to_jsonb(new) - array['lifecycle_status','voided_at']) = (to_jsonb(old) - array['lifecycle_status','voided_at']) then
      return new;
    end if;
    raise exception 'Finalized documents are immutable; create a new version or void the unsigned version';
  end if;

  return new;
end;
$$;

revoke execute on function public._move_document_guard_document_immutability() from public, anon, authenticated;

drop trigger if exists move_document_guard_document_immutability on public.documents;
create trigger move_document_guard_document_immutability
before update or delete on public.documents
for each row execute procedure public._move_document_guard_document_immutability();

create or replace function public._move_document_guard_signature_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.status::text='signed' then
    raise exception 'Signed signatures are immutable';
  end if;
  if tg_op = 'UPDATE' and old.status::text='signed' then
    raise exception 'Signed signatures are immutable';
  end if;
  if tg_op = 'UPDATE' and new.status::text='signed' then
    if nullif(btrim(coalesce(new.signer_name,'')),'') is null
       or nullif(btrim(coalesce(new.signature_data,'')),'') is null
       or new.signed_at is null
       or nullif(btrim(coalesce(new.signed_content_sha256,'')),'') is null then
      raise exception 'Signed signature is incomplete';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke execute on function public._move_document_guard_signature_immutability() from public, anon, authenticated;

drop trigger if exists move_document_guard_signature_immutability on public.document_signatures;
create trigger move_document_guard_signature_immutability
before update or delete on public.document_signatures
for each row execute procedure public._move_document_guard_signature_immutability();

create or replace function public.staff_finalize_move_document_snapshot(
  p_job_id uuid,
  p_document_key text,
  p_title text,
  p_content_snapshot text,
  p_signature_required boolean default true,
  p_supersedes_document_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_id uuid := gen_random_uuid();
  v_version integer;
  v_hash text;
begin
  select * into v_job from public.jobs where id=p_job_id;
  if not found then raise exception 'Job not found'; end if;
  if not public.has_company_role(v_job.company_id, array['owner','operations_manager']::public.user_role[]) then
    raise exception 'Not authorized';
  end if;
  if p_document_key not in ('service_agreement','valuation_acknowledgment','scope_change_authorization','completion_acknowledgment') then
    raise exception 'Unsupported move document type';
  end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Title is required'; end if;
  if nullif(btrim(coalesce(p_content_snapshot,'')),'') is null then raise exception 'Document content is required'; end if;
  if coalesce(p_signature_required,true) and v_job.customer_id is null then raise exception 'Job has no customer'; end if;

  if p_supersedes_document_id is not null and not exists (
    select 1 from public.documents d
    where d.id=p_supersedes_document_id and d.company_id=v_job.company_id and d.job_id=v_job.id
      and d.document_key=p_document_key
  ) then raise exception 'Superseded document not found'; end if;

  select coalesce(max(d.version_no),0)+1 into v_version
  from public.documents d where d.job_id=v_job.id and d.document_key=p_document_key;

  v_hash := encode(digest(convert_to(p_content_snapshot,'UTF8'),'sha256'),'hex');

  insert into public.documents(
    id,company_id,customer_id,job_id,type,title,storage_path,mime_type,size_bytes,uploaded_by,
    document_key,version_no,lifecycle_status,content_snapshot,content_sha256,signature_required,
    finalized_at,supersedes_document_id
  ) values (
    v_id,v_job.company_id,v_job.customer_id,v_job.id,'contract'::public.document_type,btrim(p_title),
    'snapshot://'||v_id::text,'text/plain',octet_length(convert_to(p_content_snapshot,'UTF8')),auth.uid(),
    p_document_key,v_version,'finalized',p_content_snapshot,v_hash,coalesce(p_signature_required,true),now(),
    p_supersedes_document_id
  );

  if coalesce(p_signature_required,true) then
    insert into public.document_signatures(company_id,document_id,customer_id,status,signer_role)
    values (v_job.company_id,v_id,v_job.customer_id,'pending'::public.signature_status,'customer');
  end if;

  insert into public.activity_log(company_id,actor_id,action,entity_type,entity_id,summary,metadata)
  values (v_job.company_id,auth.uid(),'document.finalized','document',v_id::text,
          'Move document finalized',jsonb_build_object('job_id',v_job.id,'document_key',p_document_key,'version',v_version));

  return json_build_object('id',v_id,'job_id',v_job.id,'document_key',p_document_key,'version_no',v_version,
                           'content_sha256',v_hash,'signature_required',coalesce(p_signature_required,true));
end;
$$;

create or replace function public.staff_list_move_documents(p_job_id uuid)
returns json
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare v_job public.jobs%rowtype; v_items json;
begin
  select * into v_job from public.jobs where id=p_job_id;
  if not found then raise exception 'Job not found'; end if;
  if not public.has_company_role(v_job.company_id,array['owner','operations_manager','dispatcher']::public.user_role[]) then
    raise exception 'Not authorized';
  end if;
  select coalesce(json_agg(json_build_object(
    'id',d.id,'document_key',d.document_key,'title',d.title,'version_no',d.version_no,
    'lifecycle_status',d.lifecycle_status,'signature_required',d.signature_required,
    'finalized_at',d.finalized_at,'content_sha256',d.content_sha256,
    'signature_status',s.status::text,'signed_at',s.signed_at,'signer_name',s.signer_name
  ) order by d.created_at desc,d.id desc),'[]'::json) into v_items
  from public.documents d
  left join public.document_signatures s on s.document_id=d.id and s.customer_id=d.customer_id
  where d.job_id=p_job_id and d.document_key is not null;
  return json_build_object('items',v_items);
end;
$$;

create or replace function public.staff_void_unsigned_move_document(p_document_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id=p_document_id and document_key is not null;
  if not found then raise exception 'Document not found'; end if;
  if not public.has_company_role(v_doc.company_id,array['owner','operations_manager']::public.user_role[]) then
    raise exception 'Not authorized';
  end if;
  if exists (select 1 from public.document_signatures s where s.document_id=v_doc.id and s.status::text='signed') then
    raise exception 'Signed documents cannot be voided';
  end if;
  update public.documents set lifecycle_status='voided',voided_at=now() where id=v_doc.id;
  update public.document_signatures set status='expired'::public.signature_status,updated_at=now()
    where document_id=v_doc.id and status::text='pending';
  insert into public.activity_log(company_id,actor_id,action,entity_type,entity_id,summary,metadata)
  values (v_doc.company_id,auth.uid(),'document.voided','document',v_doc.id::text,'Unsigned move document voided',
          jsonb_build_object('job_id',v_doc.job_id,'document_key',v_doc.document_key,'version',v_doc.version_no));
  return json_build_object('id',v_doc.id,'voided',true);
end;
$$;

create or replace function public.portal_list_move_documents()
returns json
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare v_cust uuid := public._portal_current_customer_id(); v_items json;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;
  select coalesce(json_agg(json_build_object(
    'id',d.id,'job_id',d.job_id,'document_key',d.document_key,'title',d.title,'version_no',d.version_no,
    'finalized_at',d.finalized_at,'signature_required',d.signature_required,
    'signature_status',coalesce(s.status::text,case when d.signature_required then 'pending' else 'not_required' end),
    'signed_at',s.signed_at
  ) order by d.finalized_at desc,d.id desc),'[]'::json) into v_items
  from public.documents d
  left join public.document_signatures s on s.document_id=d.id and s.customer_id=v_cust
  where d.customer_id=v_cust and d.document_key is not null and d.lifecycle_status='finalized';
  return json_build_object('items',v_items);
end;
$$;

create or replace function public.portal_get_move_document(p_document_id uuid)
returns json
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare v_cust uuid := public._portal_current_customer_id(); d public.documents%rowtype; s public.document_signatures%rowtype;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;
  select * into d from public.documents
   where id=p_document_id and customer_id=v_cust and document_key is not null and lifecycle_status='finalized';
  if not found then raise exception 'Document not found'; end if;
  select * into s from public.document_signatures where document_id=d.id and customer_id=v_cust limit 1;
  return json_build_object(
    'id',d.id,'job_id',d.job_id,'document_key',d.document_key,'title',d.title,'version_no',d.version_no,
    'content_snapshot',d.content_snapshot,'content_sha256',d.content_sha256,'finalized_at',d.finalized_at,
    'signature_required',d.signature_required,'signature_status',coalesce(s.status::text,'not_required'),
    'signer_name',s.signer_name,'signed_at',s.signed_at,'signed_content_sha256',s.signed_content_sha256
  );
end;
$$;

create or replace function public.portal_sign_move_document(
  p_document_id uuid,
  p_signer_name text,
  p_signature_data text,
  p_user_agent text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cust uuid := public._portal_current_customer_id();
  d public.documents%rowtype;
  v_sig public.document_signatures%rowtype;
  v_email text;
begin
  if v_cust is null then raise exception 'Not authorized as a customer'; end if;
  if nullif(btrim(coalesce(p_signer_name,'')),'') is null then raise exception 'Signer name is required'; end if;
  if nullif(btrim(coalesce(p_signature_data,'')),'') is null then raise exception 'Signature is required'; end if;

  select * into d from public.documents
   where id=p_document_id and customer_id=v_cust and document_key is not null
     and lifecycle_status='finalized' and signature_required=true;
  if not found then raise exception 'Document not found'; end if;

  select * into v_sig from public.document_signatures
   where document_id=d.id and customer_id=v_cust for update;
  if not found then raise exception 'Signature request not found'; end if;
  if v_sig.status::text='signed' then
    return json_build_object('id',v_sig.id,'document_id',d.id,'signed',true,'already_signed',true,'signed_at',v_sig.signed_at);
  end if;
  if v_sig.status::text <> 'pending' then raise exception 'Document is not available for signing'; end if;

  select email into v_email from public.customers where id=v_cust;
  update public.document_signatures set
    status='signed'::public.signature_status,
    signer_name=btrim(p_signer_name),
    signer_email=v_email,
    signature_data=p_signature_data,
    signer_role='customer',
    signed_by_user_id=auth.uid(),
    signed_user_agent=nullif(left(coalesce(p_user_agent,''),1000),''),
    signed_at=now(),
    signed_content_sha256=d.content_sha256,
    updated_at=now()
  where id=v_sig.id
  returning * into v_sig;

  insert into public.activity_log(company_id,actor_id,action,entity_type,entity_id,summary,metadata)
  values (d.company_id,auth.uid(),'document.signed','document',d.id::text,'Move document signed',
          jsonb_build_object('job_id',d.job_id,'document_key',d.document_key,'version',d.version_no,'signature_id',v_sig.id));

  return json_build_object('id',v_sig.id,'document_id',d.id,'signed',true,'already_signed',false,
                           'signed_at',v_sig.signed_at,'content_sha256',v_sig.signed_content_sha256);
end;
$$;

create or replace function public.crew_list_move_documents(p_job_id uuid)
returns json
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare v_me uuid := public._crew_current_profile(); v_items json;
begin
  if v_me is null then raise exception 'Not authorized as crew'; end if;
  if not exists (select 1 from public.job_crew jc where jc.job_id=p_job_id and jc.profile_id=v_me) then
    raise exception 'Job not found';
  end if;
  select coalesce(json_agg(json_build_object(
    'id',d.id,'document_key',d.document_key,'title',d.title,'version_no',d.version_no,
    'signature_required',d.signature_required,'signature_status',coalesce(s.status::text,'not_required'),
    'signed_at',s.signed_at,'finalized_at',d.finalized_at
  ) order by d.finalized_at,d.id),'[]'::json) into v_items
  from public.documents d
  left join public.document_signatures s on s.document_id=d.id and s.customer_id=d.customer_id
  where d.job_id=p_job_id and d.document_key is not null and d.lifecycle_status='finalized';
  return json_build_object('items',v_items);
end;
$$;

revoke execute on function public.staff_finalize_move_document_snapshot(uuid,text,text,text,boolean,uuid) from public, anon;
revoke execute on function public.staff_list_move_documents(uuid) from public, anon;
revoke execute on function public.staff_void_unsigned_move_document(uuid) from public, anon;
revoke execute on function public.portal_list_move_documents() from public, anon;
revoke execute on function public.portal_get_move_document(uuid) from public, anon;
revoke execute on function public.portal_sign_move_document(uuid,text,text,text) from public, anon;
revoke execute on function public.crew_list_move_documents(uuid) from public, anon;

grant execute on function public.staff_finalize_move_document_snapshot(uuid,text,text,text,boolean,uuid) to authenticated;
grant execute on function public.staff_list_move_documents(uuid) to authenticated;
grant execute on function public.staff_void_unsigned_move_document(uuid) to authenticated;
grant execute on function public.portal_list_move_documents() to authenticated;
grant execute on function public.portal_get_move_document(uuid) to authenticated;
grant execute on function public.portal_sign_move_document(uuid,text,text,text) to authenticated;
grant execute on function public.crew_list_move_documents(uuid) to authenticated;

commit;
