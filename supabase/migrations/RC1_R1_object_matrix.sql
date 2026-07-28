-- =====================================================================
-- RC1_R1_object_matrix.sql        (STRICTLY READ-ONLY — no writes, no temp tables)
-- Full catalog-level dependency + exposure inventory for the 42 anon-exposed
-- relations, so RC1_R3 can be reviewed against REAL live state. Metadata only.
-- Run each numbered block (M1..M13); paste every result set back.
--
-- NOTE: M10 (pg_cron) errors if the extension is absent — that is expected;
-- skip it if it errors. Everything else is plain catalog SELECTs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- M1. Relation type + OWNER + owner's RLS-bypass attributes + RLS state.
--     (owner_bypassrls / owner_superuser matter: such an owner ignores RLS.)
-- ---------------------------------------------------------------------
with rels(name) as (values
  ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
  ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
  ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
  ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
  ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
  ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
  ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
  ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
  ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
  ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events'))
select 'M1_TYPE_OWNER_RLS' as block, c.relname,
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
            when 'v' then 'view' when 'm' then 'matview' when 'f' then 'foreign_table'
            else c.relkind::text end as reltype,
       pg_get_userbyid(c.relowner) as owner,
       ro.rolsuper as owner_superuser, ro.rolbypassrls as owner_bypassrls,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_roles ro on ro.oid = c.relowner
where c.relname in (select name from rels)
order by c.relname;

-- ---------------------------------------------------------------------
-- M2. Per-grantee grants (anon/public/authenticated/service_role) incl. grantable.
-- ---------------------------------------------------------------------
select 'M2_GRANTS' as block, g.table_name, g.grantee,
       string_agg(g.privilege_type, ',' order by g.privilege_type) as privs,
       bool_or(g.is_grantable = 'YES') as any_grantable
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.table_name = any (array[
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports','dispatch_board_today',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_source_performance','lead_sources',
    'message_templates','notification_queue','open_sales_pipeline','operational_issues',
    'owner_dashboard_metrics','payments','payroll_entries','payroll_runs',
    'portal_activity','portal_tokens','pricing_rules','rooms','sales_commissions',
    'saved_views','storage_uploads','survey_items','survey_rooms','surveys',
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events'])
  and g.grantee in ('anon','public','PUBLIC','authenticated','service_role')
group by g.table_name, g.grantee
order by g.table_name, g.grantee;

-- ---------------------------------------------------------------------
-- M3. Existing policies on the 42 relations.
-- ---------------------------------------------------------------------
select 'M3_POLICIES' as block, tablename, policyname, permissive,
       roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports','dispatch_board_today',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_source_performance','lead_sources',
    'message_templates','notification_queue','open_sales_pipeline','operational_issues',
    'owner_dashboard_metrics','payments','payroll_entries','payroll_runs',
    'portal_activity','portal_tokens','pricing_rules','rooms','sales_commissions',
    'saved_views','storage_uploads','survey_items','survey_rooms','surveys',
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events'])
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- M4. DEFAULT PRIVILEGES (root cause). Scoped by GRANTOR/OWNER + schema + objtype.
--     ZERO rows => no custom default ACLs (good). Rows for anon/authenticated =>
--     new objects auto-expose; the RC1_R5 addendum must revoke them PER GRANTOR.
-- ---------------------------------------------------------------------
select 'M4_DEFAULT_PRIVS' as block,
       pg_get_userbyid(d.defaclrole) as owner_grantor,
       coalesce(n.nspname, '(all schemas)') as schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
            when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas'
            else d.defaclobjtype::text end as applies_to,
       case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
       a.privilege_type, a.is_grantable
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
order by owner_grantor, schema, applies_to, grantee;

-- ---------------------------------------------------------------------
-- M5. CATALOG-BASED policy dependencies (not text matching). Every object each
--     policy DEPENDS ON (tables via columns, and functions). Lets us see if any
--     policy (app or otherwise) truly depends on one of the 42 or on a function
--     that does. Review: does any app-table policy depend on an affected object?
-- ---------------------------------------------------------------------
select 'M5_POLICY_DEPS' as block,
       pol.polrelid::regclass::text as policy_table,
       pol.polname,
       case ref.refclassid
         when 'pg_class'::regclass then 'relation'
         when 'pg_proc'::regclass  then 'function'
         else ref.refclassid::regclass::text end as dep_type,
       case ref.refclassid
         when 'pg_class'::regclass then ref.refobjid::regclass::text
         when 'pg_proc'::regclass  then ref.refobjid::regprocedure::text
         else ref.refobjid::text end as depends_on
from pg_policy pol
join pg_depend ref on ref.classid = 'pg_policy'::regclass and ref.objid = pol.oid
where ref.refclassid in ('pg_class'::regclass, 'pg_proc'::regclass)
  and ref.deptype in ('n','a')
order by policy_table, polname, dep_type, depends_on;

-- ---------------------------------------------------------------------
-- M6. PARTITION CHILDREN (recursive) of any partitioned parent among the 42,
--     with each child's kind/owner/RLS + anon/authenticated direct SELECT.
--     A child is directly addressable and must be locked individually in R3.
-- ---------------------------------------------------------------------
with rels(name) as (values
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
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.relkind='p' and c.relname in (select name from rels)),
tree as (
  select p.oid as parent_oid, p.relname as root_parent, i.inhrelid as child_oid
  from parents p join pg_inherits i on i.inhparent = p.oid
  union all
  select t.root_parent::regclass::oid, t.root_parent, i.inhrelid
  from tree t join pg_inherits i on i.inhparent = t.child_oid)
select 'M6_PARTITION_CHILDREN' as block,
       t.root_parent, ch.relname as child, ch.relkind::text as child_kind,
       pg_get_userbyid(ch.relowner) as child_owner,
       ch.relrowsecurity as rls_enabled, ch.relforcerowsecurity as rls_forced,
       has_table_privilege('anon', ch.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', ch.oid, 'SELECT') as auth_select
from tree t join pg_class ch on ch.oid = t.child_oid
order by root_parent, child;

-- ---------------------------------------------------------------------
-- M7. FUNCTION inventory: every public function whose body references any of
--     the 42 (best-effort text scan of prosrc — pg_depend does NOT track table
--     refs inside plpgsql). Reports SECURITY DEFINER flag, owner + owner bypass/
--     superuser, and anon/authenticated EXECUTE. Flags both breakage risk
--     (relies on caller grants) and indirect-exposure risk (secdef + bypassrls
--     + anon-executable).
-- ---------------------------------------------------------------------
with rels(name) as (values
  ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
  ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
  ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
  ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
  ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
  ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
  ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
  ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
  ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
  ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events'))
select 'M7_FUNCS_REF_RELS' as block,
       p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       ro.rolbypassrls as owner_bypassrls, ro.rolsuper as owner_superuser,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       (select string_agg(r.name, ',') from rels r where p.prosrc ~* ('\y'||r.name||'\y')) as referenced_affected
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
join pg_roles ro on ro.oid = p.proowner
where exists (select 1 from rels r where p.prosrc ~* ('\y'||r.name||'\y'))
order by security_definer desc, anon_exec desc, p.proname;

-- ---------------------------------------------------------------------
-- M8. VIEWS / MATVIEWS anywhere in public that are BUILT ON the 42 (pg_rewrite
--     dependency) — indirect exposure surface. Reports view owner + bypassrls +
--     whether anon/authenticated can SELECT the view.
-- ---------------------------------------------------------------------
with rels(name) as (values
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
tgt as (select c.oid, c.relname from pg_class c
        join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
        where c.relname in (select name from rels))
select distinct 'M8_VIEWS_ON_RELS' as block,
       v.relname as view_name, v.relkind::text as view_kind,
       pg_get_userbyid(v.relowner) as view_owner, ro.rolbypassrls as owner_bypassrls,
       t.relname as depends_on_relation,
       has_table_privilege('anon', v.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', v.oid, 'SELECT') as auth_select
from pg_depend d
join pg_rewrite rw on rw.oid = d.objid
join pg_class v on v.oid = rw.ev_class
join pg_namespace vn on vn.oid = v.relnamespace and vn.nspname = 'public'
join pg_roles ro on ro.oid = v.relowner
join tgt t on t.oid = d.refobjid
where d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
  and v.relkind in ('v','m') and v.oid <> t.oid
order by view_name, depends_on_relation;

-- ---------------------------------------------------------------------
-- M9. TRIGGERS on the 42 + their trigger functions (owner / secdef).
-- ---------------------------------------------------------------------
with rels(name) as (values
  ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
  ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
  ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
  ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
  ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
  ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
  ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
  ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
  ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
  ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events'))
select 'M9_TRIGGERS' as block, c.relname as tbl, t.tgname,
       p.proname as trigger_function, p.prosecdef as func_secdef,
       pg_get_userbyid(p.proowner) as func_owner
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and c.relname in (select name from rels)
order by tbl, tgname;

-- ---------------------------------------------------------------------
-- M10. SCHEDULED JOBS (pg_cron). Skip if this errors (extension not installed).
-- ---------------------------------------------------------------------
select 'M10_CRON' as block, jobid, schedule, jobname, command
from cron.job
where command ~* ('\y(' ||
  'app_navigation_items|app_settings|automation_rules|communications|companies|' ||
  'company_onboarding_steps|crew_time_entries|crm_notes|customer_deposits|damage_report_photos|' ||
  'damage_reports|dispatch_board_today|document_signatures|documents|inventory_catalog_items|' ||
  'inventory_items|invoice_line_items|invoices|lead_source_performance|lead_sources|' ||
  'message_templates|notification_queue|open_sales_pipeline|operational_issues|owner_dashboard_metrics|' ||
  'payments|payroll_entries|payroll_runs|portal_activity|portal_tokens|pricing_rules|rooms|' ||
  'sales_commissions|saved_views|storage_uploads|survey_items|survey_rooms|surveys|tasks|' ||
  'unpaid_invoice_queue|user_preferences|webhook_events' || ')\y')
order by jobid;

-- ---------------------------------------------------------------------
-- M11. SCHEMA-level privileges for anon/authenticated on public.
-- ---------------------------------------------------------------------
select 'M11_SCHEMA_PRIVS' as block, n.nspname as schema,
       has_schema_privilege('anon', n.nspname, 'USAGE')          as anon_usage,
       has_schema_privilege('anon', n.nspname, 'CREATE')         as anon_create,
       has_schema_privilege('authenticated', n.nspname, 'USAGE') as auth_usage,
       has_schema_privilege('authenticated', n.nspname, 'CREATE') as auth_create
from pg_namespace n
where n.nspname = 'public';

-- ---------------------------------------------------------------------
-- M12. ROLE membership / inheritance / attributes (inherited-privilege paths).
-- ---------------------------------------------------------------------
select 'M12_ROLE_MEMBERSHIP' as block, r.rolname as role, m.rolname as member_of, am.admin_option
from pg_auth_members am
join pg_roles r on r.oid = am.member
join pg_roles m on m.oid = am.roleid
where r.rolname in ('anon','authenticated','service_role','authenticator')
order by role, member_of;

select 'M12b_ROLE_ATTRS' as block, rolname, rolinherit, rolbypassrls, rolsuper, rolcanlogin
from pg_roles
where rolname in ('anon','authenticated','service_role','authenticator','postgres')
order by rolname;

-- ---------------------------------------------------------------------
-- M13. SEQUENCES backing the 42 tables + anon/authenticated USAGE/SELECT.
-- ---------------------------------------------------------------------
with rels(name) as (values
  ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
  ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
  ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
  ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
  ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
  ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
  ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
  ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
  ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
  ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events'))
select 'M13_SEQUENCES' as block, s.relname as sequence,
       t.relname as owned_by_table, a.attname as column,
       has_table_privilege('anon', s.oid, 'USAGE')  as anon_usage,
       has_table_privilege('anon', s.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', s.oid, 'USAGE')  as auth_usage,
       has_table_privilege('authenticated', s.oid, 'SELECT') as auth_select
from pg_class s
join pg_depend d on d.objid = s.oid and d.deptype = 'a'
join pg_class t on t.oid = d.refobjid
join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
join pg_namespace n on n.oid = s.relnamespace and n.nspname = 'public'
where s.relkind = 'S' and t.relname in (select name from rels)
order by owned_by_table, sequence;
