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
