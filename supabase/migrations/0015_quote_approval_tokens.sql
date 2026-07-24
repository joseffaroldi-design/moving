-- =====================================================================
-- 0015_quote_approval_tokens.sql
-- Southern Magnolia Movers — secure customer quote links.
-- Raw tokens are returned once and never stored; only SHA-256 hashes live
-- in the database. The token table is inaccessible through the Data API.
--
-- Revision vs. uploaded draft: respond_to_quote_approval now re-checks the
-- quote's own expires_at (auto-expires + rejects) so an expired-by-date quote
-- cannot be accepted via a still-valid token, matching get_quote_by_approval_token.
-- =====================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.quote_approval_tokens (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references public.quotes(id) on delete cascade,
  token_hash     bytea not null unique,
  expires_at     timestamptz not null,
  created_by     uuid not null references auth.users(id) on delete restrict,
  created_at     timestamptz not null default now(),
  last_viewed_at timestamptz,
  decided_at     timestamptz,
  revoked_at     timestamptz,
  constraint quote_approval_tokens_future_expiry check (expires_at > created_at)
);

create index if not exists quote_approval_tokens_quote_id_idx
  on public.quote_approval_tokens (quote_id);
create index if not exists quote_approval_tokens_active_idx
  on public.quote_approval_tokens (expires_at)
  where revoked_at is null and decided_at is null;

alter table public.quote_approval_tokens enable row level security;
alter table public.quote_approval_tokens force row level security;
revoke all on table public.quote_approval_tokens from public, anon, authenticated;

-- Staff: revoke all active links for one company-owned quote.
create or replace function public.revoke_quote_approval_links(p_quote_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company uuid := public._require_quote_mutator();
  v_quote_company uuid;
  v_count integer;
begin
  select company_id into v_quote_company from public.quotes where id = p_quote_id;
  if v_quote_company is null then raise exception 'Quote not found'; end if;
  if v_quote_company <> v_company then raise exception 'Quote does not belong to your company'; end if;

  update public.quote_approval_tokens
     set revoked_at = now()
   where quote_id = p_quote_id and revoked_at is null and decided_at is null;
  get diagnostics v_count = row_count;
  return json_build_object('quote_id', p_quote_id, 'revoked_count', v_count);
end;
$$;

-- Staff: create a fresh link. Generating a link also marks a draft as sent.
create or replace function public.create_quote_approval_link(
  p_quote_id uuid,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public._require_quote_mutator();
  v_quote_company uuid;
  v_status text;
  v_token text;
begin
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Link expiration must be in the future';
  end if;
  if p_expires_at > now() + interval '30 days' then
    raise exception 'Link expiration cannot exceed 30 days';
  end if;

  select company_id, status::text into v_quote_company, v_status
    from public.quotes where id = p_quote_id for update;
  if v_quote_company is null then raise exception 'Quote not found'; end if;
  if v_quote_company <> v_company then raise exception 'Quote does not belong to your company'; end if;
  if v_status not in ('draft','sent','viewed') then
    raise exception 'Approval links cannot be created for a quote in status %', v_status;
  end if;

  update public.quote_approval_tokens set revoked_at = now()
   where quote_id = p_quote_id and revoked_at is null and decided_at is null;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.quote_approval_tokens (quote_id, token_hash, expires_at, created_by)
  values (p_quote_id, digest(v_token, 'sha256'), p_expires_at, v_uid);

  update public.quotes
     set status = case when status::text = 'draft' then 'sent'::public.quote_status else status end,
         sent_at = coalesce(sent_at, now()), updated_at = now()
   where id = p_quote_id;

  return json_build_object('quote_id', p_quote_id, 'token', v_token, 'expires_at', p_expires_at);
end;
$$;

-- Token validator used internally by the two public RPCs.
create or replace function public._require_quote_approval_token(p_token text)
returns public.quote_approval_tokens
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_row public.quote_approval_tokens;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This quote link is invalid or unavailable';
  end if;
  select * into v_row
    from public.quote_approval_tokens
   where token_hash = digest(p_token, 'sha256')
     and revoked_at is null and decided_at is null and expires_at > now();
  if not found then raise exception 'This quote link is invalid or unavailable'; end if;
  return v_row;
end;
$$;

-- Public/token-bearer read. Returns only the document fields needed by the
-- customer page; it does not grant table access or expose internal IDs beyond
-- the quote itself.
create or replace function public.get_quote_by_approval_token(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare t public.quote_approval_tokens; q record; v_items json; v_profile record;
begin
  t := public._require_quote_approval_token(p_token);
  select * into q from public.quotes where id = t.quote_id;
  if not found or q.status::text not in ('sent','viewed') then
    raise exception 'This quote link is invalid or unavailable';
  end if;
  if q.expires_at is not null and q.expires_at <= now() then
    update public.quotes set status = 'expired', updated_at = now() where id = q.id;
    raise exception 'This quote has expired';
  end if;

  update public.quote_approval_tokens set last_viewed_at = now() where id = t.id;
  if q.status::text = 'sent' then
    update public.quotes set status = 'viewed', updated_at = now() where id = q.id;
    q.status := 'viewed'::public.quote_status;
  end if;

  select coalesce(json_agg(json_build_object(
    'description', description, 'quantity', quantity, 'unit_price', unit_price,
    'total', total, 'sort_order', sort_order) order by sort_order), '[]'::json)
    into v_items from public.quote_line_items where quote_id = q.id;
  select first_name, last_name into v_profile
    from public.customers where id = q.customer_id;

  return json_build_object(
    'id', q.id, 'quote_number', q.quote_number, 'status', q.status::text,
    'created_at', q.created_at, 'expires_at', q.expires_at,
    'hourly_rate', q.hourly_rate, 'estimated_hours', q.estimated_hours,
    'travel_fee', q.travel_fee, 'packing_fee', q.packing_fee,
    'materials_fee', q.materials_fee, 'discount', q.discount,
    'subtotal', q.subtotal, 'tax_rate', q.tax_rate, 'tax', q.tax,
    'total', q.total, 'deposit_percent', q.deposit_percent,
    'deposit_amount', q.deposit_amount,
    'customer', json_build_object('first_name', v_profile.first_name, 'last_name', v_profile.last_name),
    'line_items', v_items
  );
end;
$$;

-- Public/token-bearer decision. The decision is single-use and atomic.
create or replace function public.respond_to_quote_approval(
  p_token text,
  p_decision text
)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare t public.quote_approval_tokens; v_status text; v_expires timestamptz; v_new public.quote_status;
begin
  if lower(coalesce(p_decision,'')) not in ('accept','decline') then
    raise exception 'Decision must be accept or decline';
  end if;
  t := public._require_quote_approval_token(p_token);
  select status::text, expires_at into v_status, v_expires
    from public.quotes where id = t.quote_id for update;
  if v_status not in ('sent','viewed') then
    raise exception 'This quote is no longer awaiting a decision';
  end if;
  -- Guard: an expired-by-date quote cannot be decided via a still-valid token.
  if v_expires is not null and v_expires <= now() then
    update public.quotes set status = 'expired', updated_at = now() where id = t.quote_id;
    raise exception 'This quote has expired';
  end if;
  v_new := case when lower(p_decision) = 'accept'
                then 'accepted'::public.quote_status else 'rejected'::public.quote_status end;
  update public.quotes
     set status = v_new,
         accepted_at = case when v_new = 'accepted' then now() else accepted_at end,
         updated_at = now()
   where id = t.quote_id;
  update public.quote_approval_tokens set decided_at = now() where id = t.id;
  update public.quote_approval_tokens set revoked_at = now()
   where quote_id = t.quote_id and id <> t.id and revoked_at is null and decided_at is null;
  return json_build_object('quote_id', t.quote_id, 'status', v_new::text);
end;
$$;

-- Default function EXECUTE is PUBLIC: remove it explicitly everywhere, then
-- grant only the intended entry points.
revoke execute on function public._require_quote_approval_token(text) from public, anon, authenticated;
revoke execute on function public.create_quote_approval_link(uuid,timestamptz) from public, anon;
revoke execute on function public.revoke_quote_approval_links(uuid) from public, anon;
grant execute on function public.create_quote_approval_link(uuid,timestamptz) to authenticated;
grant execute on function public.revoke_quote_approval_links(uuid) to authenticated;

revoke execute on function public.get_quote_by_approval_token(text) from public;
revoke execute on function public.respond_to_quote_approval(text,text) from public;
grant execute on function public.get_quote_by_approval_token(text) to anon, authenticated;
grant execute on function public.respond_to_quote_approval(text,text) to anon, authenticated;

commit;
