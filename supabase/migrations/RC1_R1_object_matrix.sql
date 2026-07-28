-- =====================================================================
-- RC1_R1_object_matrix.sql        (STRICTLY READ-ONLY — no writes)
-- Produces the complete affected-object matrix for the 42 anon-exposed
-- relations so the emergency lockdown (RC1_R3) can be reviewed against the
-- real, live state: relation type, owner, per-grantee grants, RLS
-- enabled/forced, and existing policies. Metadata only — safe to paste back.
-- Run each block; paste results into the review.
-- =====================================================================

-- The 42 relations (kept in one CTE reused by every block).
with rels(name) as (
  values
    ('app_navigation_items'),('app_settings'),('automation_rules'),('communications'),
    ('companies'),('company_onboarding_steps'),('crew_time_entries'),('crm_notes'),
    ('customer_deposits'),('damage_report_photos'),('damage_reports'),('dispatch_board_today'),
    ('document_signatures'),('documents'),('inventory_catalog_items'),('inventory_items'),
    ('invoice_line_items'),('invoices'),('lead_source_performance'),('lead_sources'),
    ('message_templates'),('notification_queue'),('open_sales_pipeline'),('operational_issues'),
    ('owner_dashboard_metrics'),('payments'),('payroll_entries'),('payroll_runs'),
    ('portal_activity'),('portal_tokens'),('pricing_rules'),('rooms'),('sales_commissions'),
    ('saved_views'),('storage_uploads'),('survey_items'),('survey_rooms'),('surveys'),
    ('tasks'),('unpaid_invoice_queue'),('user_preferences'),('webhook_events')
)

-- M1. Relation type + owner + RLS state. (relkind: r=table, p=partitioned,
--     v=view, m=matview, f=foreign, S=sequence.)
select 'M1_TYPE_OWNER_RLS' as block,
       c.relname,
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
            when 'v' then 'view' when 'm' then 'matview' when 'f' then 'foreign_table'
            else c.relkind::text end as reltype,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity  as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in (select name from rels)
order by c.relname;

-- M2. Per-grantee grants for anon / public / authenticated / service_role.
select 'M2_GRANTS' as block,
       g.table_name, g.grantee,
       string_agg(g.privilege_type, ',' order by g.privilege_type) as privs,
       bool_or(g.is_grantable = 'YES') as any_grantable
from information_schema.role_table_grants g
where g.table_schema = 'public'
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
  and g.grantee in ('anon','public','PUBLIC','authenticated','service_role')
group by g.table_name, g.grantee
order by g.table_name, g.grantee;

-- M3. Existing policies on the 42 relations (the lockdown does NOT change these;
--     captured to confirm none are silently relied upon / broken).
select 'M3_POLICIES' as block,
       tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
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
order by tablename, policyname;

-- M4. ROOT-CAUSE CHECK — default privileges that AUTO-grant future tables to
--     anon/authenticated (this is almost certainly why 42 tables are exposed;
--     if present it MUST be revoked too or new tables re-open the hole).
select 'M4_DEFAULT_PRIVS' as block,
       pg_get_userbyid(d.defaclrole) as granting_role,
       n.nspname as schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
            when 'f' then 'functions' when 'T' then 'types' else d.defaclobjtype::text end as applies_to,
       d.defaclacl as default_acl
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
order by schema, applies_to;

-- M5. Existing app-table policies that might REFERENCE any of the 42 in a
--     subquery (would need those tables readable). EXPECT: none reference them
--     directly (the app uses has_company_role() helpers, not table subqueries).
select 'M5_POLICY_CROSSREF' as block,
       tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('leads','customers','quotes','quote_line_items','jobs',
                    'job_crew','job_trucks','trucks','dispatch_assignments',
                    'dispatch_days','profiles','lead_notes','business_profile')
  and (qual ~* '\y(companies|payments|invoices|documents|rooms|surveys|tasks|payroll_entries|sales_commissions|customer_deposits)\y'
    or with_check ~* '\y(companies|payments|invoices|documents|rooms|surveys|tasks|payroll_entries|sales_commissions|customer_deposits)\y')
order by tablename, policyname;
