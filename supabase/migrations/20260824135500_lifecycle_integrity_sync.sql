-- Southern Magnolia Movers — lifecycle integrity synchronization
-- Keeps CRM and dispatch state aligned with authoritative quote/job events.
-- Additive, deterministic, and safe to re-run only through migration tracking.

begin;

create or replace function public._sync_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'quotes' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
      return new;
    end if;

    if new.lead_id is null then
      return new;
    end if;

    -- Once a quote is actively in front of the customer, the CRM should no
    -- longer show an earlier prospecting stage. Never downgrade booked/lost.
    if new.status::text in ('sent','viewed','accepted') then
      update public.leads
         set status = 'quoted'::public.lead_status,
             updated_at = now()
       where id = new.lead_id
         and company_id = new.company_id
         and status in (
           'new'::public.lead_status,
           'contacted'::public.lead_status,
           'qualified'::public.lead_status
         );

    -- A converted quote has produced a real job. That is authoritative proof
    -- the opportunity is booked, including reopening a previously lost lead.
    elsif new.status::text = 'converted' then
      update public.leads
         set status = 'booked'::public.lead_status,
             updated_at = now()
       where id = new.lead_id
         and company_id = new.company_id
         and status <> 'booked'::public.lead_status;
    end if;

    return new;
  end if;

  if tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then
      return new;
    end if;

    -- Dispatch has a more granular move-day state machine than Jobs, so we do
    -- not invent an en-route/loading state when staff marks a job in-progress.
    -- Completion, however, is unambiguous and must converge everywhere.
    if new.status::text = 'completed' then
      update public.dispatch_assignments
         set status = 'completed'::public.dispatch_status,
             updated_at = now()
       where company_id = new.company_id
         and job_id = new.id
         and status <> 'completed'::public.dispatch_status;
    end if;

    return new;
  end if;

  return new;
end;
$$;

alter function public._sync_lifecycle_integrity() owner to postgres;
revoke all on function public._sync_lifecycle_integrity() from public, anon, authenticated, service_role;

drop trigger if exists lifecycle_integrity_quotes on public.quotes;
create trigger lifecycle_integrity_quotes
  after insert or update on public.quotes
  for each row execute function public._sync_lifecycle_integrity();

drop trigger if exists lifecycle_integrity_jobs on public.jobs;
create trigger lifecycle_integrity_jobs
  after insert or update on public.jobs
  for each row execute function public._sync_lifecycle_integrity();

-- One-time reconciliation of pre-existing records. These updates use current
-- downstream business truth; they do not fabricate a new customer/job/payment.
update public.leads l
   set status = 'booked'::public.lead_status,
       updated_at = now()
 where status <> 'booked'::public.lead_status
   and exists (
     select 1
     from public.quotes q
     where q.lead_id = l.id
       and q.company_id = l.company_id
       and q.status = 'converted'::public.quote_status
   );

update public.leads l
   set status = 'quoted'::public.lead_status,
       updated_at = now()
 where status in (
   'new'::public.lead_status,
   'contacted'::public.lead_status,
   'qualified'::public.lead_status
 )
   and exists (
     select 1
     from public.quotes q
     where q.lead_id = l.id
       and q.company_id = l.company_id
       and q.status in (
         'sent'::public.quote_status,
         'viewed'::public.quote_status,
         'accepted'::public.quote_status
       )
   );

update public.dispatch_assignments da
   set status = 'completed'::public.dispatch_status,
       updated_at = now()
  from public.jobs j
 where j.id = da.job_id
   and j.company_id = da.company_id
   and j.status = 'completed'::public.job_status
   and da.status <> 'completed'::public.dispatch_status;

commit;
