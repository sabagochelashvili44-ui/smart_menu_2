-- Super-Admin AI plan, token caps, and usage aggregates.

alter table public.restaurants
  add column if not exists ai_plan text,
  add column if not exists ai_daily_token_limit integer,
  add column if not exists ai_weekly_token_limit integer;

update public.restaurants
set
  ai_plan = coalesce(nullif(ai_plan, ''), 'free'),
  ai_daily_token_limit = coalesce(ai_daily_token_limit, 50000),
  ai_weekly_token_limit = coalesce(ai_weekly_token_limit, 350000)
where true;

alter table public.restaurants
  alter column ai_plan set default 'free',
  alter column ai_daily_token_limit set default 50000,
  alter column ai_weekly_token_limit set default 350000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_ai_plan_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_ai_plan_check
      check (ai_plan in ('free', 'paid'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_ai_daily_token_limit_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_ai_daily_token_limit_check
      check (ai_daily_token_limit is null or ai_daily_token_limit >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_ai_weekly_token_limit_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_ai_weekly_token_limit_check
      check (ai_weekly_token_limit is null or ai_weekly_token_limit >= 0);
  end if;
end $$;

create or replace view public.restaurant_ai_usage_by_model
with (security_invoker = true) as
select
  restaurant_id,
  provider,
  model,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(cost_usd), 0)::numeric(14, 6) as cost_usd
from public.restaurant_ai_usage
group by restaurant_id, provider, model;

create or replace view public.restaurant_ai_usage_today
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens
from public.restaurant_ai_usage
where (created_at at time zone 'Asia/Tbilisi')::date
  = (timezone('Asia/Tbilisi', now()))::date
group by restaurant_id;

create or replace view public.restaurant_ai_usage_week
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens
from public.restaurant_ai_usage
where (created_at at time zone 'Asia/Tbilisi')::date
  >= (timezone('Asia/Tbilisi', now()))::date - 6
group by restaurant_id;

create or replace view public.restaurant_ai_usage_hourly
with (security_invoker = true) as
select
  extract(hour from (created_at at time zone 'Asia/Tbilisi'))::integer as hour,
  count(*) filter (where feature = 'chat')::bigint as chat_calls,
  count(*)::bigint as all_calls,
  coalesce(sum(total_tokens) filter (where feature = 'chat'), 0)::bigint as chat_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens
from public.restaurant_ai_usage
where created_at >= now() - interval '7 days'
group by 1;

grant select on public.restaurant_ai_usage_by_model to authenticated, service_role;
grant select on public.restaurant_ai_usage_today to authenticated, service_role;
grant select on public.restaurant_ai_usage_week to authenticated, service_role;
grant select on public.restaurant_ai_usage_hourly to authenticated, service_role;
