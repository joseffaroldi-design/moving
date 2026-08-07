-- =====================================================================
-- 0031_crew_mobile_completion.sql
-- Southern Magnolia Movers — Crew Mobile V1 completion
-- Additive, forward-only. Uses existing crew_time_entries/job_checklists/
-- documents/job_photos tables. No historical backfill.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Shared authorization helper: managers may operate on any company job;
-- crew_lead/mover must be explicitly assigned through job_crew.
-- ---------------------------------------------------------------------
create or replace function public._crew_mobile_job_company(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_job_company uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select company_id, role::text into v_company, v_role
  from public.profiles
  where id = v_uid and is_active is true;

  if v_company is null or v_role not in ('owner','operations_manager','dispatcher','crew_lead','mover') then
    raise exception 'Not authorized for crew mobile';
  end if;

  select company_id into v_job_company from public.jobs where id = p_job_id;
  if v_job_company is null or v_job_company <> v_company then raise exception 'Job not found'; end if;

  if v_role in ('crew_lead','mover') and not exists (
    select 1 from public.job_crew jc
    where jc.job_id = p_job_id and jc.profile_id = v_uid
  ) then
    raise exception 'Job is not assigned to you';
  end if;

  return v_company;
end;
$$;
revoke all on function public._crew_mobile_job_company(uuid) from public, anon, authenticated, service_role;
alter function public._crew_mobile_job_company(uuid) owner to postgres;

-- ---------------------------------------------------------------------
-- Time clock — authenticated RPCs preserve auth.uid() for audit capture.
-- ---------------------------------------------------------------------
create or replace function public.crew_get_time_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_entry record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, role::text into v_company, v_role
  from public.profiles where id=v_uid and is_active is true;
  if v_company is null or v_role not in ('owner','operations_manager','dispatcher','crew_lead','mover') then
    raise exception 'Not authorized for crew mobile';
  end if;

  select id, job_id, clock_in_at, status::text
    into v_entry
  from public.crew_time_entries
  where company_id=v_company and profile_id=v_uid and clock_out_at is null
  order by clock_in_at desc limit 1;

  if v_entry.id is null then return jsonb_build_object('clocked_in',false); end if;
  return jsonb_build_object(
    'clocked_in',true,
    'time_entry_id',v_entry.id,
    'job_id',v_entry.job_id,
    'clock_in_at',v_entry.clock_in_at,
    'status',v_entry.status
  );
end;
$$;

create or replace function public.crew_clock_in(p_job_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_id uuid;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, role::text into v_company, v_role
  from public.profiles where id=v_uid and is_active is true;
  if v_company is null or v_role not in ('owner','operations_manager','dispatcher','crew_lead','mover') then
    raise exception 'Not authorized for crew mobile';
  end if;
  if p_job_id is not null then perform public._crew_mobile_job_company(p_job_id); end if;

  if exists(select 1 from public.crew_time_entries where profile_id=v_uid and clock_out_at is null) then
    raise exception 'Already clocked in';
  end if;

  insert into public.crew_time_entries(company_id,job_id,profile_id,status,clock_in_at)
  values(v_company,p_job_id,v_uid,'clocked_in'::public.time_entry_status,now())
  returning id,clock_in_at into v_id,v_at;

  return jsonb_build_object('clocked_in',true,'time_entry_id',v_id,'job_id',p_job_id,'clock_in_at',v_at);
end;
$$;

create or replace function public.crew_clock_out()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_job uuid;
  v_in timestamptz;
  v_out timestamptz := now();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select id,job_id,clock_in_at into v_id,v_job,v_in
  from public.crew_time_entries
  where profile_id=v_uid and clock_out_at is null
  order by clock_in_at desc limit 1 for update;
  if v_id is null then raise exception 'No active clock-in found'; end if;

  update public.crew_time_entries
  set status='clocked_out'::public.time_entry_status, clock_out_at=v_out, updated_at=v_out
  where id=v_id;

  return jsonb_build_object(
    'clocked_in',false,'time_entry_id',v_id,'job_id',v_job,
    'clock_in_at',v_in,'clock_out_at',v_out,
    'total_minutes',greatest(0,round(extract(epoch from (v_out-v_in))/60.0))
  );
end;
$$;

-- one open entry per crew member, enforced at DB level.
create unique index if not exists crew_time_entries_one_open_per_profile_uidx
  on public.crew_time_entries(profile_id) where clock_out_at is null;

-- ---------------------------------------------------------------------
-- Checklist — eight fixed V1 move-day items persisted per job.
-- ---------------------------------------------------------------------
create unique index if not exists job_checklists_job_title_uidx
  on public.job_checklists(job_id,title);
create index if not exists job_checklists_job_order_idx
  on public.job_checklists(job_id,sort_order,id);

create or replace function public.crew_prepare_checklist(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_uid uuid := auth.uid();
  v_items text[] := array[
    'Arrive at origin & confirm inventory',
    'Protect floors and doorways',
    'Wrap and pad all furniture',
    'Load truck & secure items',
    'Confirm destination address',
    'Unload & place items in rooms',
    'Walkthrough with customer',
    'Collect signature & payment'
  ];
  i int;
  v_result jsonb;
begin
  for i in 1..array_length(v_items,1) loop
    insert into public.job_checklists(company_id,job_id,title,is_completed,sort_order)
    values(v_company,p_job_id,v_items[i],false,i-1)
    on conflict (job_id,title) do nothing;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'is_completed',is_completed,
    'completed_by',completed_by,'completed_at',completed_at,'sort_order',sort_order
  ) order by sort_order,id),'[]'::jsonb)
  into v_result
  from public.job_checklists where job_id=p_job_id and company_id=v_company;
  return v_result;
end;
$$;

create or replace function public.crew_set_checklist_item(p_job_id uuid,p_item_id uuid,p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_uid uuid := auth.uid();
  v_row record;
begin
  update public.job_checklists
  set is_completed=p_completed,
      completed_by=case when p_completed then v_uid else null end,
      completed_at=case when p_completed then now() else null end
  where id=p_item_id and job_id=p_job_id and company_id=v_company
  returning id,title,is_completed,completed_by,completed_at,sort_order into v_row;
  if v_row.id is null then raise exception 'Checklist item not found'; end if;
  return jsonb_build_object(
    'id',v_row.id,'title',v_row.title,'is_completed',v_row.is_completed,
    'completed_by',v_row.completed_by,'completed_at',v_row.completed_at,'sort_order',v_row.sort_order
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Photos — client uploads bytes to private job-photos bucket; this RPC safely
-- registers metadata after validating assignment + exact tenant/job path.
-- ---------------------------------------------------------------------
create or replace function public.crew_photo_upload_context(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid := public._crew_mobile_job_company(p_job_id);
begin
  return jsonb_build_object('bucket','job-photos','path_prefix',v_company::text||'/'||p_job_id::text||'/');
end;
$$;

create or replace function public.crew_register_job_photo(
  p_job_id uuid,
  p_storage_path text,
  p_caption text default null,
  p_photo_stage text default null,
  p_mime_type text default 'image/jpeg',
  p_size_bytes bigint default null
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
  if p_photo_stage is not null and p_photo_stage not in ('before','during','after','damage','other') then
    raise exception 'Invalid photo stage';
  end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 15728640) then raise exception 'Photo too large'; end if;

  select customer_id into v_customer from public.jobs where id=p_job_id and company_id=v_company;

  insert into public.documents(company_id,customer_id,job_id,type,title,storage_path,mime_type,size_bytes,uploaded_by)
  values(v_company,v_customer,p_job_id,'photo'::public.document_type,
         coalesce(nullif(btrim(p_caption),''),'Job photo'),p_storage_path,p_mime_type,p_size_bytes,v_uid)
  returning id into v_doc;

  insert into public.job_photos(company_id,job_id,document_id,caption,photo_stage,taken_by,taken_at)
  values(v_company,p_job_id,v_doc,nullif(btrim(p_caption),''),p_photo_stage,v_uid,now())
  returning id into v_photo;

  return jsonb_build_object('document_id',v_doc,'job_photo_id',v_photo,'storage_path',p_storage_path);
end;
$$;

create or replace function public.crew_list_job_photos(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._crew_mobile_job_company(p_job_id);
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',jp.id,'document_id',jp.document_id,'caption',jp.caption,
    'photo_stage',jp.photo_stage,'taken_at',jp.taken_at,'taken_by',jp.taken_by,
    'storage_path',d.storage_path,'mime_type',d.mime_type,'size_bytes',d.size_bytes
  ) order by jp.taken_at desc),'[]'::jsonb)
  into v_result
  from public.job_photos jp
  left join public.documents d on d.id=jp.document_id
  where jp.job_id=p_job_id and jp.company_id=v_company;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Forward-only canonical activity for new crew actions.
-- ---------------------------------------------------------------------
create or replace function public._crew_mobile_activity_capture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name='crew_time_entries' then
    if tg_op='INSERT' then
      perform public._activity_write_forward(new.company_id,'crew.clocked_in','crew_time_entry',new.id::text,
        'Crew member clocked in',jsonb_build_object('job_id',new.job_id));
    elsif tg_op='UPDATE' and old.clock_out_at is null and new.clock_out_at is not null then
      perform public._activity_write_forward(new.company_id,'crew.clocked_out','crew_time_entry',new.id::text,
        'Crew member clocked out',jsonb_build_object('job_id',new.job_id,'clock_in_at',new.clock_in_at,'clock_out_at',new.clock_out_at));
    end if;
  elsif tg_table_name='job_checklists' then
    if tg_op='UPDATE' and old.is_completed is distinct from new.is_completed then
      perform public._activity_write_forward(new.company_id,
        case when new.is_completed then 'checklist.completed' else 'checklist.reopened' end,
        'job_checklist',new.id::text,
        case when new.is_completed then 'Crew completed checklist item' else 'Crew reopened checklist item' end,
        jsonb_build_object('job_id',new.job_id,'title',new.title));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._crew_mobile_activity_capture() from public, anon, authenticated, service_role;
alter function public._crew_mobile_activity_capture() owner to postgres;

create trigger activity_capture_crew_time_entries
after insert or update on public.crew_time_entries
for each row execute function public._crew_mobile_activity_capture();

create trigger activity_capture_job_checklists
after update on public.job_checklists
for each row execute function public._crew_mobile_activity_capture();

-- Client RPC grants only. Helpers/triggers remain uncallable.
revoke all on function public.crew_get_time_state() from public, anon, authenticated, service_role;
revoke all on function public.crew_clock_in(uuid) from public, anon, authenticated, service_role;
revoke all on function public.crew_clock_out() from public, anon, authenticated, service_role;
revoke all on function public.crew_prepare_checklist(uuid) from public, anon, authenticated, service_role;
revoke all on function public.crew_set_checklist_item(uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.crew_photo_upload_context(uuid) from public, anon, authenticated, service_role;
revoke all on function public.crew_register_job_photo(uuid,text,text,text,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.crew_list_job_photos(uuid) from public, anon, authenticated, service_role;

grant execute on function public.crew_get_time_state() to authenticated;
grant execute on function public.crew_clock_in(uuid) to authenticated;
grant execute on function public.crew_clock_out() to authenticated;
grant execute on function public.crew_prepare_checklist(uuid) to authenticated;
grant execute on function public.crew_set_checklist_item(uuid,uuid,boolean) to authenticated;
grant execute on function public.crew_photo_upload_context(uuid) to authenticated;
grant execute on function public.crew_register_job_photo(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.crew_list_job_photos(uuid) to authenticated;

commit;
