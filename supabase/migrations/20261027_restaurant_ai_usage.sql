-- Central Gemini/OpenAI token log, keyed by restaurant.

create table if not exists public.restaurant_ai_usage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  feature text not null,
  provider text not null,
  model text not null default '',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_ai_usage_feature_check
    check (feature in ('chat', 'rewrite', 'digest', 'analytics', 'translate')),
  constraint restaurant_ai_usage_provider_check
    check (provider in ('gemini', 'openai')),
  constraint restaurant_ai_usage_tokens_check
    check (
      prompt_tokens >= 0
      and completion_tokens >= 0
      and total_tokens >= 0
    ),
  constraint restaurant_ai_usage_cost_check
    check (cost_usd >= 0)
);

create index if not exists restaurant_ai_usage_restaurant_created_idx
  on public.restaurant_ai_usage (restaurant_id, created_at desc);

alter table public.restaurant_ai_usage enable row level security;
alter table public.restaurant_ai_usage force row level security;

drop policy if exists restaurant_ai_usage_select_super_admin
  on public.restaurant_ai_usage;
create policy restaurant_ai_usage_select_super_admin
  on public.restaurant_ai_usage
  for select
  to authenticated
  using (public.is_super_admin());

grant select on public.restaurant_ai_usage to authenticated, service_role;
grant insert on public.restaurant_ai_usage to service_role;

create or replace view public.restaurant_ai_usage_totals
with (security_invoker = true) as
select
  restaurant_id,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(cost_usd), 0)::numeric(14, 6) as cost_usd
from public.restaurant_ai_usage
group by restaurant_id;

grant select on public.restaurant_ai_usage_totals to authenticated, service_role;
