-- Exact AI spend column + totals that Super-Admin aggregates per restaurant.

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
  estimated_cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.restaurant_ai_usage
  add column if not exists estimated_cost_usd numeric(12, 6);

update public.restaurant_ai_usage
set estimated_cost_usd = coalesce(estimated_cost_usd, cost_usd, 0)
where estimated_cost_usd is null;

alter table public.restaurant_ai_usage
  alter column estimated_cost_usd set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_ai_usage_estimated_cost_check'
      and conrelid = 'public.restaurant_ai_usage'::regclass
  ) then
    alter table public.restaurant_ai_usage
      add constraint restaurant_ai_usage_estimated_cost_check
      check (estimated_cost_usd >= 0);
  end if;
end $$;

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
group by restaurant_id, provider, model;

create index if not exists restaurant_ai_usage_restaurant_created_idx
  on public.restaurant_ai_usage (restaurant_id, created_at desc);

alter table public.restaurant_ai_usage enable row level security;
alter table public.restaurant_ai_usage force row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'is_super_admin'
      and pg_function_is_visible(oid)
  ) then
    drop policy if exists restaurant_ai_usage_select_super_admin
      on public.restaurant_ai_usage;
    create policy restaurant_ai_usage_select_super_admin
      on public.restaurant_ai_usage
      for select
      to authenticated
      using (public.is_super_admin());
  end if;
end $$;

grant select on public.restaurant_ai_usage to authenticated, service_role;
grant insert on public.restaurant_ai_usage to service_role;
grant select on public.restaurant_ai_usage_totals to authenticated, service_role;
grant select on public.restaurant_ai_usage_by_model to authenticated, service_role;
