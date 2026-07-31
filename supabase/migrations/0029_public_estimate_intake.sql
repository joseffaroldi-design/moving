-- =====================================================================
-- 0029_public_estimate_intake.sql   (HARDENED — rev 2)
-- Southern Magnolia Movers — PUBLIC ESTIMATE INTAKE (write migration).
-- OWNER-EXECUTED ONLY. Additive. (0028 skipped — reserved for Crew Mobile P2.)
--
-- Preflight preflight_0029 confirmed (live): customers/leads.created_by NULLABLE
-- (FK -> profiles ON DELETE SET NULL), activity_log.actor_id NULLABLE,
-- actor_role free-text (no check), lead_status has 'new', no INSERT triggers
-- (only BEFORE UPDATE set_updated_at), no name collision, single business_profile
-- row, RLS enabled but NOT forced (postgres-owned DEFINER bypasses RLS to insert).
--
-- NOTHING existing is modified: no base-table column/RLS policy/staff RPC/grant
-- is changed. This migration only ADDS one table + one function.
--
-- CHANGE LOG vs rev 1:
--   #1 Requires the idempotency table + function to be ABSENT (hard guard +
--      plain CREATE, not "if not exists").
--   #2 key_hash is MANDATORY and must be 64 lowercase hex (sha256). No blank
--      bypass — the function cannot create a lead without claiming a valid key.
--   #3 Adds payload_hash. Same key + same payload -> 'duplicate' (idempotent);
--      same key + different payload -> controlled 'idempotency_conflict'.
--   #4 Full bounded, defense-in-depth validation of every stored field.
--   #5 Audit metadata normalized + length-bounded; NO name/address/phone/email/
--      notes ever stored in activity_log.
--   #6/#7 Explicit owner set + exact ACL verification in Part C.
--   #8 Part C smoke test is fully ROLLBACK-contained (leaves zero data) and uses
--      64-hex key/payload hashes (never md5). Negative cases included.
--   #9 Retention defined (owner-run 30-day cleanup; no scheduler dependency).
-- =====================================================================


-- =====================================================================
-- PART A — READ-ONLY ABSENCE + PRECONDITION CHECK (run FIRST; expect all clear)
-- =====================================================================
select
  to_regclass('public.public_intake_idempotency') as idempotency_table_regclass,  -- expect NULL (absent)
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='create_public_lead') as function_exists,  -- expect false
  (select count(*) from public.business_profile) as business_profile_rows,        -- expect 1
  exists(select 1 from public.companies
         where id='f05941f2-13db-4779-a1f3-2d6a74ccffcd') as tenant_company_exists;-- expect true
-- If idempotency_table_regclass is NOT NULL or function_exists is true, STOP.


-- =====================================================================
-- PART B — MIGRATION (single transaction). Aborts safely if objects exist.
-- =====================================================================
begin;

-- B0. Hard guard: require absence (never silently reuse an incompatible object).
do $$
begin
  if to_regclass('public.public_intake_idempotency') is not null then
    raise exception '0029 ABORT: public.public_intake_idempotency already exists';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='create_public_lead') then
    raise exception '0029 ABORT: public.create_public_lead already exists';
  end if;
end $$;

-- B1. Idempotency claim table (plain CREATE). key_hash + payload_hash, both
--     enforced to 64 lowercase hex by CHECK. Owner-written only; no client grant.
create table public.public_intake_idempotency (
  key_hash     text primary key
                 constraint public_intake_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null
                 constraint public_intake_payload_hash_format check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now()
);
create index public_intake_idempotency_created_idx
  on public.public_intake_idempotency (created_at);

-- Zero client grants: neither browser role nor service_role touches it directly;
-- only the postgres-owned DEFINER function writes it (in owner context).
revoke all on table public.public_intake_idempotency from anon, authenticated, public, service_role;
alter table public.public_intake_idempotency enable row level security;
-- No policy: RLS enabled + zero grant => unreachable by every client role.

-- B2. Atomic, self-validating public intake RPC.
create function public.create_public_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Single documented tenant source of truth. Lives ONLY here (never in JS/Edge/tests).
  c_company constant uuid := 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';
  c_move_types constant text[] := array[
    'Residential Moving','Commercial Moving','Packing Services',
    'Specialty Items','Local Moving','Long-Distance'];

  v_company     uuid;
  v_key_hash    text := btrim(coalesce(p_payload->>'key_hash',''));
  v_payload_hash text := btrim(coalesce(p_payload->>'payload_hash',''));
  v_existing_ph text;
  v_claimed     text;

  v_first   text := btrim(coalesce(p_payload->>'first_name',''));
  v_last    text := btrim(coalesce(p_payload->>'last_name',''));
  v_email   text := nullif(btrim(coalesce(p_payload->>'email','')), '');
  v_phone   text := nullif(btrim(coalesce(p_payload->>'phone','')), '');
  v_origin  text := nullif(btrim(coalesce(p_payload->>'origin_address','')), '');
  v_dest    text := nullif(btrim(coalesce(p_payload->>'destination_address','')), '');
  v_notes   text := nullif(btrim(coalesce(p_payload->>'notes','')), '');
  v_cnotes  text := nullif(btrim(coalesce(p_payload->>'customer_notes','')), '');
  v_mtype   text := nullif(btrim(coalesce(p_payload->>'move_type','')), '');
  v_mdate_t text := nullif(btrim(coalesce(p_payload->>'move_date','')), '');
  v_mdate   date;

  v_customer uuid;
  v_lead     uuid;
begin
  -- Payload must be a JSON object.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  -- Resolve + assert tenant server-side (never from the client).
  select id into v_company from public.companies where id = c_company;
  if v_company is null then raise exception 'intake_misconfigured'; end if;

  -- ---- Idempotency key format (MANDATORY) ----
  if v_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_key_hash'; end if;
  if v_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_payload_hash'; end if;

  -- ---- Bounded, defense-in-depth field validation ----
  if v_first = '' or char_length(v_first) > 80 then raise exception 'invalid_first_name'; end if;
  if v_last  = '' or char_length(v_last)  > 80 then raise exception 'invalid_last_name'; end if;

  if v_email is not null then
    if char_length(v_email) > 160 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'invalid_email';
    end if;
  end if;

  if v_phone is not null then
    if char_length(v_phone) > 40
       or v_phone !~ '^[+0-9 ().-]+$'
       or char_length(regexp_replace(v_phone,'[^0-9]','','g')) not between 7 and 15 then
      raise exception 'invalid_phone';
    end if;
  end if;

  if v_email is null and v_phone is null then raise exception 'missing_contact'; end if;

  if v_origin is not null and char_length(v_origin) > 200 then raise exception 'invalid_origin'; end if;
  if v_dest   is not null and char_length(v_dest)   > 200 then raise exception 'invalid_destination'; end if;
  if v_notes  is not null and char_length(v_notes)  > 4000 then raise exception 'invalid_notes'; end if;
  if v_cnotes is not null and char_length(v_cnotes) > 2000 then raise exception 'invalid_customer_notes'; end if;

  if v_mtype is not null and not (v_mtype = any(c_move_types)) then
    raise exception 'invalid_move_type';
  end if;

  if v_mdate_t is not null then
    if v_mdate_t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_move_date'; end if;
    v_mdate := v_mdate_t::date;
    if v_mdate < current_date or v_mdate > (current_date + interval '2 years')::date then
      raise exception 'move_date_out_of_range';
    end if;
  end if;

  -- ---- Idempotency claim (BEFORE any write). No claim => no lead. ----
  insert into public.public_intake_idempotency (key_hash, payload_hash)
  values (v_key_hash, v_payload_hash)
  on conflict (key_hash) do nothing
  returning key_hash into v_claimed;

  if v_claimed is null then
    select payload_hash into v_existing_ph
      from public.public_intake_idempotency where key_hash = v_key_hash;
    if v_existing_ph = v_payload_hash then
      return jsonb_build_object('status', 'duplicate');   -- true replay
    else
      raise exception 'idempotency_conflict';              -- same key, different payload
    end if;
  end if;

  -- ---- Atomic customer + lead + audit ----
  insert into public.customers (company_id, created_by, first_name, last_name, email, phone, notes)
  values (v_company, null, v_first, v_last, v_email, v_phone, v_cnotes)
  returning id into v_customer;

  insert into public.leads (
    company_id, created_by, customer_id, status, source, move_date,
    origin_address, destination_address, notes
  )
  values (
    v_company, null, v_customer, 'new'::public.lead_status, 'website',
    v_mdate, v_origin, v_dest, v_notes
  )
  returning id into v_lead;

  -- Audit: minimized + bounded. NO name/address/phone/email/notes.
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
      'move_type', v_mtype,   -- already allowlisted or null
      'utm_source',   left(nullif(btrim(coalesce(p_payload->>'utm_source','')),''),120),
      'utm_medium',   left(nullif(btrim(coalesce(p_payload->>'utm_medium','')),''),120),
      'utm_campaign', left(nullif(btrim(coalesce(p_payload->>'utm_campaign','')),''),120)
    )
  );

  return jsonb_build_object('status', 'created');   -- never returns ids/tenant
end;
$$;

-- B3. Explicit owner (preflight confirmed the reference DEFINER RPC is owned by
--     postgres, a BYPASSRLS role). The SQL Editor runs as postgres, so this is a
--     no-op assertion that documents + guarantees the intended owner.
alter function public.create_public_lead(jsonb) owner to postgres;

-- B4. GRANTS — service_role ONLY. anon/authenticated/PUBLIC get nothing.
revoke execute on function public.create_public_lead(jsonb) from public, anon, authenticated;
grant  execute on function public.create_public_lead(jsonb) to service_role;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B; paste every result)
-- =====================================================================

-- C1. Function: SECURITY DEFINER, owner=postgres (BYPASSRLS), pinned search_path.
select p.proname,
       p.prosecdef                                   as security_definer,   -- expect true
       pg_get_userbyid(p.proowner)                   as owner,              -- expect postgres
       (select rolbypassrls from pg_roles
         where rolname = pg_get_userbyid(p.proowner)) as owner_bypassrls,   -- expect true
       p.proconfig                                    as config             -- expect {search_path=public, pg_temp}
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='create_public_lead';

-- C2a. Exact per-role EXECUTE (definitive for real roles).
select
  has_function_privilege('anon',          'public.create_public_lead(jsonb)','EXECUTE') as anon_exec,          -- false
  has_function_privilege('authenticated', 'public.create_public_lead(jsonb)','EXECUTE') as authenticated_exec, -- false
  has_function_privilege('service_role',  'public.create_public_lead(jsonb)','EXECUTE') as service_role_exec;   -- true

-- C2b. Exact ACL inspection incl. PUBLIC (grantee 0). Expect public_execute=false,
--      and EXECUTE present ONLY for service_role (+ owner).
select
  bool_or(a.grantee = 0 and a.privilege_type='EXECUTE')                              as public_execute,        -- false
  bool_or(coalesce(r.rolname,'') = 'anon'          and a.privilege_type='EXECUTE')   as anon_execute,          -- false
  bool_or(coalesce(r.rolname,'') = 'authenticated' and a.privilege_type='EXECUTE')   as authenticated_execute, -- false
  bool_or(coalesce(r.rolname,'') = 'service_role'  and a.privilege_type='EXECUTE')   as service_role_execute   -- true
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(p.proacl) a
left join pg_roles r on r.oid = a.grantee
where n.nspname='public' and p.proname='create_public_lead';

-- C3. Idempotency table: RLS on, no policies, no client grants.
select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where oid='public.public_intake_idempotency'::regclass;              -- rls_enabled=true
select count(*) as policy_count from pg_policies
where schemaname='public' and tablename='public_intake_idempotency';               -- expect 0
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='public_intake_idempotency'
  and grantee in ('anon','authenticated','service_role','PUBLIC');                  -- expect NO rows
select conname, pg_get_constraintdef(oid) as def from pg_constraint
where conrelid='public.public_intake_idempotency'::regclass and contype='c';        -- both hex CHECKs

-- C4. ROLLBACK-CONTAINED functional smoke test (leaves ZERO data).
--     64-hex key/payload hashes (never md5). Uses unique marker names.
begin;
  -- (1) first call -> created
  select public.create_public_lead(jsonb_build_object(
    'first_name','PreflightZZ','last_name','DoNotKeep','phone','5045550123',
    'origin_address','New Orleans 70112','destination_address','Metairie 70001',
    'move_type','Residential Moving','notes','— Website Estimate Request —',
    'key_hash',    repeat('a',64),
    'payload_hash',repeat('b',64))) as call_1;   -- expect {"status":"created"}

  -- (2) same key + same payload -> duplicate (no new rows)
  select public.create_public_lead(jsonb_build_object(
    'first_name','PreflightZZ','last_name','DoNotKeep','phone','5045550123',
    'origin_address','New Orleans 70112','destination_address','Metairie 70001',
    'move_type','Residential Moving','notes','— Website Estimate Request —',
    'key_hash',    repeat('a',64),
    'payload_hash',repeat('b',64))) as call_2;   -- expect {"status":"duplicate"}

  -- (3) counts inside the txn: exactly one of each
  select
    (select count(*) from public.customers c
       where c.first_name='PreflightZZ' and c.last_name='DoNotKeep')                  as customers_created,   -- 1
    (select count(*) from public.leads l join public.customers c on c.id=l.customer_id
       where c.first_name='PreflightZZ' and c.last_name='DoNotKeep'
         and l.source='website' and l.status='new')                                  as leads_created,       -- 1
    (select count(*) from public.public_intake_idempotency where key_hash=repeat('a',64)) as idempotency_claims, -- 1
    (select count(*) from public.activity_log
       where action='lead.public_intake'
         and entity_id in (select l.id::text from public.leads l
                             join public.customers c on c.id=l.customer_id
                             where c.first_name='PreflightZZ'))                        as audit_rows;          -- 1
rollback;
-- Post-rollback (optional): confirm nothing persisted.
-- select count(*) from public.customers where first_name='PreflightZZ';  -- expect 0

-- C5. NEGATIVE cases — fully ROLLBACK-CONTAINED. Each test triggers exactly ONE
--     invalid condition, treats the expected exception as PASS, and FAILS HARD
--     (re-raises) if the call unexpectedly succeeds. rollback discards anything.
begin;
do $$
declare
  -- Valid base (unique 64-hex key/payload); each test breaks ONE thing.
  base jsonb := jsonb_build_object(
    'first_name','NegZZ','last_name','DoNotKeep','phone','5045550123',
    'key_hash', repeat('1',64), 'payload_hash', repeat('a',64));
begin
  -- (a) payload not an object
  begin
    perform public.create_public_lead('[]'::jsonb);
    raise exception 'TEST FAILED: non-object payload accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: non-object payload accepted' then raise; end if;
    raise notice 'PASS non_object_payload -> %', sqlerrm;
  end;

  -- (b) missing key_hash
  begin
    perform public.create_public_lead((base - 'key_hash'));
    raise exception 'TEST FAILED: missing key accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: missing key accepted' then raise; end if;
    raise notice 'PASS missing_key -> %', sqlerrm;
  end;

  -- (c) malformed key_hash
  begin
    perform public.create_public_lead(jsonb_set(base,'{key_hash}','"XYZ"'));
    raise exception 'TEST FAILED: malformed key accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: malformed key accepted' then raise; end if;
    raise notice 'PASS malformed_key -> %', sqlerrm;
  end;

  -- (d) invalid move_type
  begin
    perform public.create_public_lead(
      jsonb_set(jsonb_set(base,'{key_hash}', to_jsonb(repeat('2',64))),'{move_type}','"Teleportation"'));
    raise exception 'TEST FAILED: invalid move_type accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: invalid move_type accepted' then raise; end if;
    raise notice 'PASS invalid_move_type -> %', sqlerrm;
  end;

  -- (e) oversized notes
  begin
    perform public.create_public_lead(
      jsonb_set(jsonb_set(base,'{key_hash}', to_jsonb(repeat('3',64))),'{notes}', to_jsonb(repeat('x',4100))));
    raise exception 'TEST FAILED: oversized notes accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: oversized notes accepted' then raise; end if;
    raise notice 'PASS oversized_notes -> %', sqlerrm;
  end;

  -- (f) malformed move_date (always invalid; not date-dependent)
  begin
    perform public.create_public_lead(
      jsonb_set(jsonb_set(base,'{key_hash}', to_jsonb(repeat('4',64))),'{move_date}','"2020-99-99"'));
    raise exception 'TEST FAILED: malformed date accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: malformed date accepted' then raise; end if;
    raise notice 'PASS malformed_date -> %', sqlerrm;
  end;

  -- (g) move_date out of range — DYNAMIC vs current_date (never goes stale)
  begin
    perform public.create_public_lead(
      jsonb_set(jsonb_set(base,'{key_hash}', to_jsonb(repeat('5',64))),
                '{move_date}', to_jsonb(to_char(current_date - interval '5 years','YYYY-MM-DD'))));
    raise exception 'TEST FAILED: out-of-range date accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: out-of-range date accepted' then raise; end if;
    raise notice 'PASS date_out_of_range -> %', sqlerrm;
  end;

  -- (h) missing contact (no email + no phone)
  begin
    perform public.create_public_lead(jsonb_build_object(
      'first_name','NegZZ','last_name','DoNotKeep',
      'key_hash', repeat('6',64), 'payload_hash', repeat('a',64)));
    raise exception 'TEST FAILED: missing contact accepted';
  exception when others then
    if sqlerrm = 'TEST FAILED: missing contact accepted' then raise; end if;
    raise notice 'PASS missing_contact -> %', sqlerrm;
  end;
end $$;
rollback;
-- No standalone DELETE: rollback discards any customer/lead/activity_log/
-- idempotency row this block could ever have produced.


-- =====================================================================
-- PART D — ROLLBACK (removes ONLY objects created by 0029)
-- =====================================================================
-- begin;
--   drop function if exists public.create_public_lead(jsonb);
--   drop table    if exists public.public_intake_idempotency;
-- commit;


-- =====================================================================
-- RETENTION (owner-run; no scheduler dependency)
--   The intended replay/retry window is minutes. Retain claims 30 days for
--   comfortable idempotency coverage, then prune. Deleting rows older than the
--   retry window cannot reintroduce duplicates within that window.
--   Run periodically (or wire pg_cron later if desired):
--     delete from public.public_intake_idempotency
--     where created_at < now() - interval '30 days';
-- =====================================================================
