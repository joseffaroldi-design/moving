-- =====================================================================
-- 0030_canonical_activity_writers.sql
-- Southern Magnolia Movers — Phase 11 canonical activity foundation
-- OWNER-EXECUTED ONLY. Additive, forward-only, no historical backfill.
--
-- Live evidence verified before authoring:
--   * hardened public.activity_log exists; RLS ON, FORCE RLS OFF
--   * authenticated has SELECT only; no client INSERT/UPDATE/DELETE
--   * existing actions include lead.public_intake and quote.approved
--   * public.job_photos exists live and is currently empty
--   * job-photos storage bucket exists, private, currently empty
--   * payments are positive-only; live methods currently cash
--
-- Design:
--   * preserve existing 0029 lead.public_intake writer
--   * preserve existing 0026 portal quote.approved writer
--   * add server-side trigger writers for supported forward activity only
--   * derive tenant + actor from database/session state, never client payload
--   * no refund/reversal activity types; those capabilities do not exist
--   * no synthetic backfill
-- =====================================================================


-- =====================================================================
-- PART A — PREFLIGHT (READ-ONLY; run first)
-- =====================================================================

-- A1. Required tables must exist.
select x.object_name, to_regclass(x.object_name) as regclass
from (values
 ('public.activity_log'),('public.profiles'),('public.customers'),('public.leads'),
 ('public.quotes'),('public.jobs'),('public.invoices'),('public.invoice_payments'),
 ('public.job_photos')
) x(object_name)
order by x.object_name;

-- A2. activity_log must be the hardened shape.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='activity_log'
order by ordinal_position;

-- A3. Existing client privileges must remain read-only.
select
  has_table_privilege('anon','public.activity_log','INSERT') as anon_insert,
  has_table_privilege('authenticated','public.activity_log','INSERT') as authenticated_insert,
  has_table_privilege('authenticated','public.activity_log','UPDATE') as authenticated_update,
  has_table_privilege('authenticated','public.activity_log','DELETE') as authenticated_delete;

-- A4. New helper/trigger functions and triggers must be absent.
select p.proname, pg_get_function_identity_arguments(p.oid) as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_activity_write_forward','_activity_capture_forward')
order by p.proname;

select event_object_table, trigger_name
from information_schema.triggers
where trigger_schema='public'
  and trigger_name like 'activity_capture_%'
order by event_object_table, trigger_name;

-- A5. Baseline activity counts/actions for before/after comparison.
select count(*) as activity_rows from public.activity_log;
select action, count(*) as rows
from public.activity_log group by action order by action;


-- =====================================================================
-- PART B — MIGRATION (single transaction)
-- =====================================================================
begin;

-- B0. Hard guards: abort rather than silently layering over unknown objects.
do $$
begin
  if to_regclass('public.activity_log') is null then
    raise exception '0030 ABORT: public.activity_log is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_log' and column_name='company_id'
  ) then
    raise exception '0030 ABORT: activity_log is not the hardened tenant-scoped shape';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('_activity_write_forward','_activity_capture_forward')
  ) then
    raise exception '0030 ABORT: activity helper already exists';
  end if;
  if exists (
    select 1 from information_schema.triggers
    where trigger_schema='public' and trigger_name like 'activity_capture_%'
  ) then
    raise exception '0030 ABORT: activity_capture trigger already exists';
  end if;
end $$;

-- B1. Internal writer. No client EXECUTE grant. Identity is resolved from auth.uid().
create function public._activity_write_forward(
  p_company_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_profile_role text;
  v_actor_role text;
  v_actor_company uuid;
begin
  if p_company_id is null then
    raise exception 'activity company_id is required';
  end if;
  if nullif(btrim(coalesce(p_action,'')), '') is null then
    raise exception 'activity action is required';
  end if;

  if v_uid is not null then
    select p.role::text, p.company_id, u.email
      into v_profile_role, v_actor_company, v_email
    from public.profiles p
    left join auth.users u on u.id=p.id
    where p.id=v_uid and p.is_active is true;

    if v_actor_company is not null and v_actor_company <> p_company_id then
      raise exception 'activity actor/company mismatch';
    end if;
  end if;

  v_actor_role := coalesce(
    v_profile_role,
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'system'
  );

  insert into public.activity_log (
    company_id, actor_id, actor_email, actor_role,
    action, entity_type, entity_id, summary, metadata
  ) values (
    p_company_id, v_uid, v_email, v_actor_role,
    left(btrim(p_action),120),
    left(nullif(btrim(coalesce(p_entity_type,'')),''),80),
    left(nullif(btrim(coalesce(p_entity_id,'')),''),200),
    left(nullif(btrim(coalesce(p_summary,'')),''),500),
    coalesce(p_metadata,'{}'::jsonb)
  );
end;
$$;

alter function public._activity_write_forward(uuid,text,text,text,text,jsonb) owner to postgres;
revoke all on function public._activity_write_forward(uuid,text,text,text,text,jsonb)
  from public, anon, authenticated, service_role;

-- B2. Generic forward-capture trigger. Handles only known, supported tables.
create function public._activity_capture_forward()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_summary text;
  v_meta jsonb := '{}'::jsonb;
  v_old_status text;
  v_new_status text;
  v_actor_role text;
  v_changed_fields text[];
begin
  -- ---------------------------------------------------------------
  -- customers: creation by staff + contact changes only.
  -- Public intake rows have created_by NULL and are already represented by
  -- lead.public_intake, so customer creation is skipped for those rows.
  -- ---------------------------------------------------------------
  if tg_table_name='customers' then
    if tg_op='INSERT' then
      if new.created_by is null then return new; end if;
      v_action := 'customer.created';
      v_summary := 'Customer created';
    elsif tg_op='UPDATE' then
      if (old.first_name,old.last_name,old.email,old.phone)
         is not distinct from (new.first_name,new.last_name,new.email,new.phone) then
        return new;
      end if;
      v_changed_fields := array_remove(array[
        case when old.first_name is distinct from new.first_name then 'first_name' end,
        case when old.last_name  is distinct from new.last_name  then 'last_name' end,
        case when old.email      is distinct from new.email      then 'email' end,
        case when old.phone      is distinct from new.phone      then 'phone' end
      ], null);
      v_action := 'customer.contact_updated';
      v_summary := 'Customer contact information updated';
      v_meta := jsonb_build_object('changed_fields',to_jsonb(v_changed_fields));
    else
      return new;
    end if;

  -- ---------------------------------------------------------------
  -- leads: staff creation + status changes. Public intake insert skipped.
  -- ---------------------------------------------------------------
  elsif tg_table_name='leads' then
    if tg_op='INSERT' then
      if new.created_by is null then return new; end if;
      v_action := 'lead.created';
      v_summary := 'Lead created';
      v_meta := jsonb_build_object('status',new.status::text,'source',new.source);
    elsif tg_op='UPDATE' and old.status is distinct from new.status then
      v_action := 'lead.' || new.status::text;
      v_summary := 'Lead status changed to ' || new.status::text;
      v_meta := jsonb_build_object('old_status',old.status::text,'new_status',new.status::text);
    else
      return new;
    end if;

  -- ---------------------------------------------------------------
  -- quotes: creation + status transitions.
  -- Customer portal acceptance already writes quote.approved in 0026.
  -- Skip only that exact authenticated-customer accepted transition to avoid
  -- duplicate activity; token/public acceptance is still captured here.
  -- ---------------------------------------------------------------
  elsif tg_table_name='quotes' then
    if tg_op='INSERT' then
      v_action := 'quote.created';
      v_summary := 'Quote created';
      v_meta := jsonb_build_object('status',new.status::text,'quote_number',new.quote_number);
    elsif tg_op='UPDATE' and old.status is distinct from new.status then
      select p.role::text into v_actor_role
      from public.profiles p
      where p.id=auth.uid() and p.is_active is true;
      if new.status::text='accepted' and v_actor_role='customer' then
        return new;
      end if;
      v_action := 'quote.' || new.status::text;
      v_summary := 'Quote status changed to ' || new.status::text;
      v_meta := jsonb_build_object(
        'old_status',old.status::text,
        'new_status',new.status::text,
        'quote_number',new.quote_number
      );
    else
      return new;
    end if;

  -- ---------------------------------------------------------------
  -- jobs: creation + lifecycle transitions.
  -- ---------------------------------------------------------------
  elsif tg_table_name='jobs' then
    if tg_op='INSERT' then
      v_action := 'job.created';
      v_summary := 'Job created';
      v_meta := jsonb_build_object('status',new.status::text,'job_number',new.job_number);
    elsif tg_op='UPDATE' and old.status is distinct from new.status then
      v_action := 'job.' || new.status::text;
      v_summary := 'Job status changed to ' || new.status::text;
      v_meta := jsonb_build_object(
        'old_status',old.status::text,
        'new_status',new.status::text,
        'job_number',new.job_number
      );
    else
      return new;
    end if;

  -- ---------------------------------------------------------------
  -- invoices: creation + lifecycle transitions.
  -- ---------------------------------------------------------------
  elsif tg_table_name='invoices' then
    if tg_op='INSERT' then
      v_action := 'invoice.created';
      v_summary := 'Invoice created';
      v_meta := jsonb_build_object('status',new.status::text,'invoice_number',new.invoice_number);
    elsif tg_op='UPDATE' and old.status is distinct from new.status then
      v_action := 'invoice.' || new.status::text;
      v_summary := 'Invoice status changed to ' || new.status::text;
      v_meta := jsonb_build_object(
        'old_status',old.status::text,
        'new_status',new.status::text,
        'invoice_number',new.invoice_number
      );
    else
      return new;
    end if;

  -- ---------------------------------------------------------------
  -- payments: positive payment recording only. Never log notes.
  -- ---------------------------------------------------------------
  elsif tg_table_name='invoice_payments' then
    if tg_op <> 'INSERT' then return new; end if;
    v_action := 'payment.recorded';
    v_summary := 'Payment recorded';
    v_meta := jsonb_build_object(
      'invoice_id',new.invoice_id,
      'amount',new.amount,
      'method',left(coalesce(new.method,'other'),80),
      'paid_at',new.paid_at
    );

  -- ---------------------------------------------------------------
  -- job photos: metadata row is the canonical job attribution.
  -- Storage-only objects are not logged here because they cannot safely prove
  -- a job relationship without this metadata row.
  -- ---------------------------------------------------------------
  elsif tg_table_name='job_photos' then
    if tg_op <> 'INSERT' then return new; end if;
    v_action := 'photo.uploaded';
    v_summary := 'Job photo metadata recorded';
    v_meta := jsonb_build_object(
      'job_id',new.job_id,
      'document_id',new.document_id,
      'photo_stage',left(coalesce(new.photo_stage,''),80),
      'taken_at',new.taken_at
    );
  else
    return new;
  end if;

  perform public._activity_write_forward(
    new.company_id,
    v_action,
    case when tg_table_name='invoice_payments' then 'payment'
         when tg_table_name='job_photos' then 'photo'
         else rtrim(tg_table_name,'s') end,
    new.id::text,
    v_summary,
    v_meta
  );

  return new;
end;
$$;

alter function public._activity_capture_forward() owner to postgres;
revoke all on function public._activity_capture_forward()
  from public, anon, authenticated, service_role;

-- B3. Triggers. AFTER triggers preserve normal business writes; any unexpected
-- audit failure still aborts the surrounding transaction rather than silently
-- losing audit integrity.
create trigger activity_capture_customers
  after insert or update on public.customers
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_leads
  after insert or update on public.leads
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_quotes
  after insert or update on public.quotes
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_jobs
  after insert or update on public.jobs
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_invoices
  after insert or update on public.invoices
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_invoice_payments
  after insert on public.invoice_payments
  for each row execute function public._activity_capture_forward();

create trigger activity_capture_job_photos
  after insert on public.job_photos
  for each row execute function public._activity_capture_forward();

-- B4. Reassert activity_log client-write lockdown. No FORCE RLS.
alter table public.activity_log enable row level security;
alter table public.activity_log no force row level security;
revoke insert, update, delete on table public.activity_log from anon, authenticated, public;

commit;


-- =====================================================================
-- PART C — VERIFICATION (READ-ONLY; run after Part B)
-- =====================================================================

-- C1. Helpers: DEFINER, postgres-owned, pinned search_path.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       p.proconfig as config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_activity_write_forward','_activity_capture_forward')
order by p.proname;

-- C2. No direct EXECUTE for browser/service roles.
select p.proname,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('_activity_write_forward','_activity_capture_forward')
order by p.proname;

-- C3. Exact installed triggers.
select event_object_table, trigger_name, event_manipulation, action_timing
from information_schema.triggers
where trigger_schema='public' and trigger_name like 'activity_capture_%'
order by event_object_table, trigger_name, event_manipulation;

-- C4. activity_log remains client append-protected.
select
  has_table_privilege('anon','public.activity_log','INSERT') as anon_insert,
  has_table_privilege('authenticated','public.activity_log','INSERT') as authenticated_insert,
  has_table_privilege('authenticated','public.activity_log','UPDATE') as authenticated_update,
  has_table_privilege('authenticated','public.activity_log','DELETE') as authenticated_delete,
  (select relrowsecurity from pg_class where oid='public.activity_log'::regclass) as rls_enabled,
  (select relforcerowsecurity from pg_class where oid='public.activity_log'::regclass) as force_rls;

-- C5. Existing rows are unchanged: 0030 performs no backfill.
select count(*) as activity_rows from public.activity_log;
select action, count(*) as rows
from public.activity_log group by action order by action;


-- =====================================================================
-- PART D — ROLLBACK (OWNER-EXECUTED ONLY; removes 0030 forward capture)
-- Existing activity rows are intentionally retained as audit history.
-- =====================================================================
-- begin;
-- drop trigger if exists activity_capture_customers on public.customers;
-- drop trigger if exists activity_capture_leads on public.leads;
-- drop trigger if exists activity_capture_quotes on public.quotes;
-- drop trigger if exists activity_capture_jobs on public.jobs;
-- drop trigger if exists activity_capture_invoices on public.invoices;
-- drop trigger if exists activity_capture_invoice_payments on public.invoice_payments;
-- drop trigger if exists activity_capture_job_photos on public.job_photos;
-- drop function if exists public._activity_capture_forward();
-- drop function if exists public._activity_write_forward(uuid,text,text,text,text,jsonb);
-- commit;
