-- =====================================================================
-- 0027_crew_mobile_access.sql   [Phase 9 P2 — Crew Mobile · Slice 1]
-- OWNER-EXECUTED ONLY. The author does NOT run this. Additive & security-focused.
--
-- SCOPE (this slice, READ-ONLY surface for crew):
--   * Adds an internal crew identity resolver (auth.uid() -> active crew profile).
--   * Adds 2 read RPCs that return the caller's OWN assigned jobs (via job_crew)
--     as explicit, whitelisted JSON: crew_list_jobs + crew_get_job.
--   * Crew get ONLY jobs they are assigned to. Fields are operationally scoped:
--     job schedule/route + dispatch_notes (crew instructions) + customer NAME &
--     PHONE (needed to reach the customer on move day) + the crew roster.
--     EXPLICITLY EXCLUDED: jobs.internal_notes, financials, quote/invoice data,
--     customer email/address-book, company_id, created_by.
--
-- ARCHITECTURE: identical to the customer portal (0026) — EXPLICIT-FIELD READ
--   RPCs. Crew NEVER get a base-table SELECT policy (RLS filters rows, not
--   columns). All reads flow through SECURITY DEFINER RPCs with a pinned
--   search_path; identity is resolved server-side from auth.uid() only.
--
-- WHAT THIS DOES NOT DO
--   * No writes (clock/status/checklist/photos/signature come in 0028–0031).
--   * Does NOT add/alter/drop any staff RLS policy or table grant.
--   * Does NOT touch crew_time_entries / document_signatures / job_photos /
--     job_checklists / job_status_events.
--   * anon & PUBLIC receive nothing.
--
-- DEPENDS ON: job_crew(job_id, profile_id, role) and the profiles role enum
--   values 'crew_lead' / 'mover' (confirmed by preflight_0027).
--
-- RUN ORDER: Part A (read-only preflight; paste results) -> review -> Part B
--   (migration, single txn) -> Part C (read-only verification; paste results).
--   Part E is the rollback.
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT (READ-ONLY; run first, paste every result)
-- =====================================================================

-- A1. The 3 objects Part B creates must be ABSENT now (expect 0 rows).
select p.proname, pg_get_function_identity_arguments(p.oid) as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_crew_current_profile','crew_list_jobs','crew_get_job')
order by p.proname;

-- A2. Columns Part B reads must exist (expect one row per table listing them).
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public' and (
      (table_name='profiles' and column_name in ('id','company_id','role','is_active'))
   or (table_name='job_crew' and column_name in ('job_id','profile_id','role'))
   or (table_name='jobs'     and column_name in ('id','company_id','customer_id','job_number','status','scheduled_start','scheduled_end','origin_address','destination_address','crew_size','truck_count','dispatch_notes'))
   or (table_name='customers' and column_name in ('id','first_name','last_name','phone')) )
group by table_name order by table_name;

-- A3. Role enum must contain the two crew labels (expect both true).
select
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='crew_lead') as has_crew_lead,
  exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='mover')     as has_mover;

-- A4. Snapshot staff policies + grants on jobs/job_crew/customers. Save this;
--     Part C must show the SAME set (proves Part B changed no staff access).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename in ('jobs','job_crew','customers')
order by tablename, policyname;
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('jobs','job_crew','customers')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;


-- =====================================================================
-- PART B — MIGRATION (single transaction)
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- B1. Internal crew identity resolver — auth.uid() ONLY. Returns the
--     caller's profile id iff they are an ACTIVE 'crew_lead'/'mover' in a
--     non-null company. Internal-only: EXECUTE revoked from every client.
--     (profiles.id == auth.users.id, so the profile id is also the crew's
--     job_crew.profile_id.)
-- ---------------------------------------------------------------------
create or replace function public._crew_current_profile()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.role::text in ('crew_lead','mover')
    and p.is_active is true
    and p.company_id is not null
$$;

revoke all on function public._crew_current_profile() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- B2. READ RPC — the caller's OWN assigned jobs (via job_crew). Explicit
--     fields only. p_scope: 'active' (scheduled/confirmed/in_progress,
--     soonest first), 'completed' (completed/cancelled, newest first), or
--     'all' (newest first). Bounded limit 1..100.
-- ---------------------------------------------------------------------
create or replace function public.crew_list_jobs(
  p_scope  text    default 'active',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid    := public._crew_current_profile();
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_scope text    := lower(coalesce(p_scope, 'active'));
  v_items json;
  v_count bigint;
begin
  if v_me is null then raise exception 'Not authorized as crew'; end if;
  if v_scope not in ('active','completed','all') then v_scope := 'active'; end if;

  select count(*) into v_count
  from public.jobs j
  where exists (select 1 from public.job_crew jc where jc.job_id = j.id and jc.profile_id = v_me)
    and ( v_scope = 'all'
       or (v_scope = 'active'    and j.status::text in ('scheduled','confirmed','in_progress'))
       or (v_scope = 'completed' and j.status::text in ('completed','cancelled')) );

  select coalesce(json_agg(item order by ord_asc asc nulls last, ord_desc desc nulls last, jid desc), '[]'::json)
    into v_items
  from (
    select
      j.id as jid,
      case when v_scope = 'active' then j.scheduled_start end as ord_asc,
      case when v_scope <> 'active' then j.scheduled_start end as ord_desc,
      json_build_object(
        'id', j.id, 'job_number', j.job_number, 'status', j.status::text,
        'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
        'origin_address', j.origin_address, 'destination_address', j.destination_address,
        'crew_size', j.crew_size, 'truck_count', j.truck_count,
        'dispatch_notes', j.dispatch_notes,
        'my_role', (select jc.role::text from public.job_crew jc
                     where jc.job_id = j.id and jc.profile_id = v_me),
        'customer_name', nullif(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        'customer_phone', c.phone
      ) as item
    from public.jobs j
    left join public.customers c on c.id = j.customer_id
    where exists (select 1 from public.job_crew jc where jc.job_id = j.id and jc.profile_id = v_me)
      and ( v_scope = 'all'
         or (v_scope = 'active'    and j.status::text in ('scheduled','confirmed','in_progress'))
         or (v_scope = 'completed' and j.status::text in ('completed','cancelled')) )
    order by
      case when v_scope = 'active' then j.scheduled_start end asc nulls last,
      case when v_scope <> 'active' then j.scheduled_start end desc nulls last,
      j.id desc
    limit v_lim offset v_off
  ) q;

  return json_build_object('items', v_items, 'count', v_count,
                           'scope', v_scope, 'limit', v_lim, 'offset', v_off);
end;
$$;

revoke all on function public.crew_list_jobs(text, integer, integer) from public, anon;
grant execute on function public.crew_list_jobs(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- B3. READ RPC — one assigned job in detail + the crew roster. Explicit
--     fields only. Crew-member display names are read via to_jsonb(p)->>key
--     (column-safe: profiles has no fixed full_name column).
-- ---------------------------------------------------------------------
create or replace function public.crew_get_job(p_job_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public._crew_current_profile();
  j       record;
  v_cust  record;
  v_roster json;
begin
  if v_me is null then raise exception 'Not authorized as crew'; end if;

  -- Must be assigned to this job.
  if not exists (select 1 from public.job_crew jc where jc.job_id = p_job_id and jc.profile_id = v_me) then
    raise exception 'Job not found';
  end if;

  select id, customer_id, job_number, status, scheduled_start, scheduled_end,
         origin_address, destination_address, crew_size, truck_count, dispatch_notes
    into j
  from public.jobs
  where id = p_job_id;

  if not found then raise exception 'Job not found'; end if;

  select first_name, last_name, phone into v_cust
  from public.customers where id = j.customer_id;

  select coalesce(json_agg(json_build_object(
           'profile_id', jc.profile_id,
           'role', jc.role::text,
           'name', nullif(btrim(coalesce(to_jsonb(p)->>'first_name','') || ' ' ||
                                 coalesce(to_jsonb(p)->>'last_name','')), ''),
           'is_me', (jc.profile_id = v_me))
           order by jc.role::text, jc.profile_id), '[]'::json)
    into v_roster
  from public.job_crew jc
  join public.profiles p on p.id = jc.profile_id
  where jc.job_id = p_job_id;

  return json_build_object(
    'id', j.id, 'job_number', j.job_number, 'status', j.status::text,
    'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
    'origin_address', j.origin_address, 'destination_address', j.destination_address,
    'crew_size', j.crew_size, 'truck_count', j.truck_count,
    'dispatch_notes', j.dispatch_notes,
    'my_role', (select jc.role::text from public.job_crew jc
                 where jc.job_id = p_job_id and jc.profile_id = v_me),
    'customer_name', nullif(btrim(coalesce(v_cust.first_name,'') || ' ' || coalesce(v_cust.last_name,'')), ''),
    'customer_phone', v_cust.phone,
    'crew', v_roster
  );
end;
$$;

revoke all on function public.crew_get_job(uuid) from public, anon;
grant execute on function public.crew_get_job(uuid) to authenticated;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B, paste every result)
-- =====================================================================

-- C1. All 3 functions: owner, SECURITY DEFINER, pinned search_path.
select p.proname,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.proconfig as config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_crew_current_profile','crew_list_jobs','crew_get_job')
order by p.proname;

-- C2. Grants: authenticated may EXECUTE the 2 client RPCs; the resolver has
--     NO client grant; anon/PUBLIC have nothing.
select p.proname,
       coalesce(array_to_string(p.proacl, ' | '), '(default/no explicit ACL)') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_crew_current_profile','crew_list_jobs','crew_get_job')
order by p.proname;

-- C3. The resolver must use auth.uid() and must NOT reference email (expect 0).
select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='_crew_current_profile'
  and pg_get_functiondef(p.oid) ~* 'email';

-- C4. No crew SELECT policy was added to jobs/job_crew/customers (expect 0).
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename in ('jobs','job_crew','customers')
  and (policyname ilike '%crew_self%' or policyname ilike '%crew_mobile%');

-- C5. Staff policies + grants UNCHANGED — must equal the Part A4 snapshot.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename in ('jobs','job_crew','customers')
order by tablename, policyname;
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('jobs','job_crew','customers')
  and grantee in ('anon','authenticated','public','PUBLIC')
order by table_name, grantee, privilege_type;

-- C6. Both client RPCs reference the internal resolver (identity gate wired).
select dependent.proname as rpc
from pg_depend d
join pg_proc dependent on dependent.oid = d.objid
join pg_proc ref       on ref.oid = d.refobjid
join pg_namespace n     on n.oid = dependent.pronamespace
where n.nspname='public' and ref.proname='_crew_current_profile'
order by dependent.proname;
-- (If empty on your PG version, SQL-body dependency tracking may be absent;
--  C2/C3 + Part-C negative tests still prove the gate.)


-- =====================================================================
-- PART E — ROLLBACK (removes ONLY objects created by 0027)
-- =====================================================================
-- begin;
--   drop function if exists public.crew_get_job(uuid);
--   drop function if exists public.crew_list_jobs(text, integer, integer);
--   drop function if exists public._crew_current_profile();
-- commit;
