-- =====================================================================
-- 0032_staff_management.sql
-- Southern Magnolia Movers — safe staff activation/deactivation RPC.
-- Role changes continue through admin_set_profile_role().
-- =====================================================================

begin;

create or replace function public.admin_set_profile_active(
  target_user_id uuid,
  active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.user_role;
  caller_company uuid;
  caller_active boolean;
  target_role public.user_role;
  target_company uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select role, company_id, is_active
    into caller_role, caller_company, caller_active
  from public.profiles
  where id = caller_id;

  if caller_role is null or caller_active is not true then
    raise exception 'Caller is not an active staff member';
  end if;

  if caller_role not in ('owner','operations_manager') then
    raise exception 'Insufficient privileges';
  end if;

  if caller_id = target_user_id then
    raise exception 'You cannot change your own active status';
  end if;

  select role, company_id
    into target_role, target_company
  from public.profiles
  where id = target_user_id;

  if target_role is null then
    raise exception 'Target profile not found';
  end if;

  if caller_company is null or target_company is distinct from caller_company then
    raise exception 'Cross-company changes are not permitted';
  end if;

  if caller_role = 'operations_manager' and target_role = 'owner' then
    raise exception 'Only an owner may activate or deactivate an owner';
  end if;

  update public.profiles
  set is_active = active, updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_profile_active(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_profile_active(uuid,boolean) to authenticated;
alter function public.admin_set_profile_active(uuid,boolean) owner to postgres;

-- Cover common company/team lookups used throughout dashboard + crew mobile.
create index if not exists profiles_company_id_idx on public.profiles(company_id);
create index if not exists job_crew_profile_id_idx on public.job_crew(profile_id);
create index if not exists lead_notes_author_id_idx on public.lead_notes(author_id);

commit;
