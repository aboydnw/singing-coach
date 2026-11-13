-- Provisional operation allowances. These are NOT dollars or a provider bill cap.
-- All policy and entitlement writes are server/operator-only; no client role claims.
create table public.cost_limit_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  free_monthly integer not null default 20 check (free_monthly between 1 and 1000000),
  paid_monthly integer not null default 200 check (paid_monthly between 1 and 1000000),
  user_per_minute integer not null default 5 check (user_per_minute between 1 and 1000),
  global_per_minute integer not null default 30 check (global_per_minute between 1 and 10000),
  global_per_day integer not null default 100 check (global_per_day between 1 and 1000000),
  global_per_month integer not null default 1000 check (global_per_month between 1 and 10000000)
);
insert into public.cost_limit_policy (id) values (true);

create table public.cost_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null check (tier in ('free', 'paid', 'admin')),
  paid_until timestamptz,
  check (tier <> 'paid' or paid_until is not null)
);

create table public.cost_usage_buckets (
  scope text not null,
  bucket_start timestamptz not null,
  user_id uuid references auth.users (id) on delete cascade,
  operations integer not null default 0 check (operations >= 0),
  primary key (scope, bucket_start)
);

alter table public.cost_limit_policy enable row level security;
alter table public.cost_entitlements enable row level security;
alter table public.cost_usage_buckets enable row level security;
revoke all on public.cost_limit_policy, public.cost_entitlements, public.cost_usage_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.cost_limit_policy, public.cost_entitlements, public.cost_usage_buckets to service_role;

create function public.consume_cost_operation(p_user_id uuid, p_operation text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  policy public.cost_limit_policy%rowtype;
  entitlement public.cost_entitlements%rowtype;
  instant timestamptz := clock_timestamp();
  minute_start timestamptz;
  day_start timestamptz;
  month_start timestamptz;
  next_month timestamptz;
  tier_limit integer;
  scopes text[];
  starts timestamptz[];
  limits integer[];
  ends timestamptz[];
  used integer;
begin
  if p_operation not in ('analyze', 'resynth', 'coach', 'chat', 'job_start') or p_operation is null then
    raise exception 'unknown cost operation' using errcode = '22023';
  end if;
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable', 'retry_after', 60);
  end if;

  -- One database transaction serializes every admission across all instances.
  -- This conservative MVP lock also makes the global and account budgets atomic.
  select * into policy from public.cost_limit_policy where id = true for update;
  if not found or not policy.enabled then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable', 'retry_after', 60);
  end if;
  -- Read time after acquiring the lock, so a delayed transaction cannot use an
  -- expired bucket. All boundaries use UTC even if the DB session does not.
  instant := clock_timestamp();
  minute_start := date_trunc('minute', instant, 'UTC');
  day_start := date_trunc('day', instant, 'UTC');
  month_start := date_trunc('month', instant, 'UTC');
  next_month := (date_trunc('month', instant at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  select * into entitlement from public.cost_entitlements where user_id = p_user_id;
  tier_limit := case when entitlement.tier = 'paid' and entitlement.paid_until > instant
    then policy.paid_monthly else policy.free_monthly end;

  scopes := array['global:minute', 'global:day', 'global:month', p_user_id::text || ':minute', p_user_id::text || ':month'];
  starts := array[minute_start, day_start, month_start, minute_start, month_start];
  limits := array[policy.global_per_minute, policy.global_per_day, policy.global_per_month, policy.user_per_minute, tier_limit];
  ends := array[minute_start + interval '1 minute', day_start + interval '24 hours', next_month, minute_start + interval '1 minute', next_month];

  for i in 1..5 loop
    -- An owner/test account skips personal allowances only. Emergency site-wide
    -- limits and the kill switch protect against leaked admin sessions too.
    if i > 3 and entitlement.tier = 'admin' then continue; end if;
    select operations into used from public.cost_usage_buckets where scope = scopes[i] and bucket_start = starts[i];
    if coalesce(used, 0) >= limits[i] then
      return jsonb_build_object('allowed', false, 'reason', case when i <= 3 then 'global_limit' else 'account_limit' end,
        'retry_after', greatest(1, ceil(extract(epoch from ends[i] - instant))::integer));
    end if;
  end loop;

  -- Denials do not mutate counters. Accepted work is charged before dispatch,
  -- including uncertain failures and every upstream retry. Never auto-refund.
  for i in 1..5 loop
    insert into public.cost_usage_buckets (scope, bucket_start, user_id, operations)
    values (scopes[i], starts[i], case when i > 3 then p_user_id else null end, 1)
    on conflict (scope, bucket_start) do update set operations = public.cost_usage_buckets.operations + 1;
  end loop;
  return jsonb_build_object('allowed', true, 'reason', 'allowed', 'retry_after', 0);
end;
$$;
revoke all on function public.consume_cost_operation(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_cost_operation(uuid, text) to service_role;
