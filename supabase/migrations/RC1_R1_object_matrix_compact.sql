-- =====================================================================
-- RC1_R1_object_matrix_compact.sql   (READ-ONLY) — one row per block.
-- Returns only the decision-relevant findings, each aggregated to a single
-- JSON row, so the whole thing is small enough to paste back.
-- =====================================================================
with recursive
rels(name) as (values
  ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
  ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
  ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
  ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
  ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
  ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
  ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
  ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
  ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
  ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events')),
parents as (
  select c.oid, c.relname from pg_class c
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.relkind='p' and c.relname in (select name from rels)),
tree as (
  select p.relname as root_parent, i.inhrelid as child_oid
  from parents p join pg_inherits i on i.inhparent=p.oid
  union all
  select t.root_parent, i.inhrelid from tree t join pg_inherits i on i.inhparent=t.child_oid)

-- M1: relation type + owner + rls state (compact array).
select 'M1_TYPES' as block, jsonb_agg(x order by relname) as findings from (
  select c.relname,
    case c.relkind when 'r' then 't' when 'p' then 'part' when 'v' then 'view'
      when 'm' then 'mview' when 'f' then 'ftbl' else c.relkind::text end as ty,
    pg_get_userbyid(c.relowner) as own, ro.rolbypassrls as own_bypass,
    c.relrowsecurity as rls, c.relforcerowsecurity as forced, c.relname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_roles ro on ro.oid=c.relowner
  where c.relname in (select name from rels)) x
union all
-- M2: which of the 42 have AUTHENTICATED direct grants (revoke impact scope).
select 'M2_AUTH_GRANTS', jsonb_agg(x order by table_name) from (
  select g.table_name, string_agg(distinct g.privilege_type, ',' order by g.privilege_type) as privs, g.table_name as _s
  from information_schema.role_table_grants g
  where g.table_schema='public' and g.table_name in (select name from rels) and g.grantee='authenticated'
  group by g.table_name) x
union all
-- M4: default privileges granting to anon/authenticated/PUBLIC (ROOT CAUSE).
select 'M4_DEFAULT_PRIVS', jsonb_agg(x) from (
  select pg_get_userbyid(d.defaclrole) as grantor, coalesce(n.nspname,'(all)') as schema,
    case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
      when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas'
      else d.defaclobjtype::text end as applies_to,
    case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
    a.privilege_type as priv
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where a.grantee=0 or a.grantee::regrole::text in ('anon','authenticated')) x
union all
-- M5: policies that DEPEND ON one of the 42 relations (catalog-based).
select 'M5_POLICY_XREF', jsonb_agg(x) from (
  select pol.polrelid::regclass::text as policy_table, pol.polname,
    ref.refobjid::regclass::text as depends_on_relation
  from pg_policy pol join pg_depend ref on ref.classid='pg_policy'::regclass and ref.objid=pol.oid
  where ref.refclassid='pg_class'::regclass
    and ref.refobjid::regclass::text in (select 'public.'||name from rels)) x
union all
-- M6: partition children (must be locked individually).
select 'M6_PARTITION_CHILDREN', jsonb_agg(x) from (
  select t.root_parent, ch.relname as child, ch.relkind::text as kind,
    ch.relrowsecurity as rls, ch.relforcerowsecurity as forced,
    has_table_privilege('anon', ch.oid,'SELECT') as anon_sel
  from tree t join pg_class ch on ch.oid=t.child_oid) x
union all
-- M7: functions whose body references any of the 42.
select 'M7_FUNCS', jsonb_agg(x order by security_definer desc, proname) from (
  select p.proname, p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner,
    ro.rolbypassrls as owner_bypass,
    has_function_privilege('anon', p.oid,'EXECUTE') as anon_exec,
    has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec,
    (select string_agg(r.name, ',') from rels r where p.prosrc ~* ('\y'||r.name||'\y')) as refs,
    p.prosecdef as security_definer, p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  join pg_roles ro on ro.oid=p.proowner
  where exists (select 1 from rels r where p.prosrc ~* ('\y'||r.name||'\y'))) x
union all
-- M8: views/matviews on the 42 that anon or authenticated can SELECT (indirect exposure).
select 'M8_INDIRECT_VIEWS', jsonb_agg(x) from (
  select distinct v.relname as view_name, v.relkind::text as kind,
    pg_get_userbyid(v.relowner) as owner, ro.rolbypassrls as owner_bypass,
    t.relname as depends_on,
    has_table_privilege('anon', v.oid,'SELECT') as anon_sel,
    has_table_privilege('authenticated', v.oid,'SELECT') as auth_sel
  from pg_depend d join pg_rewrite rw on rw.oid=d.objid join pg_class v on v.oid=rw.ev_class
  join pg_namespace vn on vn.oid=v.relnamespace and vn.nspname='public'
  join pg_roles ro on ro.oid=v.relowner
  join (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
        where c.relname in (select name from rels)) t on t.oid=d.refobjid
  where d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass
    and v.relkind in ('v','m') and v.oid<>t.oid
    and (has_table_privilege('anon', v.oid,'SELECT') or has_table_privilege('authenticated', v.oid,'SELECT'))) x
union all
-- M9: triggers on the 42.
select 'M9_TRIGGERS', jsonb_agg(x) from (
  select c.relname as tbl, t.tgname, p.proname as fn, p.prosecdef as secdef
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal and c.relname in (select name from rels)) x
union all
-- M11 + M12b + M13 combined (small).
select 'M11_SCHEMA_PRIVS', jsonb_agg(x) from (
  select has_schema_privilege('anon','public','USAGE') as anon_usage,
    has_schema_privilege('anon','public','CREATE') as anon_create,
    has_schema_privilege('authenticated','public','USAGE') as auth_usage,
    has_schema_privilege('authenticated','public','CREATE') as auth_create) x
union all
select 'M12B_ROLE_ATTRS', jsonb_agg(x) from (
  select rolname, rolinherit, rolbypassrls, rolsuper, rolcanlogin
  from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')) x
union all
-- M13: sequences on the 42 where anon or authenticated has USAGE/SELECT.
select 'M13_SEQ_EXPOSED', jsonb_agg(x) from (
  select s.relname as sequence, t.relname as owned_by,
    has_table_privilege('anon',s.oid,'USAGE') as anon_usage,
    has_table_privilege('authenticated',s.oid,'USAGE') as auth_usage
  from pg_class s join pg_depend d on d.objid=s.oid and d.deptype='a'
  join pg_class t on t.oid=d.refobjid
  join pg_namespace n on n.oid=s.relnamespace and n.nspname='public'
  where s.relkind='S' and t.relname in (select name from rels)
    and (has_table_privilege('anon',s.oid,'USAGE') or has_table_privilege('anon',s.oid,'SELECT')
         or has_table_privilege('authenticated',s.oid,'USAGE'))) x;
