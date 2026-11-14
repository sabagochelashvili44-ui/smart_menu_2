-- Archive AI usage so Super-Admin can start a new Gemini billing cycle at zero.
-- Does not touch dishes, orders, or other restaurant data.

alter table public.restaurant_ai_usage
  add column if not exists archived_at timestamptz;

create index if not exists restaurant_ai_usage_active_idx
  on public.restaurant_ai_usage (restaurant_id, created_at desc)
  where archived_at is null;

grant update on public.restaurant_ai_usage to service_role;

create or replace view public.restaurant_ai_usage_totals
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(coalesce(estimated_cost_usd, cost_usd)), 0)::numeric(14, 6) as cost_usd,
  coalesce(sum(coalesce(estimated_cost_usd, cost_usd)), 0)::numeric(14, 6) as estimated_cost_usd
from public.restaurant_ai_usage
where archived_at is null
  and provider = 'gemini'
group by restaurant_id;

create or replace view public.restaurant_ai_usage_by_model
with (security_invoker = true) as
select
  restaurant_id,
  provider,
  model,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(coalesce(estimated_cost_usd, cost_usd)), 0)::numeric(14, 6) as cost_usd,
  coalesce(sum(coalesce(estimated_cost_usd, cost_usd)), 0)::numeric(14, 6) as estimated_cost_usd
from public.restaurant_ai_usage
where archived_at is null
  and provider = 'gemini'
group by restaurant_id, provider, model;

create or replace view public.restaurant_ai_usage_today
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens
from public.restaurant_ai_usage
where archived_at is null
  and provider = 'gemini'
  and (created_at at time zone 'Asia/Tbilisi')::date
    = (timezone('Asia/Tbilisi', now()))::date
group by restaurant_id;

create or replace view public.restaurant_ai_usage_week
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens
from public.restaurant_ai_usage
where archived_at is null
  and provider = 'gemini'
  and (created_at at time zone 'Asia/Tbilisi')::date
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
where archived_at is null
  and provider = 'gemini'
  and created_at >= now() - interval '7 days'
group by 1;

grant select on public.restaurant_ai_usage_totals to authenticated, service_role;
grant select on public.restaurant_ai_usage_by_model to authenticated, service_role;
grant select on public.restaurant_ai_usage_today to authenticated, service_role;
grant select on public.restaurant_ai_usage_week to authenticated, service_role;
grant select on public.restaurant_ai_usage_hourly to authenticated, service_role;
