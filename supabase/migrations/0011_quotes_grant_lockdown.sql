-- =====================================================================
-- 0011_quotes_grant_lockdown.sql
-- Southern Magnolia Movers — Phase 4 (Quotes) P0 SECURITY LOCKDOWN.
--
-- Closes the critical gap found in the Quotes preflight:
--   * anon had DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE
--     on quotes AND quote_line_items (financial tables).
--   * authenticated had the same unrestricted set (incl. TRUNCATE, which
--     RLS does NOT protect).
--   * broad policies let ANY company member (customer, mover, crew_lead)
--     read every quote and line item.
--   * quotes_customer_self_select relied on the unsafe current_customer_id().
--
-- End state (this migration):
--   * anon + PUBLIC: NO privileges on either table.
--   * authenticated: SELECT ONLY (RLS staff-scoped). No INSERT/UPDATE/
--     DELETE/TRUNCATE/TRIGGER/REFERENCES. All writes go through future
--     SECURITY DEFINER RPCs (0013+), mirroring create_lead_with_customer.
--   * ALL existing policies on both tables are dropped and replaced with
--     exactly two staff-only SELECT policies. RLS is enabled AND forced.
--   * postgres / service_role administrative grants are left untouched.
--
-- Additive & safe: no columns, no data changes. The 2 existing quote rows
-- are untouched. The current UI reads quotes via the public mvp-dashboard
-- Edge Function payload (service role), NOT direct table reads, so this
-- does not break the current app.
--
-- Staff role set (matches leads/customers hardening):
--   SELECT: owner, operations_manager, dispatcher, sales
--   (writes: none direct — RPC-only, added in later migrations)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. GRANT LOCKDOWN
-- ---------------------------------------------------------------------
-- Strip everything from anon and PUBLIC.
revoke all on table public.quotes            from anon;
revoke all on table public.quotes            from public;
revoke all on table public.quote_line_items  from anon;
revoke all on table public.quote_line_items  from public;

-- Strip everything from authenticated, then grant back SELECT only.
-- (removes DELETE, TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE)
revoke all on table public.quotes            from authenticated;
revoke all on table public.quote_line_items  from authenticated;
grant select on table public.quotes           to authenticated;
grant select on table public.quote_line_items to authenticated;

-- ---------------------------------------------------------------------
-- 2. DROP ALL EXISTING POLICIES (deterministic clean slate)
-- ---------------------------------------------------------------------
-- Removes broad/unsafe policies (quotes_company_select,
-- quote_line_items_member_select, quotes_customer_self_select,
-- quote_line_items_sales_write FOR ALL) and any others, so the final
-- policy set is exactly what we recreate below. Writes are already
-- impossible for authenticated after step 1 regardless of policies.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('quotes', 'quote_line_items')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ENABLE + FORCE RLS
-- ---------------------------------------------------------------------
alter table public.quotes            enable row level security;
alter table public.quotes            force  row level security;
alter table public.quote_line_items  enable row level security;
alter table public.quote_line_items  force  row level security;

-- ---------------------------------------------------------------------
-- 4. STAFF-ONLY SELECT POLICIES
-- ---------------------------------------------------------------------
-- quotes: staff of the owning company only.
create policy quotes_staff_select
  on public.quotes
  for select
  to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner','operations_manager','dispatcher','sales']::public.user_role[]
    )
  );

-- quote_line_items: readable only by staff who may read the PARENT quote
-- (company + role derived from the parent, never from membership alone).
create policy quote_line_items_staff_select
  on public.quote_line_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quotes q
      where q.id = quote_line_items.quote_id
        and public.has_company_role(
              q.company_id,
              array['owner','operations_manager','dispatcher','sales']::public.user_role[]
            )
    )
  );

commit;
