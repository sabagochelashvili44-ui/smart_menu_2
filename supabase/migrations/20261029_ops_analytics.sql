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
