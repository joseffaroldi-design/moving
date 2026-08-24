-- Southern Magnolia Movers — move completion orchestration integrity
-- Ensures every supported completion path enforces readiness and generates the
-- draft invoice through the same database lifecycle, including crew completion.

begin;

create or replace function public._sync_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'quotes' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
      return new;
    end if;

    if new.lead_id is null then
      return new;
    end if;

    if new.status::text in ('sent','viewed','accepted') then
      update public.leads
         set status = 'quoted'::public.lead_status,
             updated_at = now()
       where id = new.lead_id
         and company_id = new.company_id
         and status in (
           'new'::public.lead_status,
           'contacted'::public.lead_status,
           'qualified'::public.lead_status
         );
    elsif new.status::text = 'converted' then
      update public.leads
         set status = 'booked'::public.lead_status,
             updated_at = now()
       where id = new.lead_id
         and company_id = new.company_id
         and status <> 'booked'::public.lead_status;
    end if;

    return new;
  end if;

  if tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
      return new;
    end if;

    if new.status::text = 'completed' then
      -- Completion is an unambiguous terminal operational state. Converge the
      -- dispatch record no matter whether completion came from staff or crew.
      update public.dispatch_assignments
         set status = 'completed'::public.dispatch_status,
             updated_at = now()
       where company_id = new.company_id
         and job_id = new.id
         and status <> 'completed'::public.dispatch_status;

      -- Invoice creation is idempotent. Centralizing it here means crew-driven
      -- completion and staff-driven completion produce the same financial handoff.
      begin
        perform public._create_draft_invoice_for_job(new.company_id, new.id);
      exception when others then
        -- Move completion should never strand a field crew because of a finance
        -- generation failure. Existing observability/activity remains intact and
        -- staff can call generate_invoice_for_job() idempotently to recover.
        raise notice 'Draft invoice auto-create skipped for job %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end if;

  return new;
end;
$$;

alter function public._sync_lifecycle_integrity() owner to postgres;
revoke all on function public._sync_lifecycle_integrity() from public, anon, authenticated, service_role;

create or replace function public.set_job_status(
  p_job_id uuid,
  p_status public.job_status
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid := public._require_job_status_setter();
  v_jc      uuid;
  v_current public.job_status;
  v_allowed boolean;
  v_readiness jsonb;
begin
  select company_id, status into v_jc, v_current
  from public.jobs
  where id = p_job_id;

  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  if v_current = p_status then
    return json_build_object('job_id', p_job_id, 'status', v_current, 'changed', false);
  end if;

  v_allowed :=
       (v_current = 'scheduled'   and p_status in ('confirmed','cancelled'))
    or (v_current = 'confirmed'   and p_status in ('in_progress','cancelled'))
    or (v_current = 'in_progress' and p_status in ('completed','cancelled'));

  if not v_allowed then
    raise exception 'Illegal job status transition: % -> %', v_current, p_status;
  end if;

  -- Staff and crew now share the same completion gate. This prevents a staff
  -- status change from bypassing checklist, clock-out, and signed completion
  -- document requirements that the crew workflow already enforces.
  if p_status = 'completed'::public.job_status then
    v_readiness := public.crew_move_day_readiness(p_job_id);
    if not coalesce((v_readiness->>'ready')::boolean, false) then
      raise exception 'Move cannot be completed: %',
        array_to_string(
          array(select jsonb_array_elements_text(v_readiness->'reasons')),
          '; '
        );
    end if;
  end if;

  update public.jobs
     set status = p_status,
         updated_at = now()
   where id = p_job_id;

  -- Draft invoice creation is now handled by the lifecycle-integrity trigger so
  -- every legitimate completion path gets the same idempotent behavior.
  return json_build_object(
    'job_id', p_job_id,
    'status', p_status,
    'changed', true,
    'readiness', v_readiness
  );
end;
$$;

alter function public.set_job_status(uuid,public.job_status) owner to postgres;
revoke all on function public.set_job_status(uuid,public.job_status) from public, anon, service_role;
grant execute on function public.set_job_status(uuid,public.job_status) to authenticated;

commit;
