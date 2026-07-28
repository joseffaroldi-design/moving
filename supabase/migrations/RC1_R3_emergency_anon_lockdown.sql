-- =====================================================================
-- RC1_R3_emergency_anon_lockdown.sql   (RUN AFTER R2)   [B2 remediation]
--
-- Revokes ALL privileges from anon, authenticated and PUBLIC on the 42
-- exposed public relations (37 base tables + 5 views).
--
-- WHY THIS IS SAFE (verified against the R1 catalog + a repo scan):
--   * None of the 42 relations are queried by the frontend (only
--     business_profile, customers, dispatch_assignments, job_crew,
--     job_trucks, jobs, lead_notes, leads, profiles, quote_line_items,
--     quotes, trucks are used — none in this list) nor by the secure
--     mvp-dashboard Edge Function (reads profiles/leads/quotes/jobs).
--   * The 37 base tables have RLS ENABLED with ZERO policies (M5 empty),
--     so anon/authenticated already get 0 rows for SELECT/INSERT/UPDATE/
--     DELETE. The dangerous residue is TRUNCATE / TRIGGER / REFERENCES,
--     which are NOT governed by RLS — anon can currently TRUNCATE these
--     tables. This revoke removes that.
--   * The 5 VIEWS (dispatch_board_today, lead_source_performance,
--     open_sales_pipeline, owner_dashboard_metrics, unpaid_invoice_queue)
--     are owned by postgres and bypass underlying RLS; anon/authenticated
--     currently SELECT them cross-tenant. This revoke closes that.
--   * The 2 SECURITY DEFINER functions that touch these tables
--     (create_owner_profile_for_current_user, recalculate_invoice_totals)
--     run as their postgres owner, so they are UNAFFECTED by revoking the
--     anon/authenticated role grants.
--
-- Rollback: RC1_R4_rollback.sql (restores exactly from rc1_backup snapshot).
-- Prevent regression on FUTURE tables: RC1_R5_default_privileges_addendum.sql.
-- =====================================================================
begin;

revoke all privileges on
  public.app_navigation_items,
  public.app_settings,
  public.automation_rules,
  public.communications,
  public.companies,
  public.company_onboarding_steps,
  public.crew_time_entries,
  public.crm_notes,
  public.customer_deposits,
  public.damage_report_photos,
  public.damage_reports,
  public.dispatch_board_today,
  public.document_signatures,
  public.documents,
  public.inventory_catalog_items,
  public.inventory_items,
  public.invoice_line_items,
  public.invoices,
  public.lead_source_performance,
  public.lead_sources,
  public.message_templates,
  public.notification_queue,
  public.open_sales_pipeline,
  public.operational_issues,
  public.owner_dashboard_metrics,
  public.payments,
  public.payroll_entries,
  public.payroll_runs,
  public.portal_activity,
  public.portal_tokens,
  public.pricing_rules,
  public.rooms,
  public.sales_commissions,
  public.saved_views,
  public.storage_uploads,
  public.survey_items,
  public.survey_rooms,
  public.surveys,
  public.tasks,
  public.unpaid_invoice_queue,
  public.user_preferences,
  public.webhook_events
from anon, authenticated, public;

commit;

-- VERIFY (paste back): expect ZERO rows — no residual anon/authenticated/PUBLIC grants.
select g.grantee, g.table_name, g.privilege_type
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
order by 1,2,3;
