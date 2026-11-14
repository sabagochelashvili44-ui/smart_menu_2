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
