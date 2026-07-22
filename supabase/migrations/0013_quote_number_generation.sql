-- =====================================================================
-- 0013_quote_number_generation.sql
-- Southern Magnolia Movers — Phase 4 (Quotes) safe quote numbering.
--
-- Provides public.next_quote_number(company uuid) -> text that produces
-- a per-company, gap-tolerant, collision-safe quote number in the form
-- 'Q-0001'. It preserves the UNIQUE(company_id, quote_number) constraint
-- under concurrency.
--
-- CONCURRENCY MODEL (critical):
--   * pg_advisory_xact_lock(hashtext(company::text)) serializes number
--     generation per-company for the duration of the CALLING transaction.
--   * Therefore this function MUST be called from INSIDE the same
--     transaction that performs the quote INSERT (i.e. from the
--     create_quote_with_items / duplicate_quote RPCs in 0014). The lock is
--     held until that transaction commits, so two concurrent creators
--     cannot read the same max and collide. Do NOT call it standalone and
--     then insert in a separate statement.
--
-- The next sequence is derived from the max trailing integer of existing
-- 'Q-<digits>' numbers for the company (tolerates deletions and ignores
-- any pre-existing numbers in other formats — those cannot collide with
-- the 'Q-' prefix). Never generated in the browser.
--
-- SECURITY DEFINER + pinned search_path so it can read past FORCE RLS to
-- compute max. EXECUTE revoked from anon/PUBLIC/authenticated; only the
-- SECURITY DEFINER quote RPCs (owned by the same role) invoke it.
-- No tables/data/policies changed.
-- =====================================================================

begin;

create or replace function public.next_quote_number(p_company uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq bigint;
begin
  if p_company is null then
    raise exception 'company is required for quote numbering';
  end if;

  -- Serialize per-company for the life of the caller's transaction.
  perform pg_advisory_xact_lock(hashtext(p_company::text));

  select coalesce(max((substring(q.quote_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_seq
  from public.quotes q
  where q.company_id = p_company
    and q.quote_number ~ '^Q-[0-9]+$';

  return 'Q-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke execute on function public.next_quote_number(uuid) from public;
revoke execute on function public.next_quote_number(uuid) from anon;
revoke execute on function public.next_quote_number(uuid) from authenticated;

commit;
