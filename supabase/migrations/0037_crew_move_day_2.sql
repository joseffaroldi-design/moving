-- Southern Magnolia V1 Phase 4: Crew Move-Day 2.0
-- Additive extension of existing crew mobile, documents/signatures, photos and operational issues.

begin;

alter table public.operational_issues
  add column if not exists issue_category text;

alter table public.operational_issues drop constraint if exists operational_issues_issue_category_check;
alter table public.operational_issues add constraint operational_issues_issue_category_check
  check (issue_category is null or issue_category in (
    'access','customer_request','property_condition','item_condition','safety','schedule','other'
  ));

create table if not exists public.operational_issue_photos (
  operational_issue_id uuid not null references public.operational_issues(id) on delete cascade,
  job_photo_id uuid not null references public.job_photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (operational_issue_id, job_photo_id)
);

alter table public.operational_issue_photos enable row level security;
revoke all on table public.operational_issue_photos from public, anon;
revoke all on table public.operational_issue_photos from authenticated;
grant select on table public.operational_issue_photos to authenticated;

create policy "operational_issue_photos_company_select"
on public.operational_issue_photos for select to authenticated
using (
  exists (
    select 1 from public.operational_issues oi
    where oi.id = operational_issue_id and public.is_company_member(oi.company_id)
  )
);

create or replace function public.crew_move_day_readiness(p_job_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_checklist_total int;
  v_checklist_incomplete int;
  v_active_clock_count int;
  v_required_doc_count int;
  v_unsigned_required_doc_count int;
  v_completion_doc_count int;
  v_completion_signed_count int;
  v_reasons jsonb := '[]'::jsonb;
begin
  select count(*), count(*) filter (where not is_completed)
    into v_checklist_total, v_checklist_incomplete
  from public.job_checklists
  where company_id=v_company and job_id=p_job_id;

  select count(*) into v_active_clock_count
  from public.crew_time_entries
  where company_id=v_company and job_id=p_job_id and clock_out_at is null;

  select count(*), count(*) filter (
    where not exists (
      select 1 from public.document_signatures s
      where s.document_id=d.id and s.status::text='signed'
    )
  ) into v_required_doc_count, v_unsigned_required_doc_count
  from public.documents d
  where d.company_id=v_company and d.job_id=p_job_id
    and d.lifecycle_status='finalized' and d.signature_required=true;

  select count(*), count(*) filter (
    where exists (
      select 1 from public.document_signatures s
      where s.document_id=d.id and s.status::text='signed'
    )
  ) into v_completion_doc_count, v_completion_signed_count
  from public.documents d
  where d.company_id=v_company and d.job_id=p_job_id
    and d.lifecycle_status='finalized'
    and d.document_key='completion_acknowledgment'
    and d.signature_required=true;

  if v_checklist_total = 0 then
    v_reasons := v_reasons || jsonb_build_array('Pre-move checklist has not been prepared');
  elsif v_checklist_incomplete > 0 then
    v_reasons := v_reasons || jsonb_build_array(v_checklist_incomplete::text || ' checklist item(s) remain incomplete');
  end if;

  if v_active_clock_count > 0 then
    v_reasons := v_reasons || jsonb_build_array(v_active_clock_count::text || ' crew member(s) are still clocked in');
  end if;

  if v_unsigned_required_doc_count > 0 then
    v_reasons := v_reasons || jsonb_build_array(v_unsigned_required_doc_count::text || ' required customer document(s) remain unsigned');
  end if;

  if v_completion_doc_count = 0 then
    v_reasons := v_reasons || jsonb_build_array('Customer completion acknowledgment is missing');
  elsif v_completion_signed_count = 0 then
    v_reasons := v_reasons || jsonb_build_array('Customer completion acknowledgment is not signed');
  end if;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_reasons)=0,
    'reasons', v_reasons,
    'checklist_total', v_checklist_total,
    'checklist_incomplete', v_checklist_incomplete,
    'active_clock_count', v_active_clock_count,
    'required_document_count', v_required_doc_count,
    'unsigned_required_document_count', v_unsigned_required_doc_count,
    'completion_acknowledgment_present', v_completion_doc_count > 0,
    'completion_acknowledgment_signed', v_completion_signed_count > 0
  );
end;
$$;

create or replace function public.crew_report_issue(
  p_job_id uuid,
  p_category text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_uid uuid := auth.uid();
  v_id uuid;
  v_category text := lower(btrim(coalesce(p_category,'')));
begin
  if v_category not in ('access','customer_request','property_condition','item_condition','safety','schedule','other') then
    raise exception 'Invalid issue category';
  end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Issue note is required'; end if;
  if char_length(p_note) > 2000 then raise exception 'Issue note is too long'; end if;

  insert into public.operational_issues(
    company_id,job_id,severity,title,description,issue_category,reported_by
  ) values (
    v_company,p_job_id,'medium'::public.issue_severity,
    'Crew issue — ' || replace(initcap(replace(v_category,'_',' ')),'—','-'),
    btrim(p_note),v_category,v_uid
  ) returning id into v_id;

  insert into public.activity_log(company_id,actor_id,action,entity_type,entity_id,summary,metadata)
  values (v_company,v_uid,'crew.issue_reported','operational_issue',v_id::text,'Crew reported an issue',
          jsonb_build_object('job_id',p_job_id,'category',v_category));

  return jsonb_build_object('id',v_id,'job_id',p_job_id,'category',v_category,'reported_at',now());
end;
$$;

create or replace function public.crew_register_job_photo(
  p_job_id uuid,
  p_storage_path text,
  p_caption text default null,
  p_photo_stage text default null,
  p_mime_type text default 'image/jpeg',
  p_size_bytes bigint default null,
  p_operational_issue_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_doc uuid;
  v_photo uuid;
  v_expected text := v_company::text||'/'||p_job_id::text||'/';
begin
  if p_storage_path is null or p_storage_path not like v_expected||'%' then raise exception 'Invalid storage path'; end if;
  if char_length(coalesce(p_caption,'')) > 500 then raise exception 'Caption too long'; end if;
  if p_photo_stage is not null and p_photo_stage not in (
    'existing_condition','special_item','loading','issue','completion','other'
  ) then raise exception 'Invalid photo category'; end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 15728640) then raise exception 'Photo too large'; end if;

  if p_operational_issue_id is not null and not exists (
    select 1 from public.operational_issues oi
    where oi.id=p_operational_issue_id and oi.job_id=p_job_id and oi.company_id=v_company
  ) then raise exception 'Issue not found'; end if;

  select customer_id into v_customer from public.jobs where id=p_job_id and company_id=v_company;
  insert into public.documents(company_id,customer_id,job_id,type,title,storage_path,mime_type,size_bytes,uploaded_by)
  values(v_company,v_customer,p_job_id,'photo'::public.document_type,coalesce(nullif(btrim(p_caption),''),'Job photo'),p_storage_path,p_mime_type,p_size_bytes,v_uid)
  returning id into v_doc;

  insert into public.job_photos(company_id,job_id,document_id,caption,photo_stage,taken_by,taken_at)
  values(v_company,p_job_id,v_doc,nullif(btrim(p_caption),''),p_photo_stage,v_uid,now())
  returning id into v_photo;

  if p_operational_issue_id is not null then
    insert into public.operational_issue_photos(operational_issue_id,job_photo_id)
    values(p_operational_issue_id,v_photo) on conflict do nothing;
  end if;

  return jsonb_build_object('document_id',v_doc,'job_photo_id',v_photo,'storage_path',p_storage_path,
                            'operational_issue_id',p_operational_issue_id);
end;
$$;

create or replace function public.crew_set_move_day_status(
  p_job_id uuid,
  p_status public.dispatch_status,
  p_note text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_uid uuid := auth.uid();
  v_role text;
  v_current public.dispatch_status;
  v_readiness jsonb;
  v_event_id uuid;
begin
  select role::text into v_role from public.profiles where id=v_uid and is_active is true;

  select da.status into v_current
  from public.dispatch_assignments da
  where da.company_id=v_company and da.job_id=p_job_id
  order by da.created_at desc limit 1 for update;

  if v_current is null then v_current := 'assigned'::public.dispatch_status; end if;

  if p_status::text not in ('assigned','en_route','arrived','loading','in_transit','unloading','completed','issue') then
    raise exception 'Unsupported move-day status';
  end if;

  if p_status='completed'::public.dispatch_status then
    if v_role <> 'crew_lead' then raise exception 'Only the crew lead can complete a move'; end if;
    v_readiness := public.crew_move_day_readiness(p_job_id);
    if not coalesce((v_readiness->>'ready')::boolean,false) then
      raise exception 'Move cannot be completed: %', array_to_string(array(select jsonb_array_elements_text(v_readiness->'reasons')), '; ');
    end if;
  end if;

  insert into public.job_status_events(company_id,job_id,status,note,latitude,longitude,created_by)
  values(v_company,p_job_id,p_status,nullif(btrim(coalesce(p_note,'')),''),p_latitude,p_longitude,v_uid)
  returning id into v_event_id;

  update public.dispatch_assignments
  set status=p_status, updated_at=now()
  where company_id=v_company and job_id=p_job_id;

  if p_status in ('loading'::public.dispatch_status,'in_transit'::public.dispatch_status,'unloading'::public.dispatch_status) then
    update public.jobs set status='in_progress'::public.job_status, updated_at=now()
    where id=p_job_id and company_id=v_company and status in ('scheduled'::public.job_status,'confirmed'::public.job_status,'in_progress'::public.job_status);
  elsif p_status='completed'::public.dispatch_status then
    update public.jobs set status='completed'::public.job_status, updated_at=now()
    where id=p_job_id and company_id=v_company;
  end if;

  return jsonb_build_object('event_id',v_event_id,'job_id',p_job_id,'status',p_status::text,'readiness',v_readiness);
end;
$$;

revoke execute on function public.crew_move_day_readiness(uuid) from public, anon;
revoke execute on function public.crew_report_issue(uuid,text,text) from public, anon;
revoke execute on function public.crew_register_job_photo(uuid,text,text,text,text,bigint,uuid) from public, anon;
revoke execute on function public.crew_set_move_day_status(uuid,public.dispatch_status,text,numeric,numeric) from public, anon;
grant execute on function public.crew_move_day_readiness(uuid) to authenticated;
grant execute on function public.crew_report_issue(uuid,text,text) to authenticated;
grant execute on function public.crew_register_job_photo(uuid,text,text,text,text,bigint,uuid) to authenticated;
grant execute on function public.crew_set_move_day_status(uuid,public.dispatch_status,text,numeric,numeric) to authenticated;

commit;
