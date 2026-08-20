-- Southern Magnolia V1.0 release guard.
-- Keep crew move completion safe without expanding Phase 4 scope.

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
  v_unsigned_required_doc_count int;
  v_completion_doc_count int;
  v_completion_signed_count int;
  v_reasons jsonb := '[]'::jsonb;
begin
  select count(*), count(*) filter (where not is_completed)
    into v_checklist_total, v_checklist_incomplete
  from public.job_checklists
  where company_id = v_company and job_id = p_job_id;

  select count(*) into v_active_clock_count
  from public.crew_time_entries
  where company_id = v_company and job_id = p_job_id and clock_out_at is null;

  select count(*) filter (
    where not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.status::text = 'signed'
    )
  ) into v_unsigned_required_doc_count
  from public.documents d
  where d.company_id = v_company and d.job_id = p_job_id
    and d.lifecycle_status = 'finalized' and d.signature_required = true;

  select count(*), count(*) filter (
    where exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.status::text = 'signed'
    )
  ) into v_completion_doc_count, v_completion_signed_count
  from public.documents d
  where d.company_id = v_company and d.job_id = p_job_id
    and d.lifecycle_status = 'finalized'
    and d.document_key = 'completion_acknowledgment'
    and d.signature_required = true;

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
    'ready', jsonb_array_length(v_reasons) = 0,
    'reasons', v_reasons,
    'checklist_total', v_checklist_total,
    'checklist_incomplete', v_checklist_incomplete,
    'active_clock_count', v_active_clock_count,
    'unsigned_required_document_count', v_unsigned_required_doc_count,
    'completion_acknowledgment_present', v_completion_doc_count > 0,
    'completion_acknowledgment_signed', v_completion_signed_count > 0
  );
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
  v_readiness jsonb;
  v_event_id uuid;
begin
  select role::text into v_role
  from public.profiles
  where id = v_uid and is_active is true;

  if p_status::text not in ('assigned','en_route','arrived','loading','in_transit','unloading','completed','issue') then
    raise exception 'Unsupported move-day status';
  end if;

  if p_status = 'completed'::public.dispatch_status then
    if v_role <> 'crew_lead' then
      raise exception 'Only the crew lead can complete a move';
    end if;
    v_readiness := public.crew_move_day_readiness(p_job_id);
    if not coalesce((v_readiness->>'ready')::boolean, false) then
      raise exception 'Move cannot be completed: %',
        array_to_string(array(select jsonb_array_elements_text(v_readiness->'reasons')), '; ');
    end if;
  end if;

  insert into public.job_status_events(company_id, job_id, status, note, latitude, longitude, created_by)
  values(v_company, p_job_id, p_status, nullif(btrim(coalesce(p_note,'')),''), p_latitude, p_longitude, v_uid)
  returning id into v_event_id;

  update public.dispatch_assignments
  set status = p_status, updated_at = now()
  where company_id = v_company and job_id = p_job_id;

  if p_status in ('loading'::public.dispatch_status,'in_transit'::public.dispatch_status,'unloading'::public.dispatch_status) then
    update public.jobs
    set status = 'in_progress'::public.job_status, updated_at = now()
    where id = p_job_id and company_id = v_company
      and status in ('scheduled'::public.job_status,'confirmed'::public.job_status,'in_progress'::public.job_status);
  elsif p_status = 'completed'::public.dispatch_status then
    update public.jobs
    set status = 'completed'::public.job_status, updated_at = now()
    where id = p_job_id and company_id = v_company;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'job_id', p_job_id,
    'status', p_status::text,
    'readiness', v_readiness
  );
end;
$$;

revoke all on function public.crew_move_day_readiness(uuid) from public, anon;
revoke all on function public.crew_set_move_day_status(uuid,public.dispatch_status,text,numeric,numeric) from public, anon;
grant execute on function public.crew_move_day_readiness(uuid) to authenticated;
grant execute on function public.crew_set_move_day_status(uuid,public.dispatch_status,text,numeric,numeric) to authenticated;
