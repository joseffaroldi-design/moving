-- =====================================================================
-- verify_0018_invoices.sql  (READ-ONLY — safe to run anytime)
-- Run AFTER 0018_invoices.sql. Paste the full result set back.
-- =====================================================================

-- 1. Tables exist
select 'tables' as check, string_agg(table_name, ', ' order by table_name) as found
from information_schema.tables
where table_schema = 'public'
  and table_name in ('invoices','invoice_line_items','invoice_payments');

-- 2. invoice_status enum values
select 'enum_invoice_status' as check, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'invoice_status';

-- 3. authenticated privileges (expect SELECT only on each table)
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as authenticated_privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in ('invoices','invoice_line_items','invoice_payments')
group by table_name
order by table_name;

-- 4. anon privileges (expect NONE / empty)
select coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '), 'NONE') as anon_privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('invoices','invoice_line_items','invoice_payments');

-- 5. RLS enabled + forced
select relname as table, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relname in ('invoices','invoice_line_items','invoice_payments')
order by relname;

-- 6. SELECT policies present
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('invoices','invoice_line_items','invoice_payments')
order by tablename, policyname;

-- 7. RPCs present + who can EXECUTE (client RPCs -> authenticated; helpers -> none)
select p.proname as function,
       coalesce(string_agg(distinct a.rolname, ', '), 'none') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
left join lateral (
  select r.rolname from pg_roles r
  where r.rolname in ('anon','authenticated')
    and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
) a on true
where p.proname in (
  'next_invoice_number','_require_invoice_mutator','_compute_invoice_totals',
  '_create_draft_invoice_for_job','generate_invoice_for_job',
  'update_draft_invoice_with_items','mark_invoice_sent','record_invoice_payment',
  'void_invoice','set_job_status')
group by p.proname
order by p.proname;

-- 8. one-invoice-per-job unique index exists
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'invoices'
  and indexname = 'invoices_job_id_unique';
