-- =====================================================================
-- 0019_invoices_security_lockdown.sql   [B2 EMERGENCY LOCKDOWN]
-- Southern Magnolia Movers — RC1.
--
-- PURPOSE: immediately close anonymous access to the LEGACY invoice tables
-- WITHOUT assuming the Phase-8 (0018) schema. Safe to run BEFORE the schema is
-- reconciled. Preserves all rows. Alters NO columns. Creates NO RPCs. Runs NO
-- business logic.
--
-- STRATEGY (deny-by-default):
--   * For each invoice table that EXISTS: enable RLS + FORCE RLS.
--   * REVOKE every privilege from anon and PUBLIC.
--   * REVOKE write privileges from authenticated (INSERT/UPDATE/DELETE/TRUNCATE/
--     REFERENCES/TRIGGER) AND revoke SELECT too — with FORCE RLS and no policy,
--     the tables are fully deny-by-default until the reconciliation migration
--     adds proper staff-scoped SELECT policies. service_role is untouched
--     (bypasses RLS by design; used only by trusted server code).
--   * Existing policies are NOT dropped.
--
-- Idempotent / re-runnable. Transactional.
-- =====================================================================

begin;

do $$
declare
  t text;
  tables text[] := array['invoices','invoice_line_items','invoice_payments'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip: public.% does not exist', t;
      continue;
    end if;

    -- RLS on + forced (deny-by-default; no policy = no rows to anyone but service_role).
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);

    -- Remove ALL anon + PUBLIC access (the exposure).
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from public', t);

    -- No direct authenticated access until reconciliation grants staff SELECT.
    execute format('revoke all on table public.%I from authenticated', t);

    raise notice 'locked down: public.% (RLS forced; anon/public/authenticated revoked)', t;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------
-- VERIFICATION (read-only) — run after commit; paste results back.
-- Expect: rls_enabled = true AND rls_forced = true for each existing table;
--         NO rows for grantee anon / PUBLIC / authenticated.
-- ---------------------------------------------------------------------
select c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname='public'
where c.relname in ('invoices','invoice_line_items','invoice_payments')
order by c.relname;

select table_name, grantee, string_agg(privilege_type,',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('invoices','invoice_line_items','invoice_payments')
  and grantee in ('anon','authenticated','public','PUBLIC')
group by table_name, grantee
order by table_name, grantee;
-- ^ Ideal result: the second query returns ZERO rows.

-- Live black-box (should now be 401, was 200):
--   curl -s -o /dev/null -w "%{http_code}" \
--     "$SUPABASE_URL/rest/v1/invoices?select=id&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"          # expect 401
