-- =====================================================================
-- 0004_owner_role.sql  (DEFERRED — do NOT run yet)
-- One-time owner assignment for smagnoliamoving@gmail.com.
--
-- Prerequisites (in order):
--   1. Run 0001_security_lockdown.sql.
--   2. Create the auth user smagnoliamoving@gmail.com (Supabase Dashboard ->
--      Authentication -> Add user, since public signups are OFF) and confirm
--      the email. The 0001 signup trigger auto-creates its profile as role
--      'customer' with company_id NULL.
--   3. THEN run this file to promote that profile to owner + attach company.
--
-- SAFE: affects only the matching account. Fails loudly if it does not exist.
-- Never creates a duplicate company (references the existing company id).
-- =====================================================================

do $$
declare
  v_uid uuid;
  v_company constant uuid := 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';  -- MoveOps Demo Company
begin
  select id into v_uid
    from auth.users
   where lower(email) = lower('smagnoliamoving@gmail.com')
   limit 1;

  if v_uid is null then
    raise exception
      'Owner auth user not found. Create + confirm smagnoliamoving@gmail.com first, then re-run.';
  end if;

  insert into public.profiles (id, company_id, role, is_active)
  values (v_uid, v_company, 'owner'::public.user_role, true)
  on conflict (id) do update
     set company_id = excluded.company_id,
         role       = excluded.role,
         is_active  = true,
         updated_at = now();

  raise notice 'Owner role assigned to smagnoliamoving@gmail.com (uid %, company %).', v_uid, v_company;
end $$;
