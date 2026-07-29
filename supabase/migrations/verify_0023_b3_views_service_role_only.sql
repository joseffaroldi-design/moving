-- =====================================================================
-- verify_0023_b3_views_service_role_only.sql   [RC1 B3 Step E access verify]
-- READ-ONLY. Run AFTER 0023. Modifies nothing. 3 grids (A–C).
-- Run each grid separately if the editor shows only the last result.
-- =====================================================================

-- ---- GRID A: view defs & security_invoker PRESERVED, ownership unchanged ----
select
  v.view_name,
  (c.oid is not null)                                   as exists_in_public,
  c.relkind = 'v'                                       as is_ordinary_view,
  exists (
    select 1 from unnest(coalesce(c.reloptions,'{}'::text[])) o
    where o ~* '^security_invoker\s*=\s*(true|on)$'
  )                                                     as security_invoker_true,
  pg_get_userbyid(c.relowner)                           as view_owner
from (values ('owner_dashboard_metrics'),('unpaid_invoice_queue'),('job_profitability')) v(view_name)
left join pg_class c     on c.relname = v.view_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by v.view_name;

-- ---- GRID B: role grants — expect ONLY service_role rows (no anon/PUBLIC/authenticated) ----
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('owner_dashboard_metrics','unpaid_invoice_queue','job_profitability')
  and grantee in ('anon','PUBLIC','authenticated','service_role')
order by table_name, grantee, privilege_type;

-- ---- GRID C: explicit privilege assertions ----
-- expect anon_select=false, authenticated_select=false, service_role_select=true
select t.view_name,
  has_table_privilege('anon',          'public.'||t.view_name, 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.'||t.view_name, 'SELECT') as authenticated_select,
  has_table_privilege('service_role',  'public.'||t.view_name, 'SELECT') as service_role_select
from (values ('owner_dashboard_metrics'),('unpaid_invoice_queue'),('job_profitability')) t(view_name)
order by t.view_name;
