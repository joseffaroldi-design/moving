-- =====================================================================
-- 0021_emergency_anon_lockdown.sql        [RC1 CRITICAL — P0 SECURITY]
-- Southern Magnolia Movers.
--
-- WHY: RC1 diagnostics proved that 42 public relations still grant FULL DML
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) to the `anon`
-- role. An unauthenticated internet caller can currently READ, MODIFY,
-- DELETE and even TRUNCATE most of the database (companies, payments,
-- invoices, payroll, commissions, deposits, documents, crm notes,
-- communications, portal tokens, etc.). This is a catastrophic exposure and
-- the single highest-priority RC1 blocker.
--
-- SCOPE: This migration SUPERSEDES the narrower 0019 (only 3 invoice-named
-- tables) and 0020 (companies only). It was NOT safe to run 0019 alone: the
-- live payments table is named `payments` (NOT `invoice_payments`) and 38
-- other tables were left wide open.
--
-- SAFETY: Verified against the frontend source — the app reads ONLY the
-- already-locked tables (leads, customers, quotes, quote_line_items, jobs,
-- job_crew, job_trucks, trucks, dispatch_assignments, profiles, lead_notes,
-- business_profile). NONE of the 42 relations below are read by the client,
-- so a full deny-by-default lockdown cannot break the working app. Trusted
-- server code (Edge Functions) uses service_role, which bypasses RLS + grants
-- by design and is intentionally left untouched.
--
-- STRATEGY (deny-by-default):
--   * For every listed relation that exists:
--       - REVOKE ALL from anon, public, AND authenticated.
--       - If it is a real TABLE (relkind 'r'): ENABLE + FORCE row level
--         security (no policies => no direct client access at all).
--       - Views / materialized views: revoke only (RLS is N/A for them).
--   * Legitimate staff access to any of these tables is (re)granted later,
--     per-feature, via scoped SELECT policies + SECURITY DEFINER write RPCs,
--     exactly like the leads/quotes/jobs/dispatch lockdowns (0006-0017).
--
-- Idempotent / re-runnable. Transactional.
-- =====================================================================

begin;

do $$
declare
  r text;
  k "char";
  rels text[] := array[
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports','dispatch_board_today',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_source_performance','lead_sources',
    'message_templates','notification_queue','open_sales_pipeline','operational_issues',
    'owner_dashboard_metrics','payments','payroll_entries','payroll_runs',
    'portal_activity','portal_tokens','pricing_rules','rooms','sales_commissions',
    'saved_views','storage_uploads','survey_items','survey_rooms','surveys',
    'tasks','unpaid_invoice_queue','user_preferences','webhook_events'
  ];
begin
  foreach r in array rels loop
    if to_regclass('public.' || r) is null then
      raise notice 'skip (does not exist): public.%', r;
      continue;
    end if;

    select c.relkind into k
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = r;

    -- Strip ALL client-role access (tables, views, matviews alike).
    execute format('revoke all on public.%I from anon', r);
    execute format('revoke all on public.%I from public', r);
    execute format('revoke all on public.%I from authenticated', r);

    -- Deny-by-default RLS on real tables only.
    if k = 'r' then
      execute format('alter table public.%I enable row level security', r);
      execute format('alter table public.%I force  row level security', r);
      raise notice 'locked TABLE  public.% (RLS enabled+forced; all client grants revoked)', r;
    else
      raise notice 'locked %  public.% (all client grants revoked; RLS N/A)',
        case k when 'v' then 'VIEW  ' when 'm' then 'MATVIEW' else k::text end, r;
    end if;
  end loop;
end $$;

commit;

-- =====================================================================
-- VERIFICATION (read-only) — run AFTER commit; paste results back.
-- =====================================================================

-- V1. Anything still granted to anon/public anywhere in public? EXPECT ZERO ROWS.
select table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','public','PUBLIC')
group by table_name, grantee
order by table_name, grantee;

-- V2. RLS state for the locked TABLES. EXPECT rls_enabled=true AND rls_forced=true
--     for every real table in the list (views will simply not appear here).
select c.relname as tbl, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
  and c.relname in (
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_sources','message_templates',
    'notification_queue','operational_issues','payments','payroll_entries',
    'payroll_runs','portal_activity','portal_tokens','pricing_rules','rooms',
    'sales_commissions','saved_views','storage_uploads','survey_items',
    'survey_rooms','surveys','tasks','user_preferences','webhook_events')
order by c.relname;

-- V3. Sanity — the working app's tables must STILL have their authenticated
--     grants (this migration must NOT have touched them). EXPECT authenticated
--     rows present for each.
select table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in ('leads','customers','quotes','quote_line_items','jobs',
                     'job_crew','job_trucks','trucks','dispatch_assignments',
                     'profiles','lead_notes','business_profile')
group by table_name, grantee
order by table_name;

-- V4. Live black-box (anonymous). BEFORE = 200 (vulnerable); AFTER = 401/403/404.
--   for T in invoices payments companies payroll_entries sales_commissions documents; do
--     curl -s -o /dev/null -w "$T: %{http_code}\n" \
--       "$SUPABASE_URL/rest/v1/$T?select=id&limit=1" \
--       -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   done
