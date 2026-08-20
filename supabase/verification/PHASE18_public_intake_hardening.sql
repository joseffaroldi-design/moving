-- Phase 18 — read-only/temporary regression verification for public intake hardening.
-- Safe in production: the limiter test removes its own temporary rows.

do $$
declare
  v_proc regprocedure := 'public.check_public_intake_rate_limit(text,text,text)'::regprocedure;
  v_hash text := repeat('a', 64);
  v_result jsonb;
  i integer;
begin
  if to_regclass('app_private.public_intake_rate_limits') is null then
    raise exception 'FAIL: rate-limit table missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relname = 'public_intake_rate_limits'
      and c.relrowsecurity is true
  ) then
    raise exception 'FAIL: rate-limit table does not have RLS enabled';
  end if;

  if has_function_privilege('anon', v_proc, 'EXECUTE') then
    raise exception 'FAIL: anon can execute public intake limiter';
  end if;

  if has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'FAIL: authenticated can execute public intake limiter';
  end if;

  if has_function_privilege('public', v_proc, 'EXECUTE') then
    raise exception 'FAIL: PUBLIC can execute public intake limiter';
  end if;

  if not has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'FAIL: service_role cannot execute public intake limiter';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'check_public_intake_rate_limit'
      and p.prosecdef is true
      and pg_get_functiondef(p.oid) like '%SET search_path TO ''public'', ''app_private'', ''pg_temp''%'
  ) then
    raise exception 'FAIL: limiter SECURITY DEFINER/search_path contract drifted';
  end if;

  delete from app_private.public_intake_rate_limits where key_hash = v_hash;

  for i in 1..5 loop
    v_result := public.check_public_intake_rate_limit('lead', v_hash, null);
    if coalesce((v_result->>'allowed')::boolean, false) is not true then
      raise exception 'FAIL: limiter blocked lead request % too early: %', i, v_result;
    end if;
  end loop;

  v_result := public.check_public_intake_rate_limit('lead', v_hash, null);
  if coalesce((v_result->>'allowed')::boolean, true) is not false then
    raise exception 'FAIL: limiter did not block lead request 6: %', v_result;
  end if;

  delete from app_private.public_intake_rate_limits where key_hash = v_hash;
end $$;

select 'PASS: Phase 18 public intake hardening checks' as result;
