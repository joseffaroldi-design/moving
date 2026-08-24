-- Southern Magnolia Movers — cancelled job/dispatch integrity
-- A cancelled job must not remain visible as an active assigned dispatch run.

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

    if new.status::text = 'completed' then
      update public.dispatch_assignments
         set status = 'completed'::public.dispatch_status,
             updated_at = now()
       where company_id = new.company_id
         and job_id = new.id
         and status <> 'completed'::public.dispatch_status;

      begin
        perform public._create_draft_invoice_for_job(new.company_id, new.id);
      exception when others then
        raise notice 'Draft invoice auto-create skipped for job %: %', new.id, sqlerrm;
      end;

    elsif new.status::text = 'cancelled' then
      update public.dispatch_assignments
         set status = 'cancelled'::public.dispatch_status,
             updated_at = now()
       where company_id = new.company_id
         and job_id = new.id
         and status <> 'cancelled'::public.dispatch_status;
    end if;

    return new;
  end if;

  return new;
end;
$$;

alter function public._sync_lifecycle_integrity() owner to postgres;
revoke all on function public._sync_lifecycle_integrity() from public, anon, authenticated, service_role;

-- Reconcile any pre-existing cancellations without changing jobs themselves.
update public.dispatch_assignments da
   set status = 'cancelled'::public.dispatch_status,
       updated_at = now()
  from public.jobs j
 where j.id = da.job_id
   and j.company_id = da.company_id
   and j.status = 'cancelled'::public.job_status
   and da.status <> 'cancelled'::public.dispatch_status;

commit;
