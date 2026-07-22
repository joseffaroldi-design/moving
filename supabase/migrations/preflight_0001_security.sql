-- preflight_0001_security.sql
-- READ-ONLY security preflight. NO writes, NO DDL, NO grants.
-- Run in the Supabase SQL Editor and paste back the single JSON result.
-- Purpose: verify column-level privileges + trusted function internals BEFORE
-- authoring 0001. This lets us lock role/company_id/is_active from self-edit and
-- confirm can_manage_company / is_company_member / create_owner_profile_for_current_user
-- are safe (SECURITY DEFINER + pinned search_path) before relying on them.

select json_build_object(

  -- 1. Table-level privileges held by the authenticated role on public.profiles
  'profiles_table_grants', (
    select coalesce(json_agg(privilege_type order by privilege_type), '[]'::json)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name  = 'profiles'
      and grantee     = 'authenticated'
  ),

  -- 2. Column-level UPDATE grants for authenticated on public.profiles.
  --    If this list is NON-EMPTY, updatable columns are already restricted to
  --    exactly these columns. If EMPTY, the table-level UPDATE (if present)
  --    applies to ALL columns -> role/company_id/is_active are self-editable.
  'profiles_column_update_grants', (
    select coalesce(json_agg(column_name order by column_name), '[]'::json)
    from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name  = 'profiles'
      and grantee     = 'authenticated'
      and privilege_type = 'UPDATE'
  ),

  -- 2b. All column-level grants (any privilege) for full visibility
  'profiles_all_column_grants', (
    select coalesce(json_agg(json_build_object(
      'column', column_name, 'privilege', privilege_type) order by column_name), '[]'::json)
    from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name  = 'profiles'
      and grantee     = 'authenticated'
  ),

  -- 3. Trusted function internals: definition, security mode, owner, search_path config
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name',        p.proname,
      'owner',       pg_get_userbyid(p.proowner),
      'security',    case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
      'config',      p.proconfig,               -- e.g. ["search_path=public"] if pinned
      'arg_types',   pg_get_function_identity_arguments(p.oid),
      'definition',  pg_get_functiondef(p.oid)
    ) order by p.proname), '[]'::json)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'can_manage_company',
        'is_company_member',
        'create_owner_profile_for_current_user'
      )
  ),

  -- 4. EXECUTE grants on those functions
  'function_grants', (
    select coalesce(json_agg(json_build_object(
      'name', routine_name, 'grantee', grantee, 'privilege', privilege_type)), '[]'::json)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'can_manage_company',
        'is_company_member',
        'create_owner_profile_for_current_user'
      )
  ),

  -- 5. Existing companies (safe fields only) to connect the owner correctly
  'companies', (
    select coalesce(json_agg(json_build_object('id', id, 'name', name) order by name), '[]'::json)
    from public.companies
  )

) as security_preflight;
