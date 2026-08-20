create table if not exists app_private.public_intake_rate_limits (
  endpoint text not null,
  dimension text not null,
  key_hash text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (endpoint, dimension, key_hash, window_seconds, window_start),
  constraint public_intake_rate_limits_endpoint_check check (endpoint in ('lead','estimate')),
  constraint public_intake_rate_limits_dimension_check check (dimension in ('ip','email')),
  constraint public_intake_rate_limits_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint public_intake_rate_limits_window_check check (window_seconds between 10 and 86400),
  constraint public_intake_rate_limits_count_check check (request_count > 0)
);

alter table app_private.public_intake_rate_limits enable row level security;
revoke all on table app_private.public_intake_rate_limits from public, anon, authenticated;

create index if not exists public_intake_rate_limits_expires_idx
  on app_private.public_intake_rate_limits (expires_at);

create or replace function public.check_public_intake_rate_limit(
  p_endpoint text,
  p_ip_hash text,
  p_email_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_spec record;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_allowed boolean := true;
  v_retry_after integer := 0;
begin
  if p_endpoint not in ('lead','estimate') then
    raise exception 'invalid_rate_limit_endpoint';
  end if;

  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_ip_hash';
  end if;

  if p_email_hash is not null and p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_email_hash';
  end if;

  for v_spec in
    select *
    from (
      values
        ('lead'::text, 'ip'::text,     p_ip_hash,    60,   5),
        ('lead'::text, 'ip'::text,     p_ip_hash,    3600, 30),
        ('lead'::text, 'email'::text,  p_email_hash, 600,  3),
        ('estimate'::text, 'ip'::text, p_ip_hash,    60,   30),
        ('estimate'::text, 'ip'::text, p_ip_hash,    3600, 200)
    ) as s(endpoint, dimension, key_hash, window_seconds, request_limit)
    where s.endpoint = p_endpoint
      and s.key_hash is not null
  loop
    v_window_start := to_timestamp(
      floor(extract(epoch from clock_timestamp()) / v_spec.window_seconds) * v_spec.window_seconds
    );
    v_window_end := v_window_start + make_interval(secs => v_spec.window_seconds);

    insert into app_private.public_intake_rate_limits (
      endpoint, dimension, key_hash, window_seconds, window_start, request_count, expires_at
    )
    values (
      v_spec.endpoint,
      v_spec.dimension,
      v_spec.key_hash,
      v_spec.window_seconds,
      v_window_start,
      1,
      v_window_end + interval '5 minutes'
    )
    on conflict (endpoint, dimension, key_hash, window_seconds, window_start)
    do update set
      request_count = app_private.public_intake_rate_limits.request_count + 1,
      expires_at = greatest(app_private.public_intake_rate_limits.expires_at, excluded.expires_at)
    returning request_count into v_count;

    if v_count > v_spec.request_limit then
      v_allowed := false;
      v_retry_after := greatest(
        v_retry_after,
        greatest(1, ceil(extract(epoch from (v_window_end - clock_timestamp())))::integer)
      );
    end if;
  end loop;

  delete from app_private.public_intake_rate_limits
  where ctid in (
    select ctid
    from app_private.public_intake_rate_limits
    where expires_at < clock_timestamp()
    order by expires_at
    limit 100
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'retry_after_seconds', v_retry_after
  );
end;
$$;

revoke all on function public.check_public_intake_rate_limit(text,text,text) from public, anon, authenticated;
grant execute on function public.check_public_intake_rate_limit(text,text,text) to service_role;
