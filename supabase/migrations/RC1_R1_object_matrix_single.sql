-- =====================================================================
-- RC1_R1_object_matrix_single.sql  (READ-ONLY) — single result set.
-- Returns every block (M1..M13, minus M10) as (ord, block, data jsonb) so the
-- Supabase editor shows ALL of it in one run. A block that returns NO rows is
-- simply ABSENT from the output (e.g. M4 empty => no default-privilege issue).
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
select ord, block, data from (
  select 1 as ord, 'M1_TYPE_OWNER_RLS' as block, to_jsonb(m) as data from (
    select c.relname,
      case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
        when 'v' then 'view' when 'm' then 'matview' when 'f' then 'foreign_table'
        else c.relkind::text end as reltype,
      pg_get_userbyid(c.relowner) as owner, ro.rolsuper as owner_superuser,
      ro.rolbypassrls as owner_bypassrls, c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced
    from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_roles ro on ro.oid=c.relowner
    where c.relname in (select name from rels)) m
  union all
  select 2, 'M2_GRANTS', to_jsonb(m) from (
    select g.table_name, g.grantee,
      string_agg(g.privilege_type, ',' order by g.privilege_type) as privs,
      bool_or(g.is_grantable='YES') as any_grantable
    from information_schema.role_table_grants g
    where g.table_schema='public' and g.table_name in (select name from rels)
      and g.grantee in ('anon','public','PUBLIC','authenticated','service_role')
    group by g.table_name, g.grantee) m
  union all
  select 3, 'M3_POLICIES', to_jsonb(m) from (
    select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies where schemaname='public' and tablename in (select name from rels)) m
  union all
  select 4, 'M4_DEFAULT_PRIVS', to_jsonb(m) from (
    select pg_get_userbyid(d.defaclrole) as owner_grantor,
      coalesce(n.nspname,'(all schemas)') as schema,
      case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
        when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas'
        else d.defaclobjtype::text end as applies_to,
      case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
      a.privilege_type, a.is_grantable
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a) m
  union all
  select 5, 'M5_POLICY_DEPS', to_jsonb(m) from (
    select pol.polrelid::regclass::text as policy_table, pol.polname,
      case ref.refclassid when 'pg_class'::regclass then 'relation'
        when 'pg_proc'::regclass then 'function' else ref.refclassid::regclass::text end as dep_type,
      case ref.refclassid when 'pg_class'::regclass then ref.refobjid::regclass::text
        when 'pg_proc'::regclass then ref.refobjid::regprocedure::text else ref.refobjid::text end as depends_on
    from pg_policy pol join pg_depend ref on ref.classid='pg_policy'::regclass and ref.objid=pol.oid
    where ref.refclassid in ('pg_class'::regclass,'pg_proc'::regclass) and ref.deptype in ('n','a')) m
  union all
  select 6, 'M6_PARTITION_CHILDREN', to_jsonb(m) from (
    select t.root_parent, ch.relname as child, ch.relkind::text as child_kind,
      pg_get_userbyid(ch.relowner) as child_owner, ch.relrowsecurity as rls_enabled,
      ch.relforcerowsecurity as rls_forced,
      has_table_privilege('anon', ch.oid,'SELECT') as anon_select,
      has_table_privilege('authenticated', ch.oid,'SELECT') as auth_select
    from tree t join pg_class ch on ch.oid=t.child_oid) m
  union all
  select 7, 'M7_FUNCS_REF_RELS', to_jsonb(m) from (
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner,
      ro.rolbypassrls as owner_bypassrls, ro.rolsuper as owner_superuser,
      has_function_privilege('anon', p.oid,'EXECUTE') as anon_exec,
      has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec,
      (select string_agg(r.name, ',') from rels r where p.prosrc ~* ('\y'||r.name||'\y')) as referenced_affected
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
    join pg_roles ro on ro.oid=p.proowner
    where exists (select 1 from rels r where p.prosrc ~* ('\y'||r.name||'\y'))) m
  union all
  select 8, 'M8_VIEWS_ON_RELS', to_jsonb(m) from (
    select distinct v.relname as view_name, v.relkind::text as view_kind,
      pg_get_userbyid(v.relowner) as view_owner, ro.rolbypassrls as owner_bypassrls,
      t.relname as depends_on_relation,
      has_table_privilege('anon', v.oid,'SELECT') as anon_select,
      has_table_privilege('authenticated', v.oid,'SELECT') as auth_select
    from pg_depend d join pg_rewrite rw on rw.oid=d.objid join pg_class v on v.oid=rw.ev_class
    join pg_namespace vn on vn.oid=v.relnamespace and vn.nspname='public'
    join pg_roles ro on ro.oid=v.relowner
    join (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
          where c.relname in (select name from rels)) t on t.oid=d.refobjid
    where d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass
      and v.relkind in ('v','m') and v.oid<>t.oid) m
  union all
  select 9, 'M9_TRIGGERS', to_jsonb(m) from (
    select c.relname as tbl, t.tgname, p.proname as trigger_function,
      p.prosecdef as func_secdef, pg_get_userbyid(p.proowner) as func_owner
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and c.relname in (select name from rels)) m
  union all
  select 11, 'M11_SCHEMA_PRIVS', to_jsonb(m) from (
    select n.nspname as schema,
      has_schema_privilege('anon',n.nspname,'USAGE') as anon_usage,
      has_schema_privilege('anon',n.nspname,'CREATE') as anon_create,
      has_schema_privilege('authenticated',n.nspname,'USAGE') as auth_usage,
      has_schema_privilege('authenticated',n.nspname,'CREATE') as auth_create
    from pg_namespace n where n.nspname='public') m
  union all
  select 12, 'M12_ROLE_MEMBERSHIP', to_jsonb(m) from (
    select r.rolname as role, mm.rolname as member_of, am.admin_option
    from pg_auth_members am join pg_roles r on r.oid=am.member join pg_roles mm on mm.oid=am.roleid
    where r.rolname in ('anon','authenticated','service_role','authenticator')) m
  union all
  select 12, 'M12b_ROLE_ATTRS', to_jsonb(m) from (
    select rolname, rolinherit, rolbypassrls, rolsuper, rolcanlogin
    from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','postgres')) m
  union all
  select 13, 'M13_SEQUENCES', to_jsonb(m) from (
    select s.relname as sequence, t.relname as owned_by_table, a.attname as column,
      has_table_privilege('anon',s.oid,'USAGE') as anon_usage,
      has_table_privilege('anon',s.oid,'SELECT') as anon_select,
      has_table_privilege('authenticated',s.oid,'USAGE') as auth_usage,
      has_table_privilege('authenticated',s.oid,'SELECT') as auth_select
    from pg_class s join pg_depend d on d.objid=s.oid and d.deptype='a'
    join pg_class t on t.oid=d.refobjid
    join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
    join pg_namespace n on n.oid=s.relnamespace and n.nspname='public'
    where s.relkind='S' and t.relname in (select name from rels)) m
) all_blocks
order by ord, block;
