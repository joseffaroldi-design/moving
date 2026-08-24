-- Southern Magnolia Movers — customer portal self-activation
-- Authenticated, email-verified customers may claim exactly one existing
-- customer record whose normalized email matches their Supabase Auth email.
-- No client-supplied tenant, role, user ID, or customer ID is trusted.

begin;

create or replace function public.portal_activate_customer_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_profile_role text;
  v_profile_company uuid;
  v_profile_active boolean;
  v_customer_id uuid;
  v_customer_company uuid;
  v_existing_auth_user_id uuid;
  v_match_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email, v_email_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if nullif(v_email, '') is null then
    raise exception 'Verified email is required';
  end if;

  if v_email_confirmed_at is null then
    raise exception 'Email must be confirmed before portal activation';
  end if;

  select p.role::text, p.company_id, p.is_active
    into v_profile_role, v_profile_company, v_profile_active
  from public.profiles p
  where p.id = v_uid;

  if v_profile_role is null then
    raise exception 'Customer profile not found';
  end if;
  if v_profile_active is not true then
    raise exception 'Account is inactive';
  end if;
  if v_profile_role <> 'customer' then
    raise exception 'Only customer accounts can activate the customer portal';
  end if;

  select count(*)::integer
    into v_match_count
  from public.customers c
  where lower(btrim(coalesce(c.email, ''))) = v_email
    and (c.auth_user_id is null or c.auth_user_id = v_uid)
    and (v_profile_company is null or c.company_id = v_profile_company);

  if v_match_count = 0 then
    raise exception 'No eligible customer record matches this verified email';
  end if;
  if v_match_count > 1 then
    raise exception 'Multiple customer records match this verified email; contact the office';
  end if;

  select c.id, c.company_id, c.auth_user_id
    into v_customer_id, v_customer_company, v_existing_auth_user_id
  from public.customers c
  where lower(btrim(coalesce(c.email, ''))) = v_email
    and (c.auth_user_id is null or c.auth_user_id = v_uid)
    and (v_profile_company is null or c.company_id = v_profile_company);

  -- Re-check that this auth identity is not already linked to a different
  -- customer row. The partial unique index from 0026 also enforces this.
  if exists (
    select 1 from public.customers c
    where c.auth_user_id = v_uid and c.id <> v_customer_id
  ) then
    raise exception 'This account is already linked to another customer record';
  end if;

  update public.customers
     set auth_user_id = v_uid,
         updated_at = now()
   where id = v_customer_id
     and (auth_user_id is null or auth_user_id = v_uid);

  if not found then
    raise exception 'Customer portal activation could not be completed';
  end if;

  update public.profiles
     set company_id = v_customer_company,
         updated_at = now()
   where id = v_uid
     and role::text = 'customer'
     and is_active is true
     and (company_id is null or company_id = v_customer_company);

  if not found then
    raise exception 'Customer profile could not be linked to the company';
  end if;

  -- Canonical audit writer exists in 0030. Identity and tenant are derived
  -- server-side; no sensitive customer fields are stored in metadata.
  if to_regprocedure('public._activity_write_forward(uuid,text,text,text,text,jsonb)') is not null then
    perform public._activity_write_forward(
      v_customer_company,
      'portal.activated',
      'customer',
      v_customer_id::text,
      'Customer portal account activated',
      jsonb_build_object('customer_id', v_customer_id)
    );
  end if;

  return jsonb_build_object(
    'activated', true,
    'customer_id', v_customer_id,
    'company_id', v_customer_company,
    'already_linked', v_existing_auth_user_id = v_uid
  );
end;
$$;

alter function public.portal_activate_customer_account() owner to postgres;
revoke all on function public.portal_activate_customer_account() from public, anon, service_role;
grant execute on function public.portal_activate_customer_account() to authenticated;

commit;
