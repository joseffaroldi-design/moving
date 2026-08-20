-- Phase 13: targeted production performance cleanup
-- Preserve authorization semantics while eliminating avoidable RLS init-plan
-- work and indexing active operational foreign keys.

-- saved_views: keep dedicated SELECT, replace FOR ALL with explicit writes so
-- SELECT is not evaluated through two permissive policies.
drop policy if exists saved_views_owner_write on public.saved_views;
alter policy saved_views_owner_select on public.saved_views
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy saved_views_owner_insert on public.saved_views
  for insert to authenticated
  with check ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy saved_views_owner_update on public.saved_views
  for update to authenticated
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id))
  with check ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy saved_views_owner_delete on public.saved_views
  for delete to authenticated
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id));

-- user_preferences: same access semantics, explicit write policies.
drop policy if exists user_preferences_owner_write on public.user_preferences;
alter policy user_preferences_owner_select on public.user_preferences
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy user_preferences_owner_insert on public.user_preferences
  for insert to authenticated
  with check ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy user_preferences_owner_update on public.user_preferences
  for update to authenticated
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id))
  with check ((profile_id = (select auth.uid())) and public.is_company_member(company_id));
create policy user_preferences_owner_delete on public.user_preferences
  for delete to authenticated
  using ((profile_id = (select auth.uid())) and public.is_company_member(company_id));

-- Operational FK coverage. Intentionally excludes dormant payroll, commission,
-- inventory/survey and legacy portal-token modules until those modules are active.
create index if not exists phase13_job_expenses_created_by_idx
  on public.job_expenses(created_by);
create index if not exists phase13_job_expenses_job_id_idx
  on public.job_expenses(job_id);
create index if not exists phase13_job_expenses_receipt_document_id_idx
  on public.job_expenses(receipt_document_id);
create index if not exists phase13_job_stops_company_id_idx
  on public.job_stops(company_id);
create index if not exists phase13_job_trucks_truck_id_idx
  on public.job_trucks(truck_id);
create index if not exists phase13_message_templates_created_by_idx
  on public.message_templates(created_by);
create index if not exists phase13_operational_issues_dispatch_assignment_id_idx
  on public.operational_issues(dispatch_assignment_id);
create index if not exists phase13_operational_issues_job_id_idx
  on public.operational_issues(job_id);
create index if not exists phase13_operational_issues_reported_by_idx
  on public.operational_issues(reported_by);
create index if not exists phase13_operational_issues_resolved_by_idx
  on public.operational_issues(resolved_by);
create index if not exists phase13_storage_uploads_uploaded_by_idx
  on public.storage_uploads(uploaded_by);
create index if not exists phase13_trucks_company_id_idx
  on public.trucks(company_id);
create index if not exists phase13_webhook_events_company_id_idx
  on public.webhook_events(company_id);
