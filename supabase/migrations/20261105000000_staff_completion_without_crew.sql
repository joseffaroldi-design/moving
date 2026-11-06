-- Staff can complete a job without adopting crew mobile tracking.
-- Crew-led completion keeps its own readiness rules when that optional path is used.
-- Preserve tenant checks, legal transitions, and the invoice trigger.
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
  v_jc uuid;
  v_current public.job_status;
  v_allowed boolean;
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

  update public.jobs
     set status = p_status,
         updated_at = now()
   where id = p_job_id;

  -- _sync_lifecycle_integrity still creates a draft invoice on completion.
  return json_build_object(
    'job_id', p_job_id,
    'status', p_status,
    'changed', true,
    'readiness', null
  );
end;
$$;

alter function public.set_job_status(uuid,public.job_status) owner to postgres;
revoke all on function public.set_job_status(uuid,public.job_status) from public, anon, service_role;
grant execute on function public.set_job_status(uuid,public.job_status) to authenticated;
