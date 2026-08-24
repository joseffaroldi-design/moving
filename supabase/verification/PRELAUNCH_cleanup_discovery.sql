-- =====================================================================
-- PRELAUNCH_cleanup_discovery.sql   (READ-ONLY — safe to run in prod)
-- =====================================================================
-- Purpose: map the live operational data + FK graph so the agent can write
-- a safe, correctly-ordered transactional DELETE that wipes TEST/operational
-- data for the launch company WITHOUT touching tenant/config records
-- (companies, profiles, business_profile, trucks, website_media, buckets).
--
-- HOW TO RUN (Supabase → SQL Editor):
--   Run each block (D0..D4) SEPARATELY and paste the FULL result of each back
--   to the agent. Nothing here writes/deletes — every statement is a SELECT.
--
-- Target launch company_id (confirmed from migration 0010):
--   f05941f2-13db-4779-a1f3-2d6a74ccffcd
-- If D0 shows more than one company, tell the agent which id(s) to keep vs wipe.
-- =====================================================================


-- ---------------------------------------------------------------------
-- D0 — list ALL companies (confirm the launch tenant + spot test tenants)
-- ---------------------------------------------------------------------
select id, name, city, state, created_at
from public.companies
order by created_at;


-- ---------------------------------------------------------------------
-- D1 — every PUBLIC base table that has a `company_id` column, with the
--      row count FOR THE TARGET COMPANY. Auto-discovers the full set so
--      nothing is missed. (Uses query_to_xml to count dynamically.)
-- ---------------------------------------------------------------------
select
  c.table_name,
  (xpath(
     '/row/cnt/text()',
     query_to_xml(
       format(
         'select count(*) as cnt from public.%I where company_id = %L',
         c.table_name, 'f05941f2-13db-4779-a1f3-2d6a74ccffcd'
       ), false, true, ''
     )
   )::text[])[1]::int as rows_for_company
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
 and t.table_name   = c.table_name
where c.table_schema = 'public'
  and c.column_name  = 'company_id'
  and t.table_type   = 'BASE TABLE'
order by rows_for_company desc nulls last, c.table_name;


-- ---------------------------------------------------------------------
-- D2 — foreign-key graph among PUBLIC tables (child -> parent + delete_rule).
--      Tells the agent the correct delete order and what cascades already.
-- ---------------------------------------------------------------------
select
  tc.table_name    as child_table,
  kcu.column_name  as child_column,
  ccu.table_name   as parent_table,
  ccu.column_name  as parent_column,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema    = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema    = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name   = tc.constraint_name
 and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema    = 'public'
order by parent_table, child_table;


-- ---------------------------------------------------------------------
-- D3 — child tables that have `job_id` but NO `company_id` of their own
--      (e.g. job_crew, job_trucks). Counted via the parent job's company.
-- ---------------------------------------------------------------------
select
  c.table_name,
  (xpath(
     '/row/cnt/text()',
     query_to_xml(
       format(
         'select count(*) as cnt from public.%I x join public.jobs j on j.id = x.job_id where j.company_id = %L',
         c.table_name, 'f05941f2-13db-4779-a1f3-2d6a74ccffcd'
       ), false, true, ''
     )
   )::text[])[1]::int as rows_via_jobs
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
 and t.table_name   = c.table_name
where c.table_schema = 'public'
  and c.column_name  = 'job_id'
  and t.table_type   = 'BASE TABLE'
  and not exists (
    select 1 from information_schema.columns c2
    where c2.table_schema = 'public'
      and c2.table_name   = c.table_name
      and c2.column_name  = 'company_id'
  )
order by rows_via_jobs desc nulls last, c.table_name;


-- ---------------------------------------------------------------------
-- D4 — auth linkage sanity: how many customers are linked to an Auth user
--      (auth_user_id). Helps decide whether to keep any real portal logins.
-- ---------------------------------------------------------------------
select
  count(*)                                    as customers_total,
  count(*) filter (where auth_user_id is not null) as customers_with_login
from public.customers
where company_id = 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';
