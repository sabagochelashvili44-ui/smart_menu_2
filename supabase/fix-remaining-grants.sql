-- Remaining DEV grants (AI hosts/prompts already OK on daohgs).
-- Run once in Supabase → SQL Editor on project daohgsdxgxxqespcglma.

grant select, insert, update, delete on table
  public.waiter_calls,
  public.restaurant_staff,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to anon, authenticated, service_role;

grant all on table
  public.waiter_calls,
  public.restaurant_staff,
  public.shift_notes,
  public.table_carts,
  public.menu_translate_cache
to service_role;

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
