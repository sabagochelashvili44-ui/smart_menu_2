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
