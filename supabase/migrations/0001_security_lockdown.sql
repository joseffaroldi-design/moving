-- =====================================================================
-- 0001_security_lockdown.sql
-- Southern Magnolia Movers — Phase 0: security containment (RUN FIRST).
--
-- Closes active privilege-escalation vectors on public.profiles:
--   (a) authenticated has table-level UPDATE on EVERY column (incl. role,
--       company_id, is_active) combined with profiles_self_update
--       (id = auth.uid()) -> any user can self-promote to owner.
--   (b) create_owner_profile_for_current_user is SECURITY DEFINER and
--       browser-callable -> any user can self-assign role=owner.
--
-- Properties: transactional, idempotent-where-practical, additive except the
-- required privilege revocations, non-destructive to existing rows, fully
-- schema-qualified, no secrets, compatible with public.user_role + current RLS.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Lock down the unsafe owner RPC.
--    Revoke EXECUTE from every client-reachable role, across ALL overloads.
--    The function BODY is intentionally NOT dropped (other DB objects may
--    reference it); it simply becomes non-callable from the browser.
--    Frontend call at AuthProvider.tsx is removed in application code.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_owner_profile_for_current_user'
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Restrict public.profiles table privileges.
--    Strip everything from anon/public; strip risky privileges from
--    authenticated; grant back only the minimum needed.
-- ---------------------------------------------------------------------
revoke all on table public.profiles from anon;
revoke all on table public.profiles from public;

revoke delete, truncate, trigger, references, insert, update
  on table public.profiles from authenticated;

-- SELECT remains (row visibility still enforced by profiles_member_select RLS).
grant select on table public.profiles to authenticated;

-- Column-scoped UPDATE: ONLY self-service display fields.
-- Combined with the existing profiles_self_update policy (id = auth.uid()),
-- a user may update ONLY their own full_name / phone / avatar_url.
-- id, company_id, role, is_active, created_at, updated_at are no longer
-- updatable by the authenticated role at all.
grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;

-- NOTE: authenticated intentionally has NO table-level INSERT. Ordinary users
-- therefore cannot insert a profile row (cannot choose their own id / role /
-- company_id / is_active). New profiles are created only by the SECURITY
-- DEFINER signup trigger (section 4); privileged changes go through the
-- admin RPC (section 5). The existing profiles_manager_insert policy remains
-- defined but is inert for direct client inserts without INSERT privilege.

-- ---------------------------------------------------------------------
-- 3. Preserve safe self-service editing.
--    No policy is dropped or weakened. profiles_self_update stays as-is;
--    section 2's column grants now constrain what it can actually change.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. Safe signup synchronization trigger on auth.users.
--    Creates a profile ONLY when one does not exist. Hardcodes role=customer,
--    company_id=NULL, is_active=true. Copies ONLY safe display info
--    (full_name). NEVER reads role/company_id/authorization from metadata.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, company_id, is_active, full_name)
  values (
    new.id,
    'customer'::public.user_role,                          -- hardcoded, never from metadata
    null,                                                  -- company assigned via trusted workflow
    true,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')  -- safe display only
  )
  on conflict (id) do nothing;                             -- never overwrite an existing profile
  return new;
end;
$$;

-- Trigger-only function: remove all client EXECUTE.
revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.handle_new_auth_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 5. Secure administrative role-management RPC.
--    The ONLY sanctioned path to change a role now that direct UPDATE on
--    role is revoked. All authorization is enforced INSIDE the function.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_profile_role(
  target_user_id uuid,
  new_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id      uuid := auth.uid();
  caller_role    public.user_role;
  caller_company uuid;
  caller_active  boolean;
  target_role    public.user_role;
  target_company uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select role, company_id, is_active
    into caller_role, caller_company, caller_active
    from public.profiles where id = caller_id;

  if caller_role is null then
    raise exception 'Caller has no profile';
  end if;
  if caller_active is not true then
    raise exception 'Caller account is not active';
  end if;
  if caller_id = target_user_id then
    raise exception 'You cannot change your own role';
  end if;
  if caller_role not in ('owner', 'operations_manager') then
    raise exception 'Insufficient privileges';
  end if;

  select role, company_id
    into target_role, target_company
    from public.profiles where id = target_user_id;
  if target_role is null then
    raise exception 'Target profile not found';
  end if;

  -- Same-company only; caller must belong to a company.
  if caller_company is null or target_company is distinct from caller_company then
    raise exception 'Cross-company role changes are not permitted';
  end if;

  -- operations_manager may neither grant nor remove the owner role.
  if caller_role = 'operations_manager'
     and (new_role = 'owner' or target_role = 'owner') then
    raise exception 'Only an owner may assign or remove the owner role';
  end if;

  -- new_role is already constrained to valid labels by the enum type.
  update public.profiles
     set role = new_role,
         updated_at = now()
   where id = target_user_id;

  -- TODO(Phase 10): insert an activity_log row here once that table exists,
  -- capturing (actor=caller_id, action='role_change', target=target_user_id,
  -- old_role=target_role, new_role=new_role, at=now()).
end;
$$;

revoke execute on function public.admin_set_profile_role(uuid, public.user_role) from public;
revoke execute on function public.admin_set_profile_role(uuid, public.user_role) from anon;
grant  execute on function public.admin_set_profile_role(uuid, public.user_role) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Ensure RLS helper functions remain executable for policy evaluation.
--    can_manage_company / is_company_member are SECURITY DEFINER with
--    search_path pinned to public. Grant EXECUTE to authenticated (all
--    overloads) so profiles policies continue to evaluate. These functions
--    only READ authorization state; they do not mutate privileged data.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('can_manage_company', 'is_company_member')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;
