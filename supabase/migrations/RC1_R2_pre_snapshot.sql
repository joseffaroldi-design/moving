-- =====================================================================
-- RC1_R2_pre_snapshot.sql        [RUN BEFORE RC1_R3 — creates rollback point]
-- Southern Magnolia Movers — RC1.
--
-- Captures the EXACT pre-lockdown state (per-grantee grants, RLS enabled/forced,
-- and policies) for the 42 anon-exposed relations into schema `rc1_backup`.
-- RC1_R4_rollback.sql replays THIS captured state precisely (no generic
-- GRANT ALL). RC1_R3 refuses to run unless this snapshot exists.
--
-- This is metadata capture only — it does NOT read or move any row data and
-- does NOT change grants/RLS/policies on any live object. Transactional.
-- =====================================================================

begin;

create schema if not exists rc1_backup;
comment on schema rc1_backup is
  'RC1 pre-lockdown snapshot for RC1_R4_rollback. Safe to drop AFTER lockdown is verified and rollback is no longer needed.';

-- --- Grants (every grantee, so rollback restores anon/public/authenticated/etc. exactly).
drop table if exists rc1_backup.grants_snapshot;
create table rc1_backup.grants_snapshot as
select g.table_name, g.grantee, g.privilege_type, g.is_grantable
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
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events']);

-- --- RLS state + relkind (so rollback can restore enable/force exactly, tables + partitioned only).
drop table if exists rc1_backup.rls_snapshot;
create table rc1_backup.rls_snapshot as
select c.relname, c.relkind::text as relkind,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname = any (array[
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports','dispatch_board_today',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_source_performance','lead_sources',
    'message_templates','notification_queue','open_sales_pipeline','operational_issues',
    'owner_dashboard_metrics','payments','payroll_entries','payroll_runs',
    'portal_activity','portal_tokens','pricing_rules','rooms','sales_commissions',
    'saved_views','storage_uploads','survey_items','survey_rooms','surveys',
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events']);

-- --- Policies (informational; lockdown does not alter them, but capture for audit).
drop table if exists rc1_backup.policy_snapshot;
create table rc1_backup.policy_snapshot as
select schemaname, tablename, policyname, permissive, roles::text as roles,
       cmd, qual, with_check
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
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events']);

commit;

-- VERIFICATION — expect nonzero grants (proves capture worked) + 42 rls rows minus any missing relations.
select 'grants_rows'   as snapshot, count(*) as rows from rc1_backup.grants_snapshot
union all select 'rls_rows',    count(*) from rc1_backup.rls_snapshot
union all select 'policy_rows', count(*) from rc1_backup.policy_snapshot;
