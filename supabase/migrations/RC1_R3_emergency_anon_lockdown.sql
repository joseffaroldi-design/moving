-- =====================================================================
-- RC1_R3_emergency_anon_lockdown.sql       [RC1 CRITICAL — P0 SECURITY]
-- Southern Magnolia Movers.
-- RUN ORDER: RC1_R1 (review, read-only) -> RC1_R2 (snapshot) -> RC1_R3 (this).
-- Rollback: RC1_R4_rollback.sql (restores the RC1_R2 snapshot exactly).
--
-- WHY: RC1 diagnostics proved 42 public relations grant FULL DML
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) to `anon`. An
-- unauthenticated caller can currently read, modify, delete and TRUNCATE most
-- of the database (companies, payments, invoices, payroll, commissions,
-- deposits, documents, crm notes, communications, portal tokens, etc.).
-- Highest-priority RC1 blocker (supersedes 0019 + 0020, which missed
-- `payments` and 38 other tables).
--
-- SAFETY: Verified across the WHOLE repo (frontend, Edge Function, FastAPI
-- backend, RPCs) — none of the 42 relations are read/written by any client
-- path. FastAPI uses MongoDB only; mvp-dashboard reads profiles/leads/quotes/
-- jobs (all already locked). SECURITY DEFINER RPCs run as their owner and
-- bypass these grants, so a full deny-by-default cannot break the working app.
-- service_role is intentionally untouched (trusted server code).
--
-- STRATEGY (deny-by-default):
--   * REVOKE ALL from anon, public, authenticated on every listed relation.
--   * TABLES + PARTITIONED TABLES (relkind 'r'/'p'): ENABLE + FORCE RLS
--     (no policy => zero direct client access; FORCE also covers table owner).
--   * VIEWS / MATVIEWS (relkind 'v'/'m'): revoke only (RLS N/A).
--   * Touches NOTHING else: no ownership change, no function/RPC grants, no
--     sequence privileges, no triggers, no FK definitions, no storage/auth
--     schemas. Only public-schema table/view GRANTs + RLS flags.
--
-- Idempotent / re-runnable. Transactional. Requires RC1_R2 snapshot to exist.
-- =====================================================================

begin;

-- Guard: refuse to run without a rollback point.
do $$
begin
  if to_regclass('rc1_backup.grants_snapshot') is null then
    raise exception 'RC1_R2_pre_snapshot.sql must be run FIRST (rc1_backup.grants_snapshot missing). Aborting — no rollback point.';
  end if;
end $$;

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

    -- Strip ALL client-role access (applies to tables, partitioned tables, views, matviews).
    execute format('revoke all on public.%I from anon', r);
    execute format('revoke all on public.%I from public', r);
    execute format('revoke all on public.%I from authenticated', r);

    -- Deny-by-default RLS on real + partitioned tables only.
    if k in ('r','p') then
      execute format('alter table public.%I enable row level security', r);
      execute format('alter table public.%I force  row level security', r);
      raise notice 'locked TABLE  public.% (RLS enabled+forced; all client grants revoked)', r;
    else
      raise notice 'locked %  public.% (all client grants revoked; RLS N/A)',
        case k when 'v' then 'VIEW  ' when 'm' then 'MATVIEW' when 'f' then 'FOREIGN' else k::text end, r;
    end if;
  end loop;
end $$;

commit;

-- =====================================================================
-- VERIFICATION (read-only) — run AFTER commit; paste results back.
-- =====================================================================

-- V1. Any anon/public grant remaining ANYWHERE in public? EXPECT ZERO ROWS.
select table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','public','PUBLIC')
group by table_name, grantee
order by table_name, grantee;

-- V2. RLS state for locked real/partitioned tables. EXPECT rls_enabled=true AND
--     rls_forced=true for every table in the list (views won't appear).
select c.relname as tbl, c.relkind::text as relkind,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind in ('r','p')
  and c.relname = any (array[
    'app_navigation_items','app_settings','automation_rules','communications',
    'companies','company_onboarding_steps','crew_time_entries','crm_notes',
    'customer_deposits','damage_report_photos','damage_reports',
    'document_signatures','documents','inventory_catalog_items','inventory_items',
    'invoice_line_items','invoices','lead_sources','message_templates',
    'notification_queue','operational_issues','payments','payroll_entries',
    'payroll_runs','portal_activity','portal_tokens','pricing_rules','rooms',
    'sales_commissions','saved_views','storage_uploads','survey_items',
    'survey_rooms','surveys','tasks','user_preferences','webhook_events'])
order by c.relname;

-- V3. Sanity — the working app's tables must STILL have authenticated grants
--     (this migration must NOT have touched them). EXPECT a row per table.
select table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
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
