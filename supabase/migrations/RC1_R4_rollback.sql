-- =====================================================================
-- RC1_R4_rollback.sql   (EMERGENCY ROLLBACK for R3 — run ONLY if the app
-- breaks after R3). Restores the EXACT grants captured by R2 from the
-- rc1_backup.grant_snapshot table. Idempotent (re-granting is harmless).
-- Requires RC1_R2_pre_snapshot.sql to have been run first.
-- =====================================================================
begin;

do $$
declare
  r record;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'rc1_backup' and table_name = 'grant_snapshot'
  ) then
    raise exception 'rc1_backup.grant_snapshot missing — run RC1_R2_pre_snapshot.sql first';
  end if;

  for r in
    select grantee, table_name, privilege_type, is_grantable
    from rc1_backup.grant_snapshot
  loop
    if upper(r.grantee) = 'PUBLIC' then
      execute format(
        'grant %s on public.%I to public%s',
        r.privilege_type, r.table_name,
        case when r.is_grantable = 'YES' then ' with grant option' else '' end);
    else
      execute format(
        'grant %s on public.%I to %I%s',
        r.privilege_type, r.table_name, r.grantee,
        case when r.is_grantable = 'YES' then ' with grant option' else '' end);
    end if;
  end loop;

  raise notice 'R4 rollback complete: grants restored from rc1_backup.grant_snapshot';
end$$;

commit;

-- VERIFY (paste back): counts should match the R2 snapshot again.
select g.grantee, count(*) as privileges, count(distinct g.table_name) as relations
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
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events')
group by g.grantee
order by g.grantee;
