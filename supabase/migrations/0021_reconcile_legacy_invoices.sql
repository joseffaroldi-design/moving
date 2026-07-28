-- =====================================================================
-- 0021_reconcile_legacy_invoices.sql   [RC1 B3 — schema reconciliation]
-- DRAFT — owner-executed manually. DO NOT run 0018 inside this file.
--
-- PURPOSE
--   Retire the LEGACY invoice objects so 0018_invoices.sql can create the
--   intended Phase-8 schema on a clean slate. All three legacy tables are
--   empty (invoices=0, invoice_line_items=0, payments=0), so this is a safe
--   drop-and-recreate with no data migration.
--
-- EVIDENCE (RC1_diag_invoices_and_exposure.sql, live):
--   * invoices / invoice_line_items / payments  -> 0 rows each.
--   * FKs INTO invoices: invoice_line_items(CASCADE), payments(SET NULL).
--   * enum invoice_status = draft,sent,partially_paid,paid,void,overdue
--       (superset of 0018's 5 values -> PRESERVED, 0018 reuses it).
--   * dependent views: owner_dashboard_metrics, unpaid_invoice_queue.
--   * legacy fn: recalculate_invoice_totals() (signature resolved from catalog).
--   * no sequences/identity back these tables (Block 5 = no rows).
--
-- DECISIONS (owner):
--   1. DROP legacy public.payments (empty, unused, R3-locked, superseded by
--      the intended public.invoice_payments in 0018).
--   2. DROP the 2 dependent views now, PRESERVE their exact defs in rc1_backup,
--      rebuild later (separate migration) with security_invoker=true. Not retired.
--
-- SAFETY: fully transactional. Aborts unless all three tables exist and are
-- empty. Snapshots structure/constraints/indexes/triggers/grants/views/function
-- into schema rc1_backup for rollback. Enum preserved. 0018 NOT run here.
-- =====================================================================

begin;

create schema if not exists rc1_backup;

-- ---------------------------------------------------------------------
-- 0. ABORT UNLESS all three legacy tables EXIST and are EXACTLY 0 rows.
--    (A re-run after success errors here because the tables are gone,
--     which safely protects the previously-captured snapshot.)
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  if to_regclass('public.invoices') is null
     or to_regclass('public.invoice_line_items') is null
     or to_regclass('public.payments') is null then
    raise exception 'ABORT: invoices, invoice_line_items and payments must all exist';
  end if;
  select count(*) into n from public.invoices;
  if n <> 0 then raise exception 'ABORT: public.invoices has % row(s) (expected 0)', n; end if;
  select count(*) into n from public.invoice_line_items;
  if n <> 0 then raise exception 'ABORT: public.invoice_line_items has % row(s) (expected 0)', n; end if;
  select count(*) into n from public.payments;
  if n <> 0 then raise exception 'ABORT: public.payments has % row(s) (expected 0)', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. SNAPSHOT everything needed for rollback (structure only; tables empty).
-- ---------------------------------------------------------------------
drop table if exists rc1_backup.b3_manifest;
create table rc1_backup.b3_manifest as
select 'RC1 B3 reconciliation (0021)'::text as label,
       now() as captured_at, current_user as captured_by;

drop table if exists rc1_backup.b3_columns;
create table rc1_backup.b3_columns as
select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default, is_identity, identity_generation
from information_schema.columns
where table_schema = 'public'
  and table_name in ('invoices','invoice_line_items','payments');

drop table if exists rc1_backup.b3_constraints;
create table rc1_backup.b3_constraints as
select c.conrelid::regclass::text as tbl, c.conname, c.contype::text as contype,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.connamespace = 'public'::regnamespace
  and c.conrelid::regclass::text in ('invoices','invoice_line_items','payments');

drop table if exists rc1_backup.b3_indexes;
create table rc1_backup.b3_indexes as
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('invoices','invoice_line_items','payments');

drop table if exists rc1_backup.b3_triggers;
create table rc1_backup.b3_triggers as
select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where not t.tgisinternal
  and c.relname in ('invoices','invoice_line_items','payments');

drop table if exists rc1_backup.b3_grants;
create table rc1_backup.b3_grants as
select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('invoices','invoice_line_items','payments');

-- External FK constraints that reference the tables we will drop (invoices /
-- payments) FROM surviving tables (e.g. customer_deposits.payment_id ->
-- payments). Snapshotted so they can be recreated on rollback; dropped
-- explicitly in step 2.5 so the table drops never need a blanket CASCADE.
drop table if exists rc1_backup.b3_ext_fks;
create table rc1_backup.b3_ext_fks as
select con.conname,
       con.conrelid::regclass::text  as on_table,
       con.confrelid::regclass::text as references_table,
       pg_get_constraintdef(con.oid)  as definition
from pg_constraint con
where con.contype = 'f'
  and con.confrelid in ('public.invoices'::regclass, 'public.payments'::regclass)
  and con.conrelid not in ('public.invoices'::regclass,
                           'public.invoice_line_items'::regclass,
                           'public.payments'::regclass);

-- ALL views/matviews that depend on invoices/payments (catalog-driven, not a
-- hardcoded list). Captures definition + reloptions (security_invoker) so they
-- can be rebuilt on rollback / in the later security_invoker=true migration.
drop table if exists rc1_backup.b3_views;
create table rc1_backup.b3_views as
with dep_views as (
  select distinct v.oid
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class v on v.oid = rw.ev_class
  join pg_class t on t.oid = d.refobjid
  join pg_namespace nt on nt.oid = t.relnamespace and nt.nspname = 'public'
  where d.classid = 'pg_rewrite'::regclass
    and d.refclassid = 'pg_class'::regclass
    and t.relname in ('invoices','payments')
    and v.relkind in ('v','m')
    and v.oid <> t.oid
)
select v.relname as view_name, v.relkind::text as kind, n.nspname as schema,
       pg_get_viewdef(v.oid, true) as definition, v.reloptions as reloptions
from dep_views dv
join pg_class v on v.oid = dv.oid
join pg_namespace n on n.oid = v.relnamespace;

-- Exact legacy function definition + catalog-resolved identity args.
drop table if exists rc1_backup.b3_routines;
create table rc1_backup.b3_routines as
select p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname = 'recalculate_invoice_totals';

-- ---------------------------------------------------------------------
-- 2. DROP every dependent view/matview discovered above (CASCADE covers any
--    view nested on top of them; all defs are snapshotted in b3_views).
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select view_name, kind from rc1_backup.b3_views loop
    if r.kind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', r.view_name);
    else
      execute format('drop view if exists public.%I cascade', r.view_name);
    end if;
    raise notice 'dropped dependent view public.%', r.view_name;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2.5 DROP external FK constraints (from surviving tables) that point at
--     invoices/payments — snapshotted above. Targeted (no blanket CASCADE).
--     Handles customer_deposits.payment_id_fkey and any others discovered.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname, on_table from rc1_backup.b3_ext_fks loop
    execute format('alter table %s drop constraint if exists %I', r.on_table, r.conname);
    raise notice 'dropped external FK % on %', r.conname, r.on_table;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. DROP legacy tables in dependency-safe order.
--    invoice_line_items(FK->invoices) -> payments(FK->invoices) -> invoices.
--    Plain drops (no CASCADE) so any UNEXPECTED dependent aborts the txn
--    instead of being silently removed.
-- ---------------------------------------------------------------------
drop table if exists public.invoice_line_items;
drop table if exists public.payments;
drop table if exists public.invoices;

-- ---------------------------------------------------------------------
-- 4. DROP the legacy recalculate_invoice_totals() using its EXACT catalog
--    signature(s) — never a hardcoded/assumed signature. Handles overloads.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select 'public.' || quote_ident(p.proname)
           || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = 'recalculate_invoice_totals'
  loop
    execute 'drop function if exists ' || r.sig;
    raise notice 'dropped legacy function %', r.sig;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. PRESERVE the invoice_status enum (draft,sent,partially_paid,paid,void,
--    overdue). 0018's `create type if not exists invoice_status` is a no-op
--    and reuses it; the extra 'overdue' label is compatible. No action here.
-- ---------------------------------------------------------------------

commit;

-- =====================================================================
-- VERIFY (read-only; run after commit; paste results back).
-- All rows in the first grid must show pass = true.
-- =====================================================================
select 'invoices_dropped'            as check_name, (to_regclass('public.invoices') is null)            as pass
union all select 'invoice_line_items_dropped', (to_regclass('public.invoice_line_items') is null)
union all select 'payments_dropped',           (to_regclass('public.payments') is null)
union all select 'invoice_status_enum_present',(exists (select 1 from pg_type where typname = 'invoice_status'))
union all select 'legacy_recalc_fn_removed',   (not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
           where p.proname = 'recalculate_invoice_totals'))
order by 1;

-- Backup objects created (expect b3_columns, b3_constraints, b3_grants,
-- b3_indexes, b3_manifest, b3_routines, b3_triggers, b3_views).
select table_name as backup_object
from information_schema.tables
where table_schema = 'rc1_backup' and table_name like 'b3_%'
order by 1;
