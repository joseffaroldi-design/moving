-- =====================================================================
-- 0008_lead_notes_grant_fix.sql
-- Southern Magnolia Movers — fix for 0007.
--
-- 0007 created public.lead_notes and granted authenticated SELECT+INSERT, but
-- Supabase's ALTER DEFAULT PRIVILEGES auto-granted authenticated ALL privileges
-- on the new table. The excess (DELETE/UPDATE/TRUNCATE/TRIGGER/REFERENCES) was
-- never revoked, breaking the intended append-only guarantee.
--
-- This migration strips authenticated back to the append-only minimum and
-- re-confirms anon/PUBLIC have nothing. Idempotent, non-destructive.
-- =====================================================================

begin;

revoke all on table public.lead_notes from anon;
revoke all on table public.lead_notes from public;

revoke delete, truncate, trigger, references, update
  on table public.lead_notes from authenticated;
grant  select, insert on table public.lead_notes to authenticated;

commit;
