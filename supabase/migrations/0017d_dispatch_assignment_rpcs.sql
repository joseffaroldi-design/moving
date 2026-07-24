-- =====================================================================
-- 0017d_dispatch_assignment_rpcs.sql
-- Southern Magnolia Movers — Phase 6 dispatch assignment RPC surface.
--
-- All dispatch tables are locked (0017a/0017b: authenticated = SELECT only,
-- RLS forced). This adds the ONLY sanctioned write path, as SECURITY DEFINER
-- RPCs that derive company + actor server-side and enforce roles
-- {owner, operations_manager, dispatcher}.
--
-- Division of responsibility (agreed):
--   * dispatch_assignments = source of truth for the dispatch day, route
--     order, time window, dispatch status, crew LEAD and PRIMARY truck.
--   * job_crew  = full crew roster.
--   * job_trucks = full truck list.
--
-- CONFLICTS (HARD BLOCK, no override): a primary truck or crew lead may not
-- be double-booked on the same dispatch day. If both assignments have full
-- time windows, only overlapping windows conflict; if EITHER side lacks a
-- full window, any other same-day booking of that resource conflicts. Errors
-- name the conflicting resource + job.
--
-- ATOMIC SYNC (no drift, same transaction): setting crew_lead_id ensures that
-- profile exists in job_crew as 'crew_lead'; setting the primary truck_id
-- ensures that truck exists in job_trucks. The roster/truck-list RPCs remain
-- the source of truth for all ADDITIONAL crew/trucks and re-assert any
-- assigned lead/primary truck so they cannot be dropped.
--
-- Transactional. No table/column/enum changes. postgres/service_role untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Internal authz guard
-- ---------------------------------------------------------------------
create or replace function public._require_dispatcher()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; v_active boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, is_active into v_company, v_active
    from public.profiles where id = v_uid;
  if v_company is null then raise exception 'No company associated with your account'; end if;
  if v_active is not true then raise exception 'Caller account is not active'; end if;
  if not public.has_company_role(
       v_company, array['owner','operations_manager','dispatcher']::public.user_role[]) then
    raise exception 'Insufficient privileges for dispatch operations';
  end if;
  return v_company;
end;
$$;

revoke execute on function public._require_dispatcher() from public;
revoke execute on function public._require_dispatcher() from anon;
revoke execute on function public._require_dispatcher() from authenticated;

-- ---------------------------------------------------------------------
-- 2. assign_job_to_dispatch — upsert the day-board assignment
-- ---------------------------------------------------------------------
create or replace function public.assign_job_to_dispatch(
  p_job_id          uuid,
  p_dispatch_date   date,
  p_truck_id        uuid        default null,
  p_crew_lead_id    uuid        default null,
  p_start_window    timestamptz default null,
  p_end_window      timestamptz default null,
  p_route_order     integer     default null,
  p_dispatcher_notes text       default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_company    uuid := public._require_dispatcher();
  v_jc         uuid;
  v_day        uuid;
  v_assignment uuid;
  v_tc uuid; v_ta boolean;
  v_pc uuid; v_pa boolean;
  v_conf_num text; v_name text;
begin
  if p_dispatch_date is null then raise exception 'dispatch_date is required'; end if;

  select company_id into v_jc from public.jobs where id = p_job_id;
  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  if p_start_window is not null and p_end_window is not null
     and p_end_window <= p_start_window then
    raise exception 'end_window must be after start_window';
  end if;

  -- Validate primary truck (company + active).
  if p_truck_id is not null then
    select company_id, is_active into v_tc, v_ta from public.trucks where id = p_truck_id;
    if v_tc is null then raise exception 'Truck not found'; end if;
    if v_tc <> v_company then raise exception 'Truck does not belong to your company'; end if;
    if v_ta is not true then raise exception 'Truck is not active'; end if;
  end if;

  -- Validate crew lead (company + active).
  if p_crew_lead_id is not null then
    select company_id, is_active into v_pc, v_pa from public.profiles where id = p_crew_lead_id;
    if v_pc is null then raise exception 'Crew lead profile not found'; end if;
    if v_pc <> v_company then raise exception 'Crew lead does not belong to your company'; end if;
    if v_pa is not true then raise exception 'Crew lead account is not active'; end if;
  end if;

  -- Get-or-create the dispatch day (advisory lock guards UNIQUE(company,date)).
  perform pg_advisory_xact_lock(hashtext('dispatch_day:'||v_company::text||':'||p_dispatch_date::text));
  select id into v_day from public.dispatch_days
    where company_id = v_company and dispatch_date = p_dispatch_date;
  if v_day is null then
    insert into public.dispatch_days (company_id, dispatch_date)
    values (v_company, p_dispatch_date)
    returning id into v_day;
  end if;

  -- HARD-BLOCK: primary truck double-booked on this day.
  if p_truck_id is not null then
    select j.job_number into v_conf_num
    from public.dispatch_assignments a
    join public.jobs j on j.id = a.job_id
    where a.dispatch_day_id = v_day
      and a.job_id <> p_job_id
      and a.truck_id = p_truck_id
      and ( p_start_window is null or p_end_window is null
         or a.start_window is null or a.end_window is null
         or (p_start_window < a.end_window and a.start_window < p_end_window) )
    limit 1;
    if v_conf_num is not null then
      select name into v_name from public.trucks where id = p_truck_id;
      raise exception 'Truck "%" is already booked on % for job % (time conflict).',
        coalesce(v_name,'?'), p_dispatch_date, v_conf_num;
    end if;
  end if;

  -- HARD-BLOCK: crew lead double-booked on this day.
  if p_crew_lead_id is not null then
    select j.job_number into v_conf_num
    from public.dispatch_assignments a
    join public.jobs j on j.id = a.job_id
    where a.dispatch_day_id = v_day
      and a.job_id <> p_job_id
      and a.crew_lead_id = p_crew_lead_id
      and ( p_start_window is null or p_end_window is null
         or a.start_window is null or a.end_window is null
         or (p_start_window < a.end_window and a.start_window < p_end_window) )
    limit 1;
    if v_conf_num is not null then
      select full_name into v_name from public.profiles where id = p_crew_lead_id;
      raise exception 'Crew lead "%" is already booked on % for job % (time conflict).',
        coalesce(v_name,'?'), p_dispatch_date, v_conf_num;
    end if;
  end if;

  -- Upsert the assignment (source of truth for day/route/window/status/lead/primary truck).
  insert into public.dispatch_assignments (
    company_id, dispatch_day_id, job_id, truck_id, crew_lead_id, status,
    start_window, end_window, route_order, dispatcher_notes, created_by
  ) values (
    v_company, v_day, p_job_id, p_truck_id, p_crew_lead_id, 'assigned',
    p_start_window, p_end_window, coalesce(p_route_order, 0), p_dispatcher_notes, v_uid
  )
  on conflict (dispatch_day_id, job_id) do update
    set truck_id         = excluded.truck_id,
        crew_lead_id     = excluded.crew_lead_id,
        status           = case when dispatch_assignments.status = 'unassigned'
                                then 'assigned'::public.dispatch_status
                                else dispatch_assignments.status end,
        start_window     = excluded.start_window,
        end_window       = excluded.end_window,
        route_order      = excluded.route_order,
        dispatcher_notes = excluded.dispatcher_notes,
        updated_at       = now()
  returning id into v_assignment;

  -- ATOMIC SYNC (no drift).
  if p_crew_lead_id is not null then
    insert into public.job_crew (job_id, profile_id, role)
    values (p_job_id, p_crew_lead_id, 'crew_lead')
    on conflict (job_id, profile_id) do update set role = 'crew_lead';
  end if;
  if p_truck_id is not null then
    insert into public.job_trucks (job_id, truck_id)
    values (p_job_id, p_truck_id)
    on conflict do nothing;
  end if;

  return json_build_object(
    'assignment_id', v_assignment, 'dispatch_day_id', v_day,
    'job_id', p_job_id, 'dispatch_date', p_dispatch_date, 'status', 'assigned');
end;
$$;

-- ---------------------------------------------------------------------
-- 3. set_job_crew — replace the full roster (re-asserts assigned leads)
-- ---------------------------------------------------------------------
create or replace function public.set_job_crew(p_job_id uuid, p_members jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._require_dispatcher();
  v_jc uuid; elem jsonb; v_pid uuid; v_pc uuid; v_pa boolean; v_count int;
begin
  select company_id into v_jc from public.jobs where id = p_job_id;
  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception 'members must be a JSON array';
  end if;

  for elem in select value from jsonb_array_elements(p_members) loop
    if jsonb_typeof(elem) <> 'object' then raise exception 'Each crew member must be a JSON object'; end if;
    begin v_pid := (elem->>'profile_id')::uuid; exception when others then
      raise exception 'Each crew member needs a valid profile_id'; end;
    if v_pid is null then raise exception 'Each crew member needs a profile_id'; end if;
    if (elem ? 'role') and coalesce(elem->>'role','') <> '' then
      perform (elem->>'role')::public.user_role;  -- validity check (raises if invalid)
    end if;
    select company_id, is_active into v_pc, v_pa from public.profiles where id = v_pid;
    if v_pc is null then raise exception 'Crew profile % not found', v_pid; end if;
    if v_pc <> v_company then raise exception 'Crew profile % does not belong to your company', v_pid; end if;
    if v_pa is not true then raise exception 'Crew profile % is not active', v_pid; end if;
  end loop;

  delete from public.job_crew where job_id = p_job_id;

  insert into public.job_crew (job_id, profile_id, role)
  select p_job_id, (e->>'profile_id')::uuid,
         coalesce(nullif(e->>'role','')::public.user_role, 'mover'::public.user_role)
  from jsonb_array_elements(p_members) e
  on conflict (job_id, profile_id) do update set role = excluded.role;

  -- Re-assert any assigned crew lead(s) so the roster cannot drift.
  insert into public.job_crew (job_id, profile_id, role)
  select da.job_id, da.crew_lead_id, 'crew_lead'
  from public.dispatch_assignments da
  where da.job_id = p_job_id and da.crew_lead_id is not null
  on conflict (job_id, profile_id) do update set role = 'crew_lead';

  select count(*) into v_count from public.job_crew where job_id = p_job_id;
  return json_build_object('job_id', p_job_id, 'crew_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. set_job_trucks — replace the full truck list (re-asserts primaries)
-- ---------------------------------------------------------------------
create or replace function public.set_job_trucks(p_job_id uuid, p_truck_ids uuid[])
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._require_dispatcher();
  v_jc uuid; v_tid uuid; v_tc uuid; v_ta boolean; v_count int;
  v_ids uuid[] := coalesce(p_truck_ids, '{}'::uuid[]);
begin
  select company_id into v_jc from public.jobs where id = p_job_id;
  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  foreach v_tid in array v_ids loop
    select company_id, is_active into v_tc, v_ta from public.trucks where id = v_tid;
    if v_tc is null then raise exception 'Truck % not found', v_tid; end if;
    if v_tc <> v_company then raise exception 'Truck % does not belong to your company', v_tid; end if;
    if v_ta is not true then raise exception 'Truck % is not active', v_tid; end if;
  end loop;

  delete from public.job_trucks where job_id = p_job_id;

  if array_length(v_ids, 1) is not null then
    insert into public.job_trucks (job_id, truck_id)
    select p_job_id, t from unnest(v_ids) as t
    on conflict do nothing;
  end if;

  -- Re-assert any primary truck(s) from dispatch assignments so the list cannot drift.
  insert into public.job_trucks (job_id, truck_id)
  select da.job_id, da.truck_id
  from public.dispatch_assignments da
  where da.job_id = p_job_id and da.truck_id is not null
  on conflict do nothing;

  select count(*) into v_count from public.job_trucks where job_id = p_job_id;
  return json_build_object('job_id', p_job_id, 'truck_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. EXECUTE GRANTS — clients get the 3 RPCs only.
-- ---------------------------------------------------------------------
revoke execute on function public.assign_job_to_dispatch(uuid,date,uuid,uuid,timestamptz,timestamptz,integer,text) from public;
revoke execute on function public.assign_job_to_dispatch(uuid,date,uuid,uuid,timestamptz,timestamptz,integer,text) from anon;
grant  execute on function public.assign_job_to_dispatch(uuid,date,uuid,uuid,timestamptz,timestamptz,integer,text) to authenticated;

revoke execute on function public.set_job_crew(uuid,jsonb)     from public;
revoke execute on function public.set_job_crew(uuid,jsonb)     from anon;
grant  execute on function public.set_job_crew(uuid,jsonb)     to authenticated;

revoke execute on function public.set_job_trucks(uuid,uuid[])  from public;
revoke execute on function public.set_job_trucks(uuid,uuid[])  from anon;
grant  execute on function public.set_job_trucks(uuid,uuid[])  to authenticated;

commit;
