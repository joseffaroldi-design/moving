-- =====================================================================
-- RC1_diag_invoices_and_exposure.sql   (READ-ONLY — safe, no writes)
-- Purpose: gather EVIDENCE to (a) reconcile the legacy invoices schema
-- drift and (b) prove/locate every anon-exposed table before remediation.
-- Run in Supabase SQL Editor. Paste the FULL output back.
-- =====================================================================

-- 1. Do legacy invoice tables exist, and what columns do they have?
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('invoices','invoice_line_items','invoice_payments')
order by table_name, ordinal_position;

-- 2. Row counts (are they truly empty, or is there real data to preserve?)
do $$
declare c1 bigint := 0; c2 bigint := 0;
begin
  if to_regclass('public.invoices') is not null then
    execute 'select count(*) from public.invoices' into c1; end if;
  if to_regclass('public.invoice_line_items') is not null then
    execute 'select count(*) from public.invoice_line_items' into c2; end if;
  raise notice 'invoices rows=%, invoice_line_items rows=%', c1, c2;
end $$;

-- 3. EVERY table's grants for anon + authenticated (find all exposure).
--    Expect: business tables show authenticated=SELECT and anon=(none).
--    Flag anything where anon has ANY privilege.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 4. RLS enabled/forced for ALL public tables (find any table missing FORCE).
select c.relname as table,
       c.relrowsecurity   as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
order by c.relname;

-- 5. Policies on the legacy invoice tables + companies (if any).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('invoices','invoice_line_items','companies')
order by tablename, policyname;

-- 6. Constraints + indexes currently on the legacy invoices table.
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.invoices'::regclass
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'invoices'
order by indexname;

-- 7. Foreign keys that POINT AT invoices (would block a drop-and-recreate).
select conrelid::regclass as referencing_table, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where confrelid = 'public.invoices'::regclass and contype = 'f';
