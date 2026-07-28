-- =====================================================================
-- RC1_diag_invoices_and_exposure.sql   (STRICTLY READ-ONLY — no writes)
-- Evidence to (a) reconcile legacy invoice schema drift [B3] and
-- (b) enumerate every anon-readable table [B2/B4]. Returns METADATA ONLY —
-- NO invoice rows, NO customer names/emails/phones/addresses, NO payment data.
-- Run each numbered block in the Supabase SQL Editor. Paste the results back.
-- =====================================================================

-- 1. Columns + types + nullability + defaults + identity (invoice tables).
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default, is_identity, identity_generation
from information_schema.columns
where table_schema = 'public'
  and table_name in ('invoices','invoice_line_items','invoice_payments')
order by table_name, ordinal_position;

-- 2. Primary keys, foreign keys, unique + check constraints (invoice tables).
select c.conrelid::regclass::text as tbl, c.conname,
       case c.contype when 'p' then 'PK' when 'f' then 'FK'
            when 'u' then 'UNIQUE' when 'c' then 'CHECK' else c.contype::text end as kind,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.connamespace = 'public'::regnamespace
  and c.conrelid::regclass::text in ('invoices','invoice_line_items','invoice_payments')
order by tbl, kind, conname;

-- 3. FKs POINTING AT invoices (would block drop-and-recreate).
select conrelid::regclass::text as referencing_table, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where confrelid = to_regclass('public.invoices') and contype = 'f';

-- 4. Indexes on invoice tables.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('invoices','invoice_line_items','invoice_payments')
order by tablename, indexname;

-- 5. Sequences / identity backing the invoice tables.
select s.relname as sequence, a.attrelid::regclass::text as owned_by_table, a.attname as column
from pg_class s
join pg_depend d on d.objid = s.oid and d.deptype = 'a'
join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
where s.relkind = 'S'
  and a.attrelid::regclass::text in ('invoices','invoice_line_items','invoice_payments');

-- 6. Triggers on invoice tables.
select event_object_table as tbl, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('invoices','invoice_line_items','invoice_payments')
order by tbl, trigger_name;

-- 7. RLS enabled + FORCE state for ALL public tables (find any missing FORCE).
select c.relname as tbl, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
order by c.relname;

-- 8. Policies on invoice tables + companies.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('invoices','invoice_line_items','invoice_payments','companies')
order by tablename, policyname;

-- 9. GRANTS for anon / authenticated / public / service_role on ALL public tables.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','public','PUBLIC','service_role')
group by table_name, grantee
order by table_name, grantee;

-- 10. EVERY table currently granted to anon (explicit exposure list).
select table_name, string_agg(privilege_type, ',' order by privilege_type) as anon_privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name
order by table_name;

-- 11. Invoice-related functions / RPC signatures + who can EXECUTE.
select p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce(string_agg(distinct r.rolname, ',') filter (
         where has_function_privilege(r.rolname, p.oid, 'EXECUTE')), 'none') as executable_by
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
left join pg_roles r on r.rolname in ('anon','authenticated','service_role')
where p.proname ilike '%invoice%'
group by p.proname, p.oid
order by p.proname;

-- 12. Enum types that look invoice-related (e.g. invoice_status).
select t.typname as enum_type, string_agg(e.enumlabel, ',' order by e.enumsortorder) as values
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname ilike '%invoice%'
group by t.typname;

-- 13. Approximate row counts (metadata only — NO row contents).
select relname as tbl, n_live_tup as approx_rows
from pg_stat_user_tables
where schemaname = 'public'
  and relname in ('invoices','invoice_line_items','invoice_payments');

-- 14. Migration history (if the tracking table is readable).
select version, name from supabase_migrations.schema_migrations order by version desc limit 30;
