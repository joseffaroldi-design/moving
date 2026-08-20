-- Phase 13 follow-up: cover active preference-table company foreign keys.
create index if not exists phase13_saved_views_company_id_idx
  on public.saved_views(company_id);
create index if not exists phase13_user_preferences_company_id_idx
  on public.user_preferences(company_id);
