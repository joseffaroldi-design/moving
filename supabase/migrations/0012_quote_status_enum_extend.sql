-- =====================================================================
-- 0012_quote_status_enum_extend.sql
-- Southern Magnolia Movers — Phase 4 (Quotes) status model (Option 1).
--
-- Additively extends public.quote_status with three new labels. The
-- canonical values 'accepted' and 'rejected' are PRESERVED (the 2 existing
-- quote rows are NOT renamed or rewritten). The UI maps:
--     accepted -> "Approved",  rejected -> "Declined".
--
-- Existing labels: draft, sent, accepted, rejected, expired
-- Adds:            viewed, converted, cancelled
--
-- MIGRATION BOUNDARY: this migration ONLY adds enum values. Per Postgres,
-- a newly added enum value cannot be *used* in the same transaction that
-- adds it, so every RPC/DDL that references 'viewed'/'converted'/'cancelled'
-- lands in a LATER migration (0013+), run only after this one is committed.
--
-- Each statement is standalone (no explicit begin/commit) so the values are
-- committed independently. IF NOT EXISTS makes it idempotent / re-runnable.
-- No tables, no data, no grants, no policies change here.
-- =====================================================================

alter type public.quote_status add value if not exists 'viewed';
alter type public.quote_status add value if not exists 'converted';
alter type public.quote_status add value if not exists 'cancelled';
