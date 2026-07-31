-- =====================================================================
-- 0029_public_estimate_intake.sql
-- Southern Magnolia Movers — PUBLIC ESTIMATE INTAKE (write migration).
-- OWNER-EXECUTED ONLY. The author does NOT run this. Additive & idempotent.
--
-- (0028 intentionally skipped — reserved for Crew Mobile P2.)
--
-- WHAT THIS ADDS (nothing existing is modified):
--   1. public.public_intake_idempotency  — service-owned claim table (DB-enforced
--      idempotency; no client grant, RLS enabled, owner-only writes).
--   2. public.create_public_lead(jsonb)   — SECURITY DEFINER RPC that, in ONE
--      atomic transaction: claims the idempotency key, inserts one customer +
--      one lead (status 'new', source 'website', created_by NULL) and one
--      activity_log audit row. Granted EXECUTE to service_role ONLY.
--
-- TRUST MODEL
--   * anon / authenticated / public : gain NOTHING (no table grant, no execute).
--   * The Edge Function `public-estimate-intake` calls this RPC with the
--     service-role key. The browser never reaches this function or these tables.
--   * company_id is resolved INSIDE this function (never a client argument),
--     never returned. Client cannot set status/assignment/pricing/company/owner.
--   * created_by is NULL (no signed-in user); mirrors create_lead_with_customer
--     otherwise. Requires customers.created_by / leads.created_by to be NULLABLE
--     and activity_log.actor_id NULLABLE + actor_role free-text — ALL confirmed
--     by preflight_0029_public_estimate_intake.sql (run Part A first).
--
-- RUN ORDER: run preflight_0029 (READ-ONLY) FIRST, confirm no STOP condition,
--            then Part B here. Part C verifies. Part D rolls back.
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT
--   Run the standalone read-only file `preflight_0029_public_estimate_intake.sql`
--   and confirm ALL of:
--     * customers_created_by_nullable = 'YES'
--     * leads_created_by_nullable     = 'YES'
--     * activity_log_actor_id_nullable = 'YES'
--     * activity_log_actor_role.blocks_public = false
--     * customers_notnull_without_default / leads_notnull_without_default hold
--       only columns this function supplies (id/company_id/first_name/last_name/
--       customer_id/status/timestamps)
--     * create_public_lead_conflict = []
--     * no trigger blocks a user-less insert
--     * tenant_business_profile.exactly_one = true
--   If any STOP condition holds, DO NOT run Part B.
-- =====================================================================


-- =====================================================================
-- PART B — MIGRATION (single transaction)
-- =====================================================================
begin;

-- B1. DB-enforced idempotency claim table. Owner-written only; no client grant.
create table if not exists public.public_intake_idempotency (
  key_hash    text primary key,           -- sha256 hex of the client token
  created_at  timestamptz not null default now()
);
create index if not exists public_intake_idempotency_created_idx
  on public.public_intake_idempotency (created_at);

-- Lock the table down completely from every client role. The SECURITY DEFINER
-- function (owner=postgres) writes it in owner context; no client grant needed.
revoke all on table public.public_intake_idempotency from anon, authenticated, public;
alter table public.public_intake_idempotency enable row level security;
-- No policy: with RLS enabled + zero client grant, no client can read/write it.

-- B2. Atomic public intake RPC.
create or replace function public.create_public_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Single documented source of truth for the tenant. Lives ONLY here (never in
  -- JS, the Edge Function, or tests). Verified to exist below.
  c_company constant uuid := 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';
  v_company   uuid;
  v_key_hash  text := nullif(btrim(coalesce(p_payload->>'key_hash','')), '');
  v_claimed   text;
  v_first     text := btrim(coalesce(p_payload->>'first_name',''));
  v_last      text := btrim(coalesce(p_payload->>'last_name',''));
  v_email     text := nullif(btrim(coalesce(p_payload->>'email','')), '');
  v_phone     text := nullif(btrim(coalesce(p_payload->>'phone','')), '');
  v_customer  uuid;
  v_lead      uuid;
begin
  -- Resolve + assert tenant server-side (never from the client).
  select id into v_company from public.companies where id = c_company;
  if v_company is null then
    raise exception 'intake_misconfigured';   -- generic; Edge maps to generic fail
  end if;

  -- Defense-in-depth validation (Edge validates first; re-check the essentials).
  if v_first = '' or v_last = '' then
    raise exception 'invalid_name';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'missing_contact';
  end if;

  -- Atomic idempotency claim. If the key was already used, this is a replay:
  -- return WITHOUT creating any new customer/lead (no duplicate).
  if v_key_hash is not null then
    insert into public.public_intake_idempotency (key_hash)
    values (v_key_hash)
    on conflict (key_hash) do nothing
    returning key_hash into v_claimed;

    if v_claimed is null then
      return jsonb_build_object('status', 'duplicate');
    end if;
  end if;

  -- One customer (created_by NULL: no signed-in user).
  insert into public.customers (company_id, created_by, first_name, last_name, email, phone, notes)
  values (
    v_company, null, v_first, v_last, v_email, v_phone,
    nullif(btrim(coalesce(p_payload->>'customer_notes','')), '')
  )
  returning id into v_customer;

  -- One lead (status 'new', source 'website', created_by NULL).
  insert into public.leads (
    company_id, created_by, customer_id, status, source, move_date,
    origin_address, destination_address, notes
  )
  values (
    v_company, null, v_customer, 'new'::public.lead_status, 'website',
    (nullif(btrim(coalesce(p_payload->>'move_date','')), ''))::date,
    nullif(btrim(coalesce(p_payload->>'origin_address','')), ''),
    nullif(btrim(coalesce(p_payload->>'destination_address','')), ''),
    nullif(btrim(coalesce(p_payload->>'notes','')), '')
  )
  returning id into v_lead;

  -- One audit row (no PII values — flags/enums/marketing tags only).
  insert into public.activity_log (
    company_id, actor_id, actor_email, actor_role, action,
    entity_type, entity_id, summary, metadata
  )
  values (
    v_company, null, null, 'public', 'lead.public_intake',
    'lead', v_lead::text, 'Website estimate request received',
    jsonb_build_object(
      'source', 'website',
      'has_email', (v_email is not null),
      'has_phone', (v_phone is not null),
      'move_type', p_payload->>'move_type',
      'utm_source', p_payload->>'utm_source',
      'utm_medium', p_payload->>'utm_medium',
      'utm_campaign', p_payload->>'utm_campaign'
    )
  );

  -- Never return ids/tenant/dup detail to the caller.
  return jsonb_build_object('status', 'created');
end;
$$;

-- B3. GRANTS — service_role ONLY. anon/authenticated/public get nothing.
revoke execute on function public.create_public_lead(jsonb) from public, anon, authenticated;
grant  execute on function public.create_public_lead(jsonb) to service_role;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste every result)
-- =====================================================================
-- C1. Function exists, is SECURITY DEFINER, owned by a BYPASSRLS role (postgres).
-- select p.proname, p.prosecdef as security_definer,
--        pg_get_userbyid(p.proowner) as owner
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname='create_public_lead';

-- C2. EXECUTE grant is service_role ONLY (expect exactly one row: service_role).
-- select grantee, privilege_type
-- from information_schema.role_routine_grants
-- where routine_schema='public' and routine_name='create_public_lead'
--   and grantee in ('anon','authenticated','public','service_role')
-- order by grantee;

-- C3. Idempotency table has NO client grant + RLS enabled.
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name='public_intake_idempotency';   -- expect no anon/authenticated rows
-- select relrowsecurity from pg_class where oid='public.public_intake_idempotency'::regclass;  -- expect true

-- C4. Functional smoke (run as service_role / via the Edge Function, NOT anon):
--     select public.create_public_lead(jsonb_build_object(
--       'first_name','Test','last_name','Intake','phone','5045550123',
--       'origin_address','New Orleans 70112','destination_address','Metairie 70001',
--       'notes','Move Type: Residential Moving','key_hash', md5(random()::text)));
--     -> {"status":"created"}   (re-running with the SAME key_hash -> {"status":"duplicate"})
--     Confirm one customers row, one leads row (status 'new', source 'website'),
--     one activity_log row (action 'lead.public_intake'), and NO orphan on failure.
--     Remember to delete the test rows afterward.

-- C5. Negative — anon cannot execute (expect permission denied):
--     set role anon; select public.create_public_lead('{}'::jsonb); reset role;


-- =====================================================================
-- PART D — ROLLBACK (removes ONLY objects created by 0029)
-- =====================================================================
-- begin;
--   drop function if exists public.create_public_lead(jsonb);
--   drop table    if exists public.public_intake_idempotency;
-- commit;
-- =====================================================================
