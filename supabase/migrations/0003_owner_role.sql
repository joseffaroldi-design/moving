-- 0003_owner_role.sql
-- Phase 2 — Promote the Southern Magnolia Movers owner account.
-- RUN THIS ONLY AFTER the owner has signed up AND confirmed their email,
-- and after logging in once (which creates their public.profiles row).
-- SAFE: UPDATE only. Does not delete or overwrite other records.

do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users
   where lower(email) = lower('smagnoliamoving@gmail.com')
   limit 1;

  if v_uid is null then
    raise notice 'Owner auth user not found yet. Sign up + confirm smagnoliamoving@gmail.com first, then re-run.';
    return;
  end if;

  -- Ensure a profile row exists (id references auth.users).
  insert into public.profiles (id)
  values (v_uid)
  on conflict (id) do nothing;

  update public.profiles
     set role = 'owner'
   where id = v_uid;

  raise notice 'Owner role assigned to smagnoliamoving@gmail.com (uid %).', v_uid;
end $$;
