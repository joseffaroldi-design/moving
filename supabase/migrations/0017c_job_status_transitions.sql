-- =====================================================================
-- 0017c_job_status_transitions.sql
-- Southern Magnolia Movers — Phase 6 job lifecycle transitions.
--
-- jobs.status (job_status enum) has NO client write path after 0016a
-- (authenticated = SELECT only, RLS forced). This adds the ONLY sanctioned
-- way to advance a job's lifecycle: a SECURITY DEFINER RPC that derives the
-- company + actor server-side, enforces roles, and enforces a strict legal
-- transition matrix. Mirrors the quotes/jobs RPC security model.
--
-- Roles allowed to set status: owner, operations_manager, dispatcher
-- (sales excluded).
--
-- Legal transitions (job_status = scheduled|confirmed|in_progress|completed|cancelled):
--   scheduled    -> confirmed | cancelled
--   confirmed    -> in_progress | cancelled
--   in_progress  -> completed | cancelled
--   completed    -> (terminal)
--   cancelled    -> (terminal)
--   same status  -> idempotent success (NO write)
--   anything else (backward / skipped stage / out of terminal) -> rejected
--
-- NOTE: job_status_events.status is dispatch_status (operational timeline),
-- NOT the 5-value lifecycle — so this migration does NOT write to it. A
-- lifecycle audit trail can be added with the activity-log phase. (No p_note
-- param: there is currently no lifecycle-note sink, so we omit a no-op arg.)
--
-- Transactional. No table/column/enum/row changes. postgres/service_role
-- untouched.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Internal authz guard (active caller + role)
-- ---------------------------------------------------------------------
create or replace function public._require_job_status_setter()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_active  boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, is_active into v_company, v_active
    from public.profiles where id = v_uid;
  if v_company is null then raise exception 'No company associated with your account'; end if;
  if v_active is not true then raise exception 'Caller account is not active'; end if;
  if not public.has_company_role(
       v_company,
       array['owner','operations_manager','dispatcher']::public.user_role[]) then
    raise exception 'Insufficient privileges to change job status';
  end if;
  return v_company;
end;
$$;

revoke execute on function public._require_job_status_setter() from public;
revoke execute on function public._require_job_status_setter() from anon;
revoke execute on function public._require_job_status_setter() from authenticated;

-- ---------------------------------------------------------------------
-- 2. set_job_status — the single client RPC
-- ---------------------------------------------------------------------
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
begin
  select company_id, status into v_jc, v_current
    from public.jobs where id = p_job_id;
  if v_jc is null then raise exception 'Job not found'; end if;
  if v_jc <> v_company then raise exception 'Job does not belong to your company'; end if;

  -- Idempotent: same status -> success, no write.
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
     set status = p_status, updated_at = now()
   where id = p_job_id;

  return json_build_object('job_id', p_job_id, 'status', p_status, 'changed', true);
end;
$$;

revoke execute on function public.set_job_status(uuid, public.job_status) from public;
revoke execute on function public.set_job_status(uuid, public.job_status) from anon;
grant  execute on function public.set_job_status(uuid, public.job_status) to authenticated;

commit;
