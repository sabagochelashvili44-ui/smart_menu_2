-- Dev/prod safety: later migrations often enable RLS without GRANTs.
-- Run in Supabase → SQL Editor on the DEV project (daohgs…).

grant select, insert, update, delete on table
  public.waiter_calls,
  public.restaurant_staff,
  public.restaurant_ai_hosts,
  public.restaurant_ai_prompts,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to anon, authenticated, service_role;

-- Tables that already grant in some migrations — safe to re-run.
grant select, insert, update, delete on table
  public.sold_dishes,
  public.ingredients,
  public.dish_recipes,
  public.inventory_movements,
  public.off_menu_requests,
  public.guest_intent_events,
  public.restaurant_ai_usage,
  public.super_admins
to authenticated, service_role;

grant select, insert on table public.guest_intent_events to anon;
grant all on table
  public.sold_dishes,
  public.ingredients,
  public.dish_recipes,
  public.inventory_movements,
  public.off_menu_requests,
  public.guest_intent_events,
  public.restaurant_ai_usage,
  public.super_admins,
  public.waiter_calls,
  public.restaurant_staff,
  public.restaurant_ai_hosts,
  public.restaurant_ai_prompts,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to service_role;

-- Ensure every restaurant has a host row (safe if already present).
insert into public.restaurant_ai_hosts (restaurant_id)
select id from public.restaurants
on conflict (restaurant_id) do nothing;

-- Owner row for local staff login (safe if already present).
insert into public.restaurant_staff (restaurant_id, email, role)
select r.id, lower(trim(r.manager_email)), 'owner'
from public.restaurants r
where coalesce(nullif(trim(r.manager_email), ''), '') <> ''
  and not exists (
    select 1
    from public.restaurant_staff s
    where s.restaurant_id = r.id
      and lower(trim(s.email)) = lower(trim(r.manager_email))
  );
