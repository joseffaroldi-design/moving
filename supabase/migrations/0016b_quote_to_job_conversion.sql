-- =====================================================================
-- 0016b_quote_to_job_conversion.sql
-- Southern Magnolia Movers — Phase 5 (Jobs) atomic quote -> job conversion.
--
-- Builds the RPC-only write path that turns an ACCEPTED quote into a
-- SCHEDULED job, mirroring the quotes model (0013/0014): authenticated has
-- NO direct write grant on job tables (0016a); the only way to create a job
-- from a quote is this SECURITY DEFINER RPC, which derives company/actor
-- server-side, enforces roles + cross-company ownership, validates inputs,
-- and flips the quote to 'converted' in the SAME transaction.
--
-- Contents:
--   1. Transactional duplicate guard on jobs.quote_id, then a PARTIAL UNIQUE
--      index enforcing ONE job per quote at the DB level (aborts if pre-existing
--      duplicates — never silently resolved).
--   2. public.next_job_number(uuid)  — internal, advisory-lock, 'J-0001'.
--      EXECUTE revoked from PUBLIC/anon/authenticated (RPC-only).
--   3. public._require_job_converter() — internal authz helper (owner,
--      operations_manager, dispatcher, sales). EXECUTE client-unavailable.
--   4. public.convert_quote_to_job(...) — the one client RPC. authenticated
--      EXECUTE only; PUBLIC/anon revoked.
--
-- IDEMPOTENCY: if the quote already has a job, returns the existing
-- {job_id, job_number} with created=false — NO new job, NO error (safe for
-- double-clicks/retries). A concurrent race that trips the unique index is
-- caught and resolved to the same idempotent return.
--
-- Non-destructive: no columns dropped, no rows changed except the target
-- quote's status on a successful NEW conversion. Job tables stay locked
-- (0016a grants/policies untouched). postgres/service_role left as-is.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ONE JOB PER QUOTE — duplicate guard + partial unique index
-- ---------------------------------------------------------------------
do $$
declare dup_count integer;
begin
  select count(*) into dup_count
  from (
    select quote_id
    from public.jobs
    where quote_id is not null
    group by quote_id
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise exception
      'ABORT 0016b: % quote_id value(s) already map to multiple jobs. Resolve explicitly before enforcing one-job-per-quote.',
      dup_count;
  end if;
end $$;

create unique index if not exists jobs_quote_id_unique
  on public.jobs (quote_id)
  where quote_id is not null;

-- ---------------------------------------------------------------------
-- 2. next_job_number — internal, collision-safe, per-company advisory lock
--    MUST be called inside the same txn as the job INSERT (lock held to
--    commit). Format 'J-0001'. Legacy 'JOB-...' numbers excluded by regex.
-- ---------------------------------------------------------------------
create or replace function public.next_job_number(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq bigint;
begin
  if p_company is null then
    raise exception 'company is required for job numbering';
  end if;

  -- Distinct advisory namespace from quote numbering.
  perform pg_advisory_xact_lock(hashtext('job_number:' || p_company::text));

  select coalesce(max((substring(j.job_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_seq
  from public.jobs j
  where j.company_id = p_company
    and j.job_number ~ '^J-[0-9]+$';

  return 'J-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke execute on function public.next_job_number(uuid) from public;
revoke execute on function public.next_job_number(uuid) from anon;
revoke execute on function public.next_job_number(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- 3. _require_job_converter — internal authz (active caller + role)
--    Roles: owner, operations_manager, dispatcher, sales.
-- ---------------------------------------------------------------------
create or replace function public._require_job_converter()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_active  boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select company_id, is_active into v_company, v_active
    from public.profiles where id = v_uid;
  if v_company is null then raise exception 'No company associated with your account'; end if;
  if v_active is not true then raise exception 'Caller account is not active'; end if;
  if not public.has_company_role(
       v_company,
       array['owner','operations_manager','dispatcher','sales']::public.user_role[]) then
    raise exception 'Insufficient privileges to convert quotes to jobs';
  end if;
  return v_company;
end;
$$;

revoke execute on function public._require_job_converter() from public;
revoke execute on function public._require_job_converter() from anon;
revoke execute on function public._require_job_converter() from authenticated;

-- ---------------------------------------------------------------------
-- 4. convert_quote_to_job — the single client RPC
-- ---------------------------------------------------------------------
create or replace function public.convert_quote_to_job(
  p_quote_id            uuid,
  p_scheduled_start     timestamptz,
  p_origin_address      text,
  p_destination_address text,
  p_scheduled_end       timestamptz default null,
  p_crew_size           integer     default null,
  p_truck_count         integer     default null,
  p_dispatch_notes      text        default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_company      uuid := public._require_job_converter();
  q              record;
  v_cust_co      uuid;
  v_origin       text := btrim(coalesce(p_origin_address, ''));
  v_dest         text := btrim(coalesce(p_destination_address, ''));
  v_number       text;
  v_job          uuid;
  v_existing_id  uuid;
  v_existing_num text;
begin
  -- Load + own the quote (company derived server-side, never trusted from client).
  select id, company_id, customer_id, status::text as status
    into q
  from public.quotes
  where id = p_quote_id;

  if q.id is null then raise exception 'Quote not found'; end if;
  if q.company_id <> v_company then raise exception 'Quote does not belong to your company'; end if;

  -- IDEMPOTENCY: quote already converted -> return existing job, no new insert, no error.
  select id, job_number into v_existing_id, v_existing_num
    from public.jobs where quote_id = p_quote_id limit 1;
  if v_existing_id is not null then
    return json_build_object(
      'job_id', v_existing_id, 'job_number', v_existing_num,
      'quote_id', p_quote_id, 'created', false);
  end if;

  -- Only ACCEPTED quotes may convert (evaluated only for a NEW job).
  if q.status <> 'accepted' then
    raise exception 'Only accepted quotes can be converted to a job (current status: %)', q.status;
  end if;

  -- Validate scheduling inputs (RPC is authoritative; never relies on lead prefill).
  if p_scheduled_start is null then raise exception 'scheduled_start is required'; end if;
  if v_origin = '' then raise exception 'origin_address is required'; end if;
  if v_dest   = '' then raise exception 'destination_address is required'; end if;
  if p_scheduled_end is not null and p_scheduled_end <= p_scheduled_start then
    raise exception 'scheduled_end must be after scheduled_start';
  end if;
  if p_crew_size   is not null and p_crew_size   < 0 then raise exception 'crew_size cannot be negative';   end if;
  if p_truck_count is not null and p_truck_count < 0 then raise exception 'truck_count cannot be negative'; end if;

  -- Confirm the linked customer (if any) belongs to the same company.
  if q.customer_id is not null then
    select company_id into v_cust_co from public.customers where id = q.customer_id;
    if v_cust_co is null then raise exception 'Linked customer not found'; end if;
    if v_cust_co <> v_company then raise exception 'Linked customer does not belong to your company'; end if;
  end if;

  -- Number + insert (advisory lock held to commit; unique index guards the race).
  v_number := public.next_job_number(v_company);

  begin
    insert into public.jobs (
      company_id, quote_id, customer_id, status, job_number,
      scheduled_start, scheduled_end, origin_address, destination_address,
      crew_size, truck_count, dispatch_notes, created_by
    ) values (
      v_company, p_quote_id, q.customer_id, 'scheduled', v_number,
      p_scheduled_start, p_scheduled_end, v_origin, v_dest,
      coalesce(p_crew_size, 2), coalesce(p_truck_count, 1), p_dispatch_notes, v_uid
    )
    returning id into v_job;
  exception when unique_violation then
    -- Concurrent conversion of the SAME quote won the race -> return it (idempotent).
    select id, job_number into v_existing_id, v_existing_num
      from public.jobs where quote_id = p_quote_id limit 1;
    if v_existing_id is not null then
      return json_build_object(
        'job_id', v_existing_id, 'job_number', v_existing_num,
        'quote_id', p_quote_id, 'created', false);
    end if;
    raise;  -- a different unique conflict (e.g. job_number) — surface it.
  end;

  -- Flip the quote to converted atomically.
  update public.quotes
     set status = 'converted', updated_at = now()
   where id = p_quote_id;

  return json_build_object(
    'job_id', v_job, 'job_number', v_number,
    'quote_id', p_quote_id, 'created', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. EXECUTE GRANTS — client gets ONLY convert_quote_to_job.
-- ---------------------------------------------------------------------
revoke execute on function public.convert_quote_to_job(uuid,timestamptz,text,text,timestamptz,integer,integer,text) from public;
revoke execute on function public.convert_quote_to_job(uuid,timestamptz,text,text,timestamptz,integer,integer,text) from anon;
grant  execute on function public.convert_quote_to_job(uuid,timestamptz,text,text,timestamptz,integer,integer,text) to authenticated;

commit;
