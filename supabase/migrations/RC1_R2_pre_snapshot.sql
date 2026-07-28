-- =====================================================================
-- RC1_R2_pre_snapshot.sql   (RUN FIRST — before R3)
-- Captures the CURRENT grant state of the 42 exposed relations and the
-- public-schema default privileges into a backup schema, so R3 can be
-- rolled back precisely via R4 if anything misbehaves.
-- Read/write is limited to the new rc1_backup schema. Idempotent.
-- =====================================================================
begin;

create schema if not exists rc1_backup;

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
select 1;

-- 1) Snapshot direct table/view grants for anon / authenticated / PUBLIC.
drop table if exists rc1_backup.grant_snapshot;
create table rc1_backup.grant_snapshot as
select g.grantee, g.table_schema, g.table_name, g.privilege_type, g.is_grantable,
       now() as captured_at
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.grantee in ('anon','authenticated','PUBLIC')
  and g.table_name in (
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports','dispatch_board_today',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_source_performance','lead_sources',
    'message_templates','notification_queue','open_sales_pipeline','operational_issues',
    'owner_dashboard_metrics','payments','payroll_entries','payroll_runs',
    'portal_activity','portal_tokens','pricing_rules','rooms','sales_commissions',
    'saved_views','storage_uploads','survey_items','survey_rooms','surveys',
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events');

-- 2) Snapshot public-schema DEFAULT privileges (root cause, for R5 rollback context).
drop table if exists rc1_backup.default_priv_snapshot;
create table rc1_backup.default_priv_snapshot as
select pg_get_userbyid(d.defaclrole) as grantor,
       coalesce(n.nspname,'(all)') as schema,
       d.defaclobjtype::text as objtype,
       case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
       a.privilege_type,
       now() as captured_at
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where coalesce(n.nspname,'') = 'public'
  and (a.grantee = 0 or a.grantee::regrole::text in ('anon','authenticated'));

commit;

-- VERIFY (paste back): expect grant_snapshot ~ 42 relations x (anon+authenticated) rows,
-- default_priv_snapshot to contain the public-schema anon/authenticated defaults.
select 'grant_snapshot' as snapshot, count(*) as rows,
       count(distinct table_name) as relations,
       count(distinct grantee) as grantees
from rc1_backup.grant_snapshot
union all
select 'default_priv_snapshot', count(*), null, count(distinct grantee)
from rc1_backup.default_priv_snapshot;
