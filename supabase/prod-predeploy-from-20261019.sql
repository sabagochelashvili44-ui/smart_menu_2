-- PRODUCTION pre-deploy migrations (idempotent).
-- Target: Supabase project bxvxredftkpdwmonvfgc
-- Run in SQL Editor BEFORE deploying this code to Vercel Production.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS where applicable.


-- ===== supabase/migrations/20261019_dish_nutrition_macros.sql =====

alter table public.dishes
  add column if not exists calories numeric;

alter table public.dishes
  add column if not exists protein numeric;

alter table public.dishes
  add column if not exists carbs numeric;

alter table public.dishes
  add column if not exists fat numeric;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261019_reviews_table_columns.sql =====

alter table public.reviews
  add column if not exists table_id uuid;

alter table public.reviews
  add column if not exists table_number text;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261019_shift_notes_author_columns.sql =====

-- Older shift_notes tables may exist without author columns because
-- `create table if not exists` does not add missing fields later.

alter table public.shift_notes
  add column if not exists author_email text not null default '';

alter table public.shift_notes
  add column if not exists author_role text;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261019_shift_notes_content.sql =====

-- Live shift_notes requires `content`; keep `body` in sync for older rows.

alter table public.shift_notes
  add column if not exists content text not null default '';

alter table public.shift_notes
  add column if not exists body text not null default '';

update public.shift_notes
set content = body
where (content is null or btrim(content) = '')
  and coalesce(body, '') <> '';

update public.shift_notes
set body = content
where (body is null or btrim(body) = '')
  and coalesce(content, '') <> '';

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261024_waiter_calls_archived_at.sql =====

-- Soft-hide kitchen history. Confirmed sales stay in Overview and Analytics.

alter table public.waiter_calls
  add column if not exists archived_at timestamptz;

create index if not exists waiter_calls_restaurant_active_idx
  on public.waiter_calls (restaurant_id, created_at desc)
  where archived_at is null;


-- ===== supabase/migrations/20261026_hours_and_dish_i18n.sql =====

alter table public.restaurants
  add column if not exists hours_enabled boolean not null default false;

alter table public.restaurants
  add column if not exists hours_open text;

alter table public.restaurants
  add column if not exists hours_close text;

alter table public.dishes
  add column if not exists name_en text;

alter table public.dishes
  add column if not exists name_ru text;

alter table public.dishes
  add column if not exists description_en text;

alter table public.dishes
  add column if not exists description_ru text;

alter table public.categories
  add column if not exists name_en text;

alter table public.categories
  add column if not exists name_ru text;


-- ===== supabase/migrations/20261026_restaurant_ai_hosts.sql =====

-- One isolated Chef Assistant identity per restaurant.

create table if not exists public.restaurant_ai_hosts (
  restaurant_id uuid primary key
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.restaurant_ai_hosts (restaurant_id)
select id from public.restaurants
on conflict (restaurant_id) do nothing;

alter table public.restaurant_ai_hosts enable row level security;

grant select, insert, update, delete on table public.restaurant_ai_hosts
to anon, authenticated, service_role;


-- ===== supabase/migrations/20261026_restaurant_ai_prompts.sql =====

-- Per-restaurant Chef Assistant quick-prompt chips.

create table if not exists public.restaurant_ai_prompts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  label text not null,
  query_text text not null,
  icon text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_ai_prompts_label_check
    check (char_length(btrim(label)) between 1 and 80),
  constraint restaurant_ai_prompts_query_check
    check (char_length(btrim(query_text)) between 1 and 500),
  constraint restaurant_ai_prompts_icon_check
    check (char_length(icon) <= 16)
);

create index if not exists restaurant_ai_prompts_restaurant_sort_idx
  on public.restaurant_ai_prompts (restaurant_id, sort_order, created_at);

alter table public.restaurant_ai_prompts enable row level security;

grant select, insert, update, delete on table public.restaurant_ai_prompts
to anon, authenticated, service_role;

drop policy if exists restaurant_ai_prompts_select_public on public.restaurant_ai_prompts;
create policy restaurant_ai_prompts_select_public
  on public.restaurant_ai_prompts
  for select
  to anon, authenticated
  using (true);

insert into public.restaurant_ai_prompts (
  restaurant_id, icon, label, query_text, is_active, sort_order
)
select
  r.id,
  d.icon,
  d.label,
  d.query_text,
  true,
  d.sort_order
from public.restaurants r
cross join (
  values
    (
      0,
      'ðŸ·',
      'áƒ áƒ áƒ¦áƒ•áƒ˜áƒœáƒ áƒ¨áƒ”áƒ•áƒ£áƒ®áƒáƒ›áƒ áƒ™áƒ”áƒ áƒ«áƒ”áƒ‘áƒ¡?',
      'áƒ áƒ áƒ¦áƒ•áƒ˜áƒœáƒ áƒáƒœ áƒ¡áƒáƒ¡áƒ›áƒ”áƒšáƒ˜ áƒ¨áƒ”áƒ•áƒ£áƒ®áƒáƒ›áƒ áƒáƒ› áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¡ áƒ«áƒ˜áƒ áƒ˜áƒ—áƒáƒ“ áƒ™áƒ”áƒ áƒ«áƒ”áƒ‘áƒ¡? áƒ›áƒ®áƒáƒšáƒáƒ“ áƒ˜áƒ¡, áƒ áƒáƒª áƒáƒ› áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¨áƒ˜áƒ.'
    ),
    (
      1,
      'ðŸŒ±',
      'áƒ›áƒ˜áƒ áƒ©áƒ˜áƒ” áƒ¡áƒáƒ›áƒáƒ áƒ®áƒ•áƒ/áƒ•áƒ”áƒ’áƒ”áƒ¢áƒáƒ áƒ˜áƒáƒœáƒ£áƒšáƒ˜',
      'áƒ›áƒ˜áƒ áƒ©áƒ˜áƒ” áƒ¡áƒáƒ›áƒáƒ áƒ®áƒ•áƒ áƒáƒœ áƒ•áƒ”áƒ’áƒ”áƒ¢áƒáƒ áƒ˜áƒáƒœáƒ£áƒšáƒ˜ áƒ™áƒ”áƒ áƒ«áƒ”áƒ‘áƒ˜, áƒ áƒáƒ›áƒšáƒ”áƒ‘áƒ˜áƒª áƒáƒ®áƒšáƒ áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¨áƒ˜áƒ.'
    ),
    (
      2,
      'ðŸŒ¶ï¸',
      'áƒ áƒ áƒáƒ áƒ˜áƒ¡ áƒ§áƒ•áƒ”áƒšáƒáƒ–áƒ” áƒžáƒáƒžáƒ£áƒšáƒáƒ áƒ£áƒšáƒ˜?',
      'áƒ áƒ áƒáƒ áƒ˜áƒ¡ áƒ“áƒ¦áƒ”áƒ¡ áƒ§áƒ•áƒ”áƒšáƒáƒ–áƒ” áƒžáƒáƒžáƒ£áƒšáƒáƒ áƒ£áƒšáƒ˜ áƒ™áƒ”áƒ áƒ«áƒ”áƒ‘áƒ˜ áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¨áƒ˜?'
    ),
    (
      3,
      'âš¡',
      'áƒ¡áƒ¬áƒ áƒáƒ¤áƒ˜ áƒšáƒáƒœáƒ©áƒ˜',
      'áƒ›áƒ˜áƒ áƒ©áƒ˜áƒ”áƒ— áƒ¡áƒ¬áƒ áƒáƒ¤áƒ˜ áƒšáƒáƒœáƒ©áƒ˜ â€” áƒ™áƒ”áƒ áƒ«áƒ˜, áƒ áƒáƒ›áƒ”áƒšáƒ˜áƒª áƒ¡áƒ¬áƒ áƒáƒ¤áƒáƒ“ áƒ›áƒ–áƒáƒ“áƒ“áƒ”áƒ‘áƒ áƒ“áƒ áƒœáƒáƒ§áƒ˜áƒ”áƒ áƒ˜áƒ.'
    ),
    (
      4,
      'ðŸ”¥',
      'áƒ¢áƒáƒž 3 áƒ‘áƒ”áƒ¡áƒ¢áƒ¡áƒ”áƒšáƒ”áƒ áƒ˜',
      'áƒ áƒáƒ›áƒ”áƒšáƒ˜áƒ áƒ“áƒ¦áƒ”áƒ¡ áƒ—áƒ¥áƒ•áƒ”áƒœáƒ˜ áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¡ áƒ¢áƒáƒž 3 áƒ§áƒ•áƒ”áƒšáƒáƒ–áƒ” áƒžáƒáƒžáƒ£áƒšáƒáƒ áƒ£áƒšáƒ˜ áƒ™áƒ”áƒ áƒ«áƒ˜?'
    ),
    (
      5,
      'ðŸ°',
      'áƒ¡áƒáƒ¤áƒ˜áƒ áƒ›áƒ áƒ“áƒ”áƒ¡áƒ”áƒ áƒ¢áƒ˜',
      'áƒ›áƒ˜áƒ áƒ©áƒ˜áƒ”áƒ— áƒ¡áƒáƒ¤áƒ˜áƒ áƒ›áƒ áƒ“áƒ”áƒ¡áƒ”áƒ áƒ¢áƒ˜ áƒáƒ› áƒ›áƒ”áƒœáƒ˜áƒ£áƒ“áƒáƒœ.'
    ),
    (
      6,
      'ðŸ‘¶',
      'áƒ¡áƒáƒ‘áƒáƒ•áƒ¨áƒ•áƒ áƒ›áƒ”áƒœáƒ˜áƒ£',
      'áƒ áƒáƒ›áƒ”áƒšáƒ˜ áƒ™áƒ”áƒ áƒ«áƒ˜ áƒ’áƒáƒ›áƒáƒ“áƒ’áƒ”áƒ‘áƒ áƒ‘áƒáƒ•áƒ¨áƒ•áƒ˜áƒ¡áƒ—áƒ•áƒ˜áƒ¡ áƒáƒ› áƒ›áƒ”áƒœáƒ˜áƒ£áƒ“áƒáƒœ â€” áƒ›áƒ¡áƒ£áƒ‘áƒ£áƒ¥áƒ˜ áƒ“áƒ áƒáƒ áƒáƒªáƒ®áƒáƒ áƒ”?'
    ),
    (
      7,
      'ðŸ½ï¸',
      'áƒ¡áƒ®áƒ•áƒ',
      'áƒ™áƒ˜áƒ“áƒ”áƒ• áƒ áƒ áƒ’áƒáƒœáƒ¡áƒ®áƒ•áƒáƒ•áƒ”áƒ‘áƒ£áƒš áƒ™áƒ”áƒ áƒ«áƒ”áƒ‘áƒ¡ áƒ›áƒ˜áƒ áƒ©áƒ”áƒ•áƒ“áƒ˜áƒ— áƒ©áƒ•áƒ”áƒœáƒ˜ áƒ›áƒ”áƒœáƒ˜áƒ£áƒ¡ áƒ¡áƒ®áƒ•áƒ áƒ™áƒáƒ¢áƒ”áƒ’áƒáƒ áƒ˜áƒ”áƒ‘áƒ˜áƒ“áƒáƒœ (áƒ›áƒáƒ’áƒáƒšáƒ˜áƒ—áƒáƒ“, áƒ¡áƒáƒšáƒáƒ—áƒ”áƒ‘áƒ˜, áƒ–áƒ¦áƒ•áƒ˜áƒ¡ áƒžáƒ áƒáƒ“áƒ£áƒ¥áƒ¢áƒ”áƒ‘áƒ˜, áƒ¬áƒ•áƒœáƒ˜áƒáƒœáƒ”áƒ‘áƒ˜ áƒáƒœ áƒ“áƒ”áƒ¡áƒ”áƒ áƒ¢áƒ˜)?'
    )
) as d(sort_order, icon, label, query_text)
where not exists (
  select 1
  from public.restaurant_ai_prompts p
  where p.restaurant_id = r.id
);


-- ===== supabase/migrations/20261026_restaurant_ai_prompts_select.sql =====

-- Guest and admin can read Chef Assistant chips for the active restaurant.

drop policy if exists restaurant_ai_prompts_select_public on public.restaurant_ai_prompts;
create policy restaurant_ai_prompts_select_public
  on public.restaurant_ai_prompts
  for select
  to anon, authenticated
  using (true);


-- ===== supabase/migrations/20261027_restaurant_ai_usage.sql =====

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


-- ===== supabase/migrations/20261028_dish_prep_minutes.sql =====

alter table public.dishes
  add column if not exists prep_minutes integer;

alter table public.dishes
  drop constraint if exists dishes_prep_minutes_range;

alter table public.dishes
  add constraint dishes_prep_minutes_range
  check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 1440));

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261028_restaurant_ai_ops.sql =====

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


-- ===== supabase/migrations/20261029_ops_analytics.sql =====

-- Menu attention, kitchen ready time, waiter attribution, price history, weather.
-- guest_intent_events may be missing if the earlier analytics migration was never applied.

create table if not exists public.guest_intent_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  dish_id text not null default '',
  dish_name text not null default '',
  event_type text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint guest_intent_events_restaurant_id_fkey
    foreign key (restaurant_id)
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  constraint guest_intent_events_type_check
    check (event_type in ('view', 'cart_add', 'cart_remove')),
  constraint guest_intent_events_quantity_check
    check (quantity > 0)
);

create index if not exists guest_intent_events_restaurant_created_idx
  on public.guest_intent_events (restaurant_id, created_at desc);

create index if not exists guest_intent_events_restaurant_type_idx
  on public.guest_intent_events (restaurant_id, event_type);

alter table public.guest_intent_events enable row level security;

grant select, insert on table public.guest_intent_events to anon;
grant select, insert, update, delete on table public.guest_intent_events to authenticated;
grant all on table public.guest_intent_events to service_role;

alter table public.guest_intent_events
  add column if not exists session_id text not null default '',
  add column if not exists category_id text not null default '',
  add column if not exists duration_ms integer not null default 0;

alter table public.guest_intent_events
  drop constraint if exists guest_intent_events_type_check;

alter table public.guest_intent_events
  add constraint guest_intent_events_type_check
  check (
    event_type in (
      'view',
      'cart_add',
      'cart_remove',
      'session_start',
      'dish_dwell',
      'category_dwell'
    )
  );

alter table public.guest_intent_events
  drop constraint if exists guest_intent_events_duration_check;

alter table public.guest_intent_events
  add constraint guest_intent_events_duration_check
  check (duration_ms >= 0 and duration_ms <= 120000);

alter table public.waiter_calls
  add column if not exists acknowledged_by uuid,
  add column if not exists acknowledged_by_email text,
  add column if not exists ready_at timestamptz;

alter table public.categories
  add column if not exists station text not null default 'kitchen',
  add column if not exists menu_role text not null default 'food';

do $$
begin
  alter table public.categories
    add constraint categories_station_check
    check (station in ('kitchen', 'grill', 'cold', 'pastry', 'bar', 'other'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.categories
    add constraint categories_menu_role_check
    check (menu_role in ('food', 'drink', 'dessert', 'sauce', 'other'));
exception
  when duplicate_object then null;
end $$;

alter table public.restaurants
  add column if not exists latitude numeric(8, 5),
  add column if not exists longitude numeric(8, 5),
  add column if not exists customization_extra_minutes integer not null default 2;

do $$
begin
  alter table public.restaurants
    add constraint restaurants_latitude_check
    check (latitude is null or latitude between -90 and 90);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.restaurants
    add constraint restaurants_longitude_check
    check (longitude is null or longitude between -180 and 180);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.restaurants
    add constraint restaurants_customization_extra_minutes_check
    check (customization_extra_minutes between 0 and 30);
exception
  when duplicate_object then null;
end $$;

create table if not exists public.dish_price_changes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  dish_id uuid not null,
  dish_name text not null default '',
  old_price numeric(10, 2) not null,
  new_price numeric(10, 2) not null,
  changed_at timestamptz not null default now()
);

create index if not exists dish_price_changes_restaurant_changed_idx
  on public.dish_price_changes (restaurant_id, changed_at desc);

alter table public.dish_price_changes enable row level security;

create table if not exists public.restaurant_weather_days (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  day date not null,
  temperature_c numeric(5, 2),
  precipitation_mm numeric(6, 2) not null default 0,
  condition text not null default 'dry',
  primary key (restaurant_id, day),
  constraint restaurant_weather_days_condition_check
    check (condition in ('dry', 'rain'))
);

alter table public.restaurant_weather_days enable row level security;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261029_table_carts.sql =====

create table if not exists public.table_carts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  lines jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  waiter_call_id uuid,
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint table_carts_table_restaurant_fkey
    foreign key (table_id, restaurant_id)
    references public.tables (id, restaurant_id)
    on update cascade
    on delete cascade
);

create unique index if not exists table_carts_one_open_idx
  on public.table_carts (restaurant_id, table_id)
  where closed_at is null;

alter table public.table_carts enable row level security;

grant select, insert, update, delete on table public.table_carts
  to anon, authenticated, service_role;
grant all on table public.table_carts to service_role;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261030_dish_recipes.sql =====

-- Internal recipes and inventory. Not exposed on the guest menu.

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  unit text not null,
  cost_per_unit numeric(12, 4) not null default 0,
  stock_qty numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  constraint ingredients_name_check check (char_length(btrim(name)) > 0),
  constraint ingredients_unit_check check (unit in ('g', 'ml', 'pcs')),
  constraint ingredients_cost_check check (cost_per_unit >= 0)
);

create unique index if not exists ingredients_restaurant_name_unit_key
  on public.ingredients (restaurant_id, lower(btrim(name)), unit);

create index if not exists ingredients_restaurant_id_idx
  on public.ingredients (restaurant_id);

create table if not exists public.dish_recipes (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references public.dishes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity numeric(12, 3) not null,
  constraint dish_recipes_quantity_check check (quantity > 0),
  constraint dish_recipes_dish_ingredient_key unique (dish_id, ingredient_id)
);

create index if not exists dish_recipes_dish_id_idx
  on public.dish_recipes (dish_id);

create index if not exists dish_recipes_ingredient_id_idx
  on public.dish_recipes (ingredient_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  waiter_call_id uuid not null references public.waiter_calls (id) on delete cascade,
  dish_id uuid not null,
  batch integer not null default 1,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity numeric(14, 3) not null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_quantity_check check (quantity > 0),
  constraint inventory_movements_batch_check check (batch between 1 and 99),
  constraint inventory_movements_line_key
    unique (waiter_call_id, dish_id, batch, ingredient_id)
);

create index if not exists inventory_movements_restaurant_id_idx
  on public.inventory_movements (restaurant_id);

create index if not exists inventory_movements_call_id_idx
  on public.inventory_movements (waiter_call_id);

alter table public.ingredients enable row level security;
alter table public.ingredients force row level security;
alter table public.dish_recipes enable row level security;
alter table public.dish_recipes force row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_movements force row level security;

revoke all on table public.ingredients from public, anon;
revoke all on table public.dish_recipes from public, anon;
revoke all on table public.inventory_movements from public, anon;

grant select, insert, update, delete on table public.ingredients to authenticated;
grant select, insert, update, delete on table public.dish_recipes to authenticated;
grant select, insert, update, delete on table public.inventory_movements to authenticated;
grant all on table public.ingredients to service_role;
grant all on table public.dish_recipes to service_role;
grant all on table public.inventory_movements to service_role;

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.super_admins sa
      where lower(trim(sa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> ''
      and (
        exists (
          select 1
          from public.restaurants r
          where r.id = p_restaurant_id
            and lower(trim(coalesce(r.manager_email, ''))) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = p_restaurant_id
            and lower(trim(s.email)) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
    );
$$;

grant execute on function public.jwt_email() to anon, authenticated, service_role;
grant execute on function public.is_restaurant_member(uuid) to anon, authenticated, service_role;

drop policy if exists ingredients_member_all on public.ingredients;
create policy ingredients_member_all
  on public.ingredients
  for all
  to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

drop policy if exists dish_recipes_member_all on public.dish_recipes;
create policy dish_recipes_member_all
  on public.dish_recipes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_id
        and public.is_restaurant_member(i.restaurant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.ingredients i
      where i.id = ingredient_id
        and public.is_restaurant_member(i.restaurant_id)
    )
  );

drop policy if exists inventory_movements_member_all on public.inventory_movements;
create policy inventory_movements_member_all
  on public.inventory_movements
  for all
  to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261031_off_menu_requests.sql =====

-- Guest search/chat asks for dishes that are not on the menu.

create table if not exists public.off_menu_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid,
  session_id text not null default '',
  source text not null,
  query_raw text not null,
  query_key text not null,
  created_at timestamptz not null default now(),
  constraint off_menu_requests_source_check check (source in ('search', 'chat')),
  constraint off_menu_requests_raw_check check (char_length(btrim(query_raw)) >= 3),
  constraint off_menu_requests_key_check check (char_length(btrim(query_key)) >= 3)
);

create index if not exists off_menu_requests_restaurant_created_idx
  on public.off_menu_requests (restaurant_id, created_at desc);

create index if not exists off_menu_requests_restaurant_key_idx
  on public.off_menu_requests (restaurant_id, query_key, created_at desc);

alter table public.off_menu_requests enable row level security;
alter table public.off_menu_requests force row level security;

revoke all on table public.off_menu_requests from public, anon;
grant select on table public.off_menu_requests to authenticated;
grant all on table public.off_menu_requests to service_role;

create or replace function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.super_admins sa
      where lower(trim(sa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> ''
      and (
        exists (
          select 1
          from public.restaurants r
          where r.id = p_restaurant_id
            and lower(trim(coalesce(r.manager_email, ''))) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = p_restaurant_id
            and lower(trim(s.email)) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
    );
$$;

grant execute on function public.is_restaurant_member(uuid) to anon, authenticated, service_role;

drop policy if exists off_menu_requests_member_select on public.off_menu_requests;
create policy off_menu_requests_member_select
  on public.off_menu_requests
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261031_sold_dishes.sql =====

-- One row per sold dish line. Analytics reads this for consumption, not guest JSON.

create table if not exists public.sold_dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  waiter_call_id uuid not null references public.waiter_calls (id) on delete cascade,
  dish_id uuid not null,
  dish_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null default 0,
  batch integer not null default 1,
  sold_at timestamptz not null default now(),
  constraint sold_dishes_name_check check (char_length(btrim(dish_name)) > 0),
  constraint sold_dishes_quantity_check check (quantity > 0),
  constraint sold_dishes_price_check check (unit_price >= 0),
  constraint sold_dishes_batch_check check (batch between 1 and 99),
  constraint sold_dishes_line_key unique (waiter_call_id, dish_id, batch)
);

create index if not exists sold_dishes_restaurant_sold_at_idx
  on public.sold_dishes (restaurant_id, sold_at desc);

create index if not exists sold_dishes_dish_id_idx
  on public.sold_dishes (restaurant_id, dish_id);

do $$
begin
  if to_regclass('public.inventory_movements') is not null then
    create index if not exists inventory_movements_restaurant_created_at_idx
      on public.inventory_movements (restaurant_id, created_at desc);
  end if;
end $$;

alter table public.sold_dishes enable row level security;
alter table public.sold_dishes force row level security;

revoke all on table public.sold_dishes from public, anon;
grant select, insert, update, delete on table public.sold_dishes to authenticated;
grant all on table public.sold_dishes to service_role;

create or replace function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.super_admins sa
      where lower(trim(sa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> ''
      and (
        exists (
          select 1
          from public.restaurants r
          where r.id = p_restaurant_id
            and lower(trim(coalesce(r.manager_email, ''))) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = p_restaurant_id
            and lower(trim(s.email)) =
              lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
    );
$$;

grant execute on function public.is_restaurant_member(uuid) to anon, authenticated, service_role;

drop policy if exists sold_dishes_member_all on public.sold_dishes;
create policy sold_dishes_member_all
  on public.sold_dishes
  for all
  to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

insert into public.sold_dishes (
  restaurant_id,
  waiter_call_id,
  dish_id,
  dish_name,
  quantity,
  unit_price,
  batch,
  sold_at
)
select
  r.id,
  wc.id::text::uuid,
  (item->>'dish_id')::uuid,
  left(coalesce(nullif(btrim(item->>'name'), ''), 'dish'), 200),
  greatest(1, coalesce((item->>'quantity')::numeric, 1)),
  greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
  least(99, greatest(1, coalesce(nullif(item->>'batch', '')::integer, 1))),
  coalesce(wc.acknowledged_at, wc.created_at, now())
from public.waiter_calls wc
inner join public.restaurants r
  on r.id::text = wc.restaurant_id::text
cross join lateral jsonb_array_elements(coalesce(wc.items, '[]'::jsonb)) as item
where wc.status = 'acknowledged'
  and wc.id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (item->>'dish_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lower(btrim(item->>'dish_id')) not in ('service_fee', 'low_rating', 'rating')
  and coalesce((item->>'quantity')::numeric, 0) >= 1
on conflict (waiter_call_id, dish_id, batch) do nothing;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20261103_dish_pour_prices.sql =====

alter table public.dishes
  add column if not exists bottle_price numeric(10, 2);

alter table public.dishes
  add column if not exists glass_price numeric(10, 2);

alter table public.dishes
  drop constraint if exists dishes_bottle_price_check;

alter table public.dishes
  add constraint dishes_bottle_price_check
  check (bottle_price is null or bottle_price >= 0);

alter table public.dishes
  drop constraint if exists dishes_glass_price_check;

alter table public.dishes
  add constraint dishes_glass_price_check
  check (glass_price is null or glass_price >= 0);

comment on column public.dishes.bottle_price is
  'Bar/drink price by the bottle. Null for kitchen dishes.';

comment on column public.dishes.glass_price is
  'Bar/drink price by the glass. Null for kitchen dishes.';


-- ===== supabase/migrations/20261104_ai_usage_estimated_cost.sql =====

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


-- ===== supabase/migrations/20261105_ai_usage_reset.sql =====

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


-- ===== supabase/migrations/20261106_ai_usage_cached_tokens.sql =====

-- Optional cached-input token count for Gemini explicit context cache billing.

alter table public.restaurant_ai_usage
  add column if not exists cached_tokens integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_ai_usage_cached_tokens_check'
      and conrelid = 'public.restaurant_ai_usage'::regclass
  ) then
    alter table public.restaurant_ai_usage
      add constraint restaurant_ai_usage_cached_tokens_check
      check (cached_tokens >= 0);
  end if;
end $$;


-- ===== supabase/migrations/20261107_menu_translate_cache.sql =====

-- Shared EN/RU menu phrase translations so each unique string is translated once per restaurant.

create table if not exists public.menu_translate_cache (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  locale text not null check (locale in ('en', 'ru')),
  phrase_hash text not null,
  source_text text not null,
  translated_text text not null,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, locale, phrase_hash)
);

create index if not exists menu_translate_cache_restaurant_locale_idx
  on public.menu_translate_cache (restaurant_id, locale);

alter table public.menu_translate_cache enable row level security;

grant select, insert, update, delete on table public.menu_translate_cache
  to anon, authenticated, service_role;
grant all on table public.menu_translate_cache to service_role;


-- ===== safety grants (idempotent) =====
grant select, insert, update, delete on table
  public.waiter_calls,
  public.restaurant_staff,
  public.restaurant_ai_hosts,
  public.restaurant_ai_prompts,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to anon, authenticated, service_role;
grant all on table
  public.waiter_calls,
  public.restaurant_staff,
  public.restaurant_ai_hosts,
  public.restaurant_ai_prompts,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to service_role;
