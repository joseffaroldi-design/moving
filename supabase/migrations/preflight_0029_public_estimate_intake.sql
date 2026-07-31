-- =====================================================================
-- preflight_0029_public_estimate_intake.sql
-- Southern Magnolia Movers — PUBLIC ESTIMATE INTAKE  (Part A: READ-ONLY)
--
-- PURPOSE
--   Gather every fact the write migration (0029_public_estimate_intake.sql)
--   and the `public-estimate-intake` Edge Function depend on, BEFORE any
--   write object is authored. This file performs NO writes: it contains only
--   SELECTs against information_schema / pg_catalog / to_regclass. It creates
--   no table, function, policy, grant, or row, and starts no transaction.
--
--   Companion write migration (NOT YET AUTHORED): 0029_public_estimate_intake.sql
--     (0028 is intentionally skipped — reserved for Crew Mobile P2.)
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste the SINGLE query in
--   SECTION 1 -> Run. It returns ONE row / ONE column named `preflight`
--   (jsonb). Click the cell to expand, then paste the full JSON back here.
--   SECTION 2 holds a few OPTIONAL standalone diagnostics (also read-only) if
--   you want the raw rows; they are not required for the decision.
--
-- SAFETY
--   * Read-only. No begin/commit. No DDL/DML. Safe to run on production.
--   * Reveals only schema metadata (no customer/lead PII rows are selected).
--
-- STOP CONDITIONS (report the blocker; do NOT invent a workaround, do NOT
-- alter any base table):
--   S1. customers_created_by_nullable != 'YES'
--   S2. leads_created_by_nullable     != 'YES'
--   S3. activity_log_actor_id_nullable != 'YES'
--   S4. activity_log has a CHECK/enum on actor_role that forbids 'public'
--       (see activity_log_actor_role.blocks_public)
--   S5. customers_notnull_without_default or leads_notnull_without_default
--       lists ANY column we cannot supply without a signed-in user
--       (anything beyond: id, company_id, first_name, last_name, customer_id,
--        status, created_at/updated_at — i.e. an unexpected NOT NULL w/o default)
--   S6. create_public_lead_conflict is not empty (name already taken)
--   S7. any trigger in `triggers` transforms/rejects rows using auth.uid()
--       or otherwise blocks a user-less insert
--   If any S# holds -> STOP and return options for owner review.
-- =====================================================================


-- =====================================================================
-- SECTION 1 — SINGLE COMPACT READ-ONLY REPORT  (run this; paste `preflight`)
-- =====================================================================
with
cust_cols as (
  select json_agg(json_build_object(
           'column', column_name, 'type', data_type,
           'nullable', is_nullable, 'default', column_default)
         order by ordinal_position) as j
  from information_schema.columns
  where table_schema='public' and table_name='customers'
),
lead_cols as (
  select json_agg(json_build_object(
           'column', column_name, 'type', data_type,
           'nullable', is_nullable, 'default', column_default)
         order by ordinal_position) as j
  from information_schema.columns
  where table_schema='public' and table_name='leads'
),
al_cols as (
  select json_agg(json_build_object(
           'column', column_name, 'type', data_type,
           'nullable', is_nullable, 'default', column_default)
         order by ordinal_position) as j
  from information_schema.columns
  where table_schema='public' and table_name='activity_log'
),
cust_created_by as (
  select is_nullable from information_schema.columns
  where table_schema='public' and table_name='customers' and column_name='created_by'
),
lead_created_by as (
  select is_nullable from information_schema.columns
  where table_schema='public' and table_name='leads' and column_name='created_by'
),
al_actor_id as (
  select is_nullable from information_schema.columns
  where table_schema='public' and table_name='activity_log' and column_name='actor_id'
),
cust_nn_nodefault as (
  select json_agg(column_name order by ordinal_position) as j
  from information_schema.columns
  where table_schema='public' and table_name='customers'
    and is_nullable='NO' and column_default is null
),
lead_nn_nodefault as (
  select json_agg(column_name order by ordinal_position) as j
  from information_schema.columns
  where table_schema='public' and table_name='leads'
    and is_nullable='NO' and column_default is null
),
lead_status_enum as (
  select json_agg(e.enumlabel order by e.enumsortorder) as j
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname='lead_status'
),
checks as (
  select json_agg(json_build_object(
           'table', conrelid::regclass::text,
           'name', conname,
           'def', pg_get_constraintdef(oid))) as j
  from pg_constraint
  where contype='c'
    and conrelid in ('public.customers'::regclass,
                     'public.leads'::regclass,
                     'public.activity_log'::regclass)
),
fks as (
  select json_agg(json_build_object(
           'table', conrelid::regclass::text,
           'name', conname,
           'def', pg_get_constraintdef(oid))) as j
  from pg_constraint
  where contype='f'
    and conrelid in ('public.customers'::regclass,
                     'public.leads'::regclass,
                     'public.activity_log'::regclass)
),
trigs as (
  select json_agg(json_build_object(
           'table', c.relname,
           'trigger', t.tgname,
           'enabled', (t.tgenabled <> 'D'),
           'def', pg_get_triggerdef(t.oid))) as j
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public'
    and c.relname in ('customers','leads','activity_log')
    and not t.tgisinternal
),
grants as (
  select json_agg(json_build_object(
           'table', table_name, 'grantee', grantee, 'priv', privilege_type)
         order by table_name, grantee, privilege_type) as j
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('customers','leads','activity_log')
    and grantee in ('anon','authenticated','service_role','PUBLIC')
),
rls as (
  select json_agg(json_build_object(
           'table', relname,
           'rls_enabled', relrowsecurity,
           'rls_forced', relforcerowsecurity)) as j
  from pg_class
  where oid in ('public.customers'::regclass,
                'public.leads'::regclass,
                'public.activity_log'::regclass)
),
fn_conflict as (
  select coalesce(json_agg(json_build_object(
           'name', p.proname,
           'args', pg_get_function_identity_arguments(p.oid),
           'owner', pg_get_userbyid(p.proowner),
           'security_definer', p.prosecdef)), '[]'::json) as j
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='create_public_lead'
),
definer_ref as (
  -- Owner/definer flag of the existing atomic RPC we mirror. The new RPC
  -- should be owned by the SAME role so DEFINER context bypasses RLS.
  select coalesce(json_agg(json_build_object(
           'name', p.proname,
           'args', pg_get_function_identity_arguments(p.oid),
           'owner', pg_get_userbyid(p.proowner),
           'security_definer', p.prosecdef)), '[]'::json) as j
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='create_lead_with_customer'
),
al_actor_role as (
  select json_build_object(
    'data_type', (select data_type from information_schema.columns
                   where table_schema='public' and table_name='activity_log'
                     and column_name='actor_role'),
    'check_constraints_on_actor_role',
      coalesce((select json_agg(pg_get_constraintdef(oid))
                from pg_constraint
                where conrelid='public.activity_log'::regclass and contype='c'
                  and pg_get_constraintdef(oid) ilike '%actor_role%'), '[]'::json),
    'blocks_public',
      exists(select 1 from pg_constraint
             where conrelid='public.activity_log'::regclass and contype='c'
               and pg_get_constraintdef(oid) ilike '%actor_role%')
  ) as j
),
business_profile_tenant as (
  -- Tenant source of truth: the single business_profile row's company_id.
  select json_build_object(
    'row_count', (select count(*) from public.business_profile),
    'exactly_one', ((select count(*) from public.business_profile) = 1)
    -- NOTE: company_id VALUE intentionally NOT selected here (keep the tenant
    -- id out of this report). The write RPC resolves it server-side.
  ) as j
),
migrations_meta as (
  select json_build_object(
    'supabase_migrations_table_exists',
      (to_regclass('supabase_migrations.schema_migrations') is not null),
    'note',
      'Migration numbering is a repo concern; 0028 is reserved for Crew Mobile P2. Proposed write migration = 0029_public_estimate_intake.sql. If the table above exists, run the OPTIONAL query D2 in SECTION 2 to list applied versions.'
  ) as j
)
select json_build_object(
  '_meta', json_build_object(
     'artifact', 'preflight_0029_public_estimate_intake.sql',
     'read_only', true,
     'proposed_write_migration', '0029_public_estimate_intake.sql'),

  -- STOP-condition primitives
  'customers_created_by_nullable', (select is_nullable from cust_created_by),   -- expect 'YES'
  'leads_created_by_nullable',     (select is_nullable from lead_created_by),   -- expect 'YES'
  'activity_log_actor_id_nullable',(select is_nullable from al_actor_id),       -- expect 'YES'
  'customers_notnull_without_default', (select j from cust_nn_nodefault),
  'leads_notnull_without_default',     (select j from lead_nn_nodefault),
  'create_public_lead_conflict',   (select j from fn_conflict),                 -- expect []
  'activity_log_actor_role',       (select j from al_actor_role),               -- blocks_public expect false

  -- Full schema facts
  'customers_columns',   (select j from cust_cols),
  'leads_columns',       (select j from lead_cols),
  'activity_log_columns',(select j from al_cols),
  'lead_status_enum_labels', (select j from lead_status_enum),
  'check_constraints',   (select j from checks),
  'foreign_keys',        (select j from fks),
  'triggers',            (select j from trigs),
  'grants',              (select j from grants),
  'rls',                 (select j from rls),

  -- Function owner reference for the new DEFINER RPC
  'reference_definer_create_lead_with_customer', (select j from definer_ref),

  -- Tenant + migration metadata
  'tenant_business_profile', (select j from business_profile_tenant),
  'migrations_meta',         (select j from migrations_meta)
) as preflight;


-- =====================================================================
-- SECTION 2 — OPTIONAL standalone diagnostics (READ-ONLY; run if you want
--             the raw rows instead of / in addition to the JSON above)
-- =====================================================================

-- D1. created_by nullability + defaults, side by side.
-- select table_name, column_name, is_nullable, data_type, column_default
-- from information_schema.columns
-- where table_schema='public'
--   and table_name in ('customers','leads')
--   and column_name = 'created_by'
-- order by table_name;

-- D2. Applied migration versions (ONLY if migrations_meta.supabase_migrations_
--     table_exists = true; otherwise this table does not exist and you can skip).
-- select version from supabase_migrations.schema_migrations order by version;

-- D3. All triggers on the three tables (human-readable definitions).
-- select c.relname as table, t.tgname as trigger, pg_get_triggerdef(t.oid) as def
-- from pg_trigger t
-- join pg_class c on c.oid=t.tgrelid
-- join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relname in ('customers','leads','activity_log')
--   and not t.tgisinternal
-- order by c.relname, t.tgname;

-- D4. Current grants for the three tables (defense-in-depth review).
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public'
--   and table_name in ('customers','leads','activity_log')
--   and grantee in ('anon','authenticated','service_role','PUBLIC')
-- order by table_name, grantee, privilege_type;

-- D5. Confirm no existing function name collision for the proposed RPC.
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname='create_public_lead';
-- =====================================================================
-- END — READ-ONLY. This file performs NO writes.
-- =====================================================================
