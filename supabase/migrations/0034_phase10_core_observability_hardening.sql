-- Phase 10: audit/observability hot-path hardening.
--
-- Goals:
--   1) Preserve authorization semantics while allowing PostgreSQL to evaluate
--      auth.uid() once per statement in the highest-traffic RLS policies.
--   2) Add covering indexes for production-critical foreign keys identified
--      by the Supabase performance advisor.
--
-- This migration intentionally does NOT change role membership, tenant rules,
-- SECURITY DEFINER grants, audit event semantics, or dormant V2 modules.

-- ---------------------------------------------------------------------------
-- RLS init-plan optimization (semantics preserved)
-- ---------------------------------------------------------------------------

alter policy profiles_member_select on public.profiles
  using ((id = (select auth.uid())) or public.is_company_member(company_id));

alter policy profiles_self_update on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy crew_time_entries_self_insert on public.crew_time_entries
  with check ((profile_id = (select auth.uid())) and public.is_company_member(company_id));

alter policy crew_time_entries_self_or_manager_update on public.crew_time_entries
  using ((((profile_id = (select auth.uid())) or public.can_manage_company(company_id)))
         and public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

alter policy lead_notes_staff_insert on public.lead_notes
  with check (
    (author_id = (select auth.uid()))
    and exists (
      select 1
      from public.leads l
      where l.id = lead_notes.lead_id
        and l.company_id = lead_notes.company_id
        and public.has_company_role(
          l.company_id,
          array['owner','operations_manager','dispatcher','sales']::public.user_role[]
        )
    )
  );

alter policy activity_log_staff_read on public.activity_log
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active is true
        and p.company_id = activity_log.company_id
        and p.role::text = any(array['owner','operations_manager','dispatcher','sales']::text[])
    )
  );

-- ---------------------------------------------------------------------------
-- Production-critical FK indexes
-- ---------------------------------------------------------------------------

create index if not exists phase10_communications_template_id_idx
  on public.communications(template_id);

create index if not exists phase10_document_signatures_signed_by_user_id_idx
  on public.document_signatures(signed_by_user_id);

create index if not exists phase10_documents_supersedes_document_id_idx
  on public.documents(supersedes_document_id);

create index if not exists phase10_invoice_payments_company_id_idx
  on public.invoice_payments(company_id);

create index if not exists phase10_invoice_payments_recorded_by_idx
  on public.invoice_payments(recorded_by);

create index if not exists phase10_invoices_created_by_idx
  on public.invoices(created_by);

create index if not exists phase10_invoices_quote_id_idx
  on public.invoices(quote_id);

create index if not exists phase10_job_checklists_company_id_idx
  on public.job_checklists(company_id);

create index if not exists phase10_job_checklists_completed_by_idx
  on public.job_checklists(completed_by);

create index if not exists phase10_job_photos_company_id_idx
  on public.job_photos(company_id);

create index if not exists phase10_job_photos_document_id_idx
  on public.job_photos(document_id);

create index if not exists phase10_job_photos_taken_by_idx
  on public.job_photos(taken_by);

create index if not exists phase10_job_status_events_company_id_idx
  on public.job_status_events(company_id);

create index if not exists phase10_job_status_events_created_by_idx
  on public.job_status_events(created_by);

create index if not exists phase10_job_status_events_dispatch_assignment_id_idx
  on public.job_status_events(dispatch_assignment_id);

create index if not exists phase10_notification_queue_communication_id_idx
  on public.notification_queue(communication_id);

create index if not exists phase10_notification_queue_company_id_idx
  on public.notification_queue(company_id);

create index if not exists phase10_notification_queue_customer_id_idx
  on public.notification_queue(customer_id);

create index if not exists phase10_notification_queue_profile_id_idx
  on public.notification_queue(profile_id);

create index if not exists phase10_quote_approval_tokens_created_by_idx
  on public.quote_approval_tokens(created_by);

create index if not exists phase10_quote_line_items_pricing_rule_id_idx
  on public.quote_line_items(pricing_rule_id);
