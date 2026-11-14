
-- ===== 20260915220000_orders_items_realtime.sql =====

-- Line items on tickets + Realtime for the kitchen display

alter table public.orders
  add column if not exists items jsonb not null default '[]'::jsonb;

alter table public.orders replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then
    null;
end;
$$;


-- ===== 20260917120000_waiter_calls.sql =====

-- Waiter-call alerts (not kitchen order tickets)

create table if not exists public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  table_number text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint waiter_calls_restaurant_id_fkey
    foreign key (restaurant_id)
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  constraint waiter_calls_table_restaurant_fkey
    foreign key (table_id, restaurant_id)
    references public.tables (id, restaurant_id)
    on update cascade
    on delete cascade,
  constraint waiter_calls_status_check
    check (status in ('open', 'acknowledged'))
);

create index if not exists waiter_calls_restaurant_created_idx
  on public.waiter_calls (restaurant_id, created_at desc);

create index if not exists waiter_calls_open_idx
  on public.waiter_calls (restaurant_id, status)
  where status = 'open';

alter table public.waiter_calls enable row level security;
alter table public.waiter_calls replica identity full;

grant select, insert, update, delete on table public.waiter_calls
  to anon, authenticated, service_role;
grant all on table public.waiter_calls to service_role;

drop policy if exists waiter_calls_select_authenticated on public.waiter_calls;
create policy waiter_calls_select_authenticated
  on public.waiter_calls
  for select
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.waiter_calls;
exception
  when duplicate_object then
    null;
end;
$$;


-- ===== 20260928120000_analytics_engine.sql =====

-- Wait-time for kitchen calls + guest intent (views / cart) â€” never counted as revenue.

alter table public.waiter_calls
  add column if not exists acknowledged_at timestamptz;

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

drop policy if exists guest_intent_events_insert_anon on public.guest_intent_events;
create policy guest_intent_events_insert_anon
  on public.guest_intent_events
  for insert
  to anon
  with check (true);

drop policy if exists guest_intent_events_select_authenticated on public.guest_intent_events;
create policy guest_intent_events_select_authenticated
  on public.guest_intent_events
  for select
  to authenticated
  using (true);


-- ===== 20260928180000_restaurant_branding.sql =====

-- Multi-tenant restaurant branding + dishes.restaurant_id
-- Paste into Supabase â†’ SQL Editor if not using CLI migrations.

alter table public.restaurants
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists bg_color text,
  add column if not exists font text;

update public.restaurants
set
  logo_url = coalesce(nullif(logo_url, ''), logo),
  primary_color = coalesce(nullif(primary_color, ''), '#6d0808'),
  secondary_color = coalesce(nullif(secondary_color, ''), '#757d6f'),
  bg_color = coalesce(nullif(bg_color, ''), '#eeead7'),
  font = coalesce(nullif(font, ''), 'noto-sans-georgian')
where true;

update public.restaurants
set slug = 'georgian-house'
where name = 'Georgian House'
  and (slug is null or btrim(slug) = '');

update public.restaurants
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null or btrim(slug) = '';

create unique index if not exists restaurants_slug_key
  on public.restaurants (slug)
  where slug is not null and btrim(slug) <> '';

-- categories, orders, waiter_calls already reference restaurants(id).
-- dishes previously joined only through categories; add a direct FK.

alter table public.dishes
  add column if not exists restaurant_id uuid;

update public.dishes d
set restaurant_id = c.restaurant_id
from public.categories c
where d.category_id = c.id
  and d.restaurant_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dishes_restaurant_id_fkey'
  ) then
    alter table public.dishes
      add constraint dishes_restaurant_id_fkey
      foreign key (restaurant_id)
      references public.restaurants (id)
      on update cascade
      on delete cascade;
  end if;
end $$;

create index if not exists dishes_restaurant_id_idx
  on public.dishes (restaurant_id);

do $$
declare
  v_bucket constant text := 'branding';
  v_auth constant text := 'authenticated';
begin
  insert into storage.buckets (id, name, public)
  values (v_bucket, v_bucket, true)
  on conflict (id) do update set public = true;

  execute format('drop policy if exists branding_public_read on storage.objects');
  execute format(
    'create policy branding_public_read on storage.objects for select using (bucket_id = %L)',
    v_bucket
  );

  execute format('drop policy if exists branding_auth_insert on storage.objects');
  execute format(
    'create policy branding_auth_insert on storage.objects for insert to %I with check (bucket_id = %L)',
    v_auth,
    v_bucket
  );

  execute format('drop policy if exists branding_auth_update on storage.objects');
  execute format(
    'create policy branding_auth_update on storage.objects for update to %I using (bucket_id = %L) with check (bucket_id = %L)',
    v_auth,
    v_bucket,
    v_bucket
  );
end $$;


-- ===== 20260928210000_super_admin.sql =====

-- Super-admin SaaS fields + RLS
-- See supabase/super-admin-setup.sql for SQL Editor usage.

alter table public.restaurants
  add column if not exists subscription_status text,
  add column if not exists subscription_fee numeric(10, 2),
  add column if not exists valid_until timestamptz,
  add column if not exists manager_email text;

update public.restaurants
set
  subscription_status = coalesce(nullif(subscription_status, ''), 'active'),
  subscription_fee = coalesce(subscription_fee, 0),
  valid_until = coalesce(valid_until, now() + interval '1 year')
where true;

alter table public.restaurants
  alter column subscription_status set default 'trial',
  alter column subscription_fee set default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_subscription_status_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_subscription_status_check
      check (subscription_status in ('active', 'trial', 'suspended'));
  end if;
end $$;

create table if not exists public.super_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;
alter table public.super_admins force row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or exists (
      select 1
      from public.super_admins sa
      where lower(sa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

grant execute on function public.is_super_admin() to anon, authenticated, service_role;

drop policy if exists super_admins_select_self on public.super_admins;
create policy super_admins_select_self
  on public.super_admins for select to authenticated
  using (public.is_super_admin());

drop policy if exists super_admins_write_self on public.super_admins;
create policy super_admins_write_self
  on public.super_admins for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists restaurants_insert_super_admin on public.restaurants;
create policy restaurants_insert_super_admin
  on public.restaurants for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists restaurants_update_super_admin on public.restaurants;
create policy restaurants_update_super_admin
  on public.restaurants for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists restaurants_delete_super_admin on public.restaurants;
create policy restaurants_delete_super_admin
  on public.restaurants for delete to authenticated
  using (public.is_super_admin());

drop policy if exists categories_write_super_admin on public.categories;
create policy categories_write_super_admin
  on public.categories for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists dishes_write_super_admin on public.dishes;
create policy dishes_write_super_admin
  on public.dishes for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists tables_write_super_admin on public.tables;
create policy tables_write_super_admin
  on public.tables for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists orders_write_super_admin on public.orders;
create policy orders_write_super_admin
  on public.orders for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists waiter_calls_write_super_admin on public.waiter_calls;
create policy waiter_calls_write_super_admin
  on public.waiter_calls for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete on table public.super_admins to authenticated;
grant all on table public.super_admins to service_role;


-- ===== 20260928220000_manager_email_tenant.sql =====

-- Manager-email tenant lookup + authenticated SELECT of own restaurant.

create index if not exists restaurants_manager_email_lower_idx
  on public.restaurants (lower(trim(manager_email)));

create or replace function public.restaurants_for_manager_email(p_email text)
returns setof public.restaurants
language sql
stable
security invoker
set search_path = public
as $$
  select r.*
  from public.restaurants r
  where lower(trim(coalesce(r.manager_email, ''))) = lower(trim(coalesce(p_email, '')))
    and lower(trim(coalesce(p_email, ''))) <> ''
  order by r.created_at asc;
$$;

grant execute on function public.restaurants_for_manager_email(text)
  to anon, authenticated, service_role;

drop policy if exists restaurants_select_authenticated on public.restaurants;
drop policy if exists restaurants_select_own_manager on public.restaurants;

create policy restaurants_select_own_manager
  on public.restaurants
  for select
  to authenticated
  using (
    lower(trim(coalesce(manager_email, '')))
      = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    or public.is_super_admin()
  );


-- ===== 20260929200000_super_admin_network_select.sql =====

-- Super-admin SELECT across the full network (no restaurant_id tenant filter).

drop policy if exists restaurants_select_super_admin on public.restaurants;
create policy restaurants_select_super_admin
  on public.restaurants
  for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists waiter_calls_select_super_admin on public.waiter_calls;
create policy waiter_calls_select_super_admin
  on public.waiter_calls
  for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists orders_select_super_admin on public.orders;
create policy orders_select_super_admin
  on public.orders
  for select
  to authenticated
  using (public.is_super_admin());


-- ===== 20261007120000_menu_images_bucket.sql =====

-- Public bucket for dish photos. Path: {restaurant_id}/{timestamp}-{filename}

do $$
declare
  v_bucket constant text := 'menu-images';
  v_auth constant text := 'authenticated';
begin
  insert into storage.buckets (id, name, public)
  values (v_bucket, v_bucket, true)
  on conflict (id) do update set public = true;

  execute format('drop policy if exists menu_images_public_read on storage.objects');
  execute format(
    'create policy menu_images_public_read on storage.objects for select using (bucket_id = %L)',
    v_bucket
  );

  execute format('drop policy if exists menu_images_auth_insert on storage.objects');
  execute format(
    'create policy menu_images_auth_insert on storage.objects for insert to %I with check (bucket_id = %L)',
    v_auth,
    v_bucket
  );

  execute format('drop policy if exists menu_images_auth_update on storage.objects');
  execute format(
    'create policy menu_images_auth_update on storage.objects for update to %I using (bucket_id = %L) with check (bucket_id = %L)',
    v_auth,
    v_bucket,
    v_bucket
  );
end $$;


-- ===== 20261007140000_restaurant_staff.sql =====

-- Per-tenant staff roles: owner, manager, waiter.

create table if not exists public.restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  email text not null,
  role text not null default 'waiter',
  created_at timestamptz not null default now(),
  constraint restaurant_staff_role_check
    check (role in ('owner', 'manager', 'waiter')),
  constraint restaurant_staff_email_check
    check (char_length(btrim(email)) > 2)
);

create unique index if not exists restaurant_staff_restaurant_email_key
  on public.restaurant_staff (restaurant_id, lower(trim(email)));

create index if not exists restaurant_staff_email_idx
  on public.restaurant_staff (lower(trim(email)));

alter table public.restaurant_staff enable row level security;
alter table public.restaurant_staff force row level security;

grant select, insert, update, delete on table public.restaurant_staff
  to anon, authenticated, service_role;
grant all on table public.restaurant_staff to service_role;

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_restaurant_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.jwt_email() <> ''
      and (
        exists (
          select 1
          from public.restaurants r
          where r.id = p_restaurant_id
            and lower(trim(coalesce(r.manager_email, ''))) = public.jwt_email()
        )
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = p_restaurant_id
            and s.role = 'owner'
            and lower(trim(s.email)) = public.jwt_email()
        )
      )
    );
$$;

grant execute on function public.jwt_email() to anon, authenticated, service_role;
grant execute on function public.is_restaurant_owner(uuid) to anon, authenticated, service_role;

drop policy if exists restaurant_staff_select on public.restaurant_staff;
create policy restaurant_staff_select
  on public.restaurant_staff
  for select
  to authenticated
  using (
    public.is_super_admin()
    or lower(trim(email)) = public.jwt_email()
    or public.is_restaurant_owner(restaurant_id)
  );

drop policy if exists restaurant_staff_insert on public.restaurant_staff;
create policy restaurant_staff_insert
  on public.restaurant_staff
  for insert
  to authenticated
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists restaurant_staff_update on public.restaurant_staff;
create policy restaurant_staff_update
  on public.restaurant_staff
  for update
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists restaurant_staff_delete on public.restaurant_staff;
create policy restaurant_staff_delete
  on public.restaurant_staff
  for delete
  to authenticated
  using (public.is_restaurant_owner(restaurant_id));

drop policy if exists restaurants_select_own_manager on public.restaurants;
create policy restaurants_select_own_manager
  on public.restaurants
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.jwt_email() <> ''
      and (
        lower(trim(coalesce(manager_email, ''))) = public.jwt_email()
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = restaurants.id
            and lower(trim(s.email)) = public.jwt_email()
        )
      )
    )
  );


-- ===== 20261007160000_waiter_call_type.sql =====

-- Guest table requests: waiter, clean table, bill by card, bill by cash.

do $$
declare
  v_call_waiter constant text := 'call_waiter';
  v_clean_table constant text := 'clean_table';
  v_bill_card constant text := 'bill_card';
  v_bill_cash constant text := 'bill_cash';
begin
  alter table public.waiter_calls
    add column if not exists call_type text not null default 'call_waiter';

  update public.waiter_calls
    set call_type = v_call_waiter
    where call_type is null or btrim(call_type) = '';

  alter table public.waiter_calls
    drop constraint if exists waiter_calls_call_type_check;

  execute format(
    'alter table public.waiter_calls add constraint waiter_calls_call_type_check check (call_type in (%L, %L, %L, %L))',
    v_call_waiter,
    v_clean_table,
    v_bill_card,
    v_bill_cash
  );
end $$;


-- ===== 20261007170000_waiter_call_type_reload.sql =====

-- Ensure call_type exists and refresh PostgREST schema cache.

alter table public.waiter_calls
  add column if not exists call_type text not null default 'call_waiter';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'waiter_calls_call_type_check'
  ) then
    alter table public.waiter_calls
      add constraint waiter_calls_call_type_check
      check (
        call_type in (
          'call_waiter',
          'clean_table',
          'bill_card',
          'bill_cash'
        )
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';


-- ===== 20261007180000_restaurants_for_login_email.sql =====

-- Staff-first restaurant lookup for a login email (then manager_email).

create or replace function public.restaurants_for_login_email(p_email text)
returns setof public.restaurants
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.restaurants r
  where lower(trim(coalesce(p_email, ''))) <> ''
    and (
      exists (
        select 1
        from public.restaurant_staff s
        where s.restaurant_id = r.id
          and lower(trim(s.email)) = lower(trim(p_email))
      )
      or lower(trim(coalesce(r.manager_email, ''))) = lower(trim(p_email))
    )
  order by
    case
      when exists (
        select 1
        from public.restaurant_staff s
        where s.restaurant_id = r.id
          and lower(trim(s.email)) = lower(trim(p_email))
      ) then 0
      else 1
    end,
    r.created_at asc;
$$;

grant execute on function public.restaurants_for_login_email(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- ===== 20261007190000_shift_notes.sql =====

-- Shift bulletin board notes, visible to all restaurant staff.

create or replace function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.jwt_email() <> ''
      and (
        exists (
          select 1
          from public.restaurants r
          where r.id = p_restaurant_id
            and lower(trim(coalesce(r.manager_email, ''))) = public.jwt_email()
        )
        or exists (
          select 1
          from public.restaurant_staff s
          where s.restaurant_id = p_restaurant_id
            and lower(trim(s.email)) = public.jwt_email()
        )
      )
    );
$$;

create or replace function public.is_restaurant_manager_or_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_restaurant_owner(p_restaurant_id)
    or (
      public.jwt_email() <> ''
      and exists (
        select 1
        from public.restaurant_staff s
        where s.restaurant_id = p_restaurant_id
          and lower(trim(s.email)) = public.jwt_email()
          and s.role in ('owner', 'manager')
      )
    );
$$;

grant execute on function public.is_restaurant_member(uuid)
  to anon, authenticated, service_role;
grant execute on function public.is_restaurant_manager_or_owner(uuid)
  to anon, authenticated, service_role;

create table if not exists public.shift_notes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  title text not null default '',
  body text not null default '',
  author_email text not null default '',
  author_role text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint shift_notes_body_check
    check (char_length(btrim(body)) > 0)
);

create index if not exists shift_notes_restaurant_created_idx
  on public.shift_notes (restaurant_id, created_at desc);

alter table public.shift_notes enable row level security;
alter table public.shift_notes replica identity full;

drop policy if exists shift_notes_select_members on public.shift_notes;
create policy shift_notes_select_members
  on public.shift_notes
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

drop policy if exists shift_notes_insert_managers on public.shift_notes;
create policy shift_notes_insert_managers
  on public.shift_notes
  for insert
  to authenticated
  with check (public.is_restaurant_manager_or_owner(restaurant_id));

drop policy if exists shift_notes_update_managers on public.shift_notes;
create policy shift_notes_update_managers
  on public.shift_notes
  for update
  to authenticated
  using (public.is_restaurant_manager_or_owner(restaurant_id))
  with check (public.is_restaurant_manager_or_owner(restaurant_id));

drop policy if exists shift_notes_delete_managers on public.shift_notes;
create policy shift_notes_delete_managers
  on public.shift_notes
  for delete
  to authenticated
  using (public.is_restaurant_manager_or_owner(restaurant_id));

do $$
begin
  alter publication supabase_realtime add table public.shift_notes;
exception
  when duplicate_object then
    null;
end;
$$;

notify pgrst, 'reload schema';


-- ===== 20261008200000_dish_ingredients.sql =====

alter table public.dishes
  add column if not exists ingredients text[] not null default '{}';

create index if not exists dishes_ingredients_gin_idx
  on public.dishes using gin (ingredients);


-- ===== 20261008210000_dishes_storage_bucket.sql =====

-- Public bucket for dish photos. Path: {restaurant_id}/{timestamp}-{filename}

do $$
declare
  v_bucket constant text := 'dishes';
  v_auth constant text := 'authenticated';
  v_service constant text := 'service_role';
begin
  insert into storage.buckets (id, name, public)
  values (v_bucket, v_bucket, true)
  on conflict (id) do update set public = true;

  execute format('drop policy if exists dishes_images_public_read on storage.objects');
  execute format(
    'create policy dishes_images_public_read on storage.objects for select using (bucket_id = %L)',
    v_bucket
  );

  execute format('drop policy if exists dishes_images_auth_insert on storage.objects');
  execute format(
    'create policy dishes_images_auth_insert on storage.objects for insert to %I with check (bucket_id = %L)',
    v_auth,
    v_bucket
  );

  execute format('drop policy if exists dishes_images_auth_update on storage.objects');
  execute format(
    'create policy dishes_images_auth_update on storage.objects for update to %I using (bucket_id = %L) with check (bucket_id = %L)',
    v_auth,
    v_bucket,
    v_bucket
  );

  execute format('drop policy if exists dishes_images_service_all on storage.objects');
  execute format(
    'create policy dishes_images_service_all on storage.objects for all to %I using (bucket_id = %L) with check (bucket_id = %L)',
    v_service,
    v_bucket,
    v_bucket
  );
end $$;


-- ===== 20261011_add_google_review_url.sql =====

alter table public.restaurants
  add column if not exists google_review_url text;

alter table public.waiter_calls
  drop constraint if exists waiter_calls_call_type_check;

alter table public.waiter_calls
  add constraint waiter_calls_call_type_check
  check (
    call_type in (
      'call_waiter',
      'clean_table',
      'bill_card',
      'bill_cash',
      'low_rating'
    )
  );

notify pgrst, 'reload schema';


-- ===== 20261018_service_fee_and_google_maps.sql =====

alter table public.restaurants
  add column if not exists service_fee_percent numeric(5, 2) not null default 0;

alter table public.restaurants
  add column if not exists google_maps_review_url text;

update public.restaurants
set google_maps_review_url = google_review_url
where google_maps_review_url is null
  and google_review_url is not null
  and google_review_url <> '';

notify pgrst, 'reload schema';


-- ===== 20261019_dish_nutrition_macros.sql =====

alter table public.dishes
  add column if not exists calories numeric;

alter table public.dishes
  add column if not exists protein numeric;

alter table public.dishes
  add column if not exists carbs numeric;

alter table public.dishes
  add column if not exists fat numeric;

notify pgrst, 'reload schema';


-- ===== 20261019_reviews_table_columns.sql =====

alter table public.reviews
  add column if not exists table_id uuid;

alter table public.reviews
  add column if not exists table_number text;

notify pgrst, 'reload schema';


-- ===== 20261019_shift_notes_author_columns.sql =====

-- Older shift_notes tables may exist without author columns because
-- `create table if not exists` does not add missing fields later.

alter table public.shift_notes
  add column if not exists author_email text not null default '';

alter table public.shift_notes
  add column if not exists author_role text;

notify pgrst, 'reload schema';


-- ===== 20261019_shift_notes_content.sql =====

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


-- ===== 20261024_waiter_calls_archived_at.sql =====

-- Soft-hide kitchen history. Confirmed sales stay in Overview and Analytics.

alter table public.waiter_calls
  add column if not exists archived_at timestamptz;

create index if not exists waiter_calls_restaurant_active_idx
  on public.waiter_calls (restaurant_id, created_at desc)
  where archived_at is null;


-- ===== 20261026_hours_and_dish_i18n.sql =====

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


-- ===== 20261026_restaurant_ai_hosts.sql =====

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


-- ===== 20261026_restaurant_ai_prompts.sql =====

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


-- ===== 20261026_restaurant_ai_prompts_select.sql =====

-- Guest and admin can read Chef Assistant chips for the active restaurant.

drop policy if exists restaurant_ai_prompts_select_public on public.restaurant_ai_prompts;
create policy restaurant_ai_prompts_select_public
  on public.restaurant_ai_prompts
  for select
  to anon, authenticated
  using (true);


-- ===== 20261027_restaurant_ai_usage.sql =====

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


-- ===== 20261028_dish_prep_minutes.sql =====

alter table public.dishes
  add column if not exists prep_minutes integer;

alter table public.dishes
  drop constraint if exists dishes_prep_minutes_range;

alter table public.dishes
  add constraint dishes_prep_minutes_range
  check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 1440));

notify pgrst, 'reload schema';


-- ===== 20261028_restaurant_ai_ops.sql =====

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


-- ===== 20261029_ops_analytics.sql =====

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


-- ===== 20261029_table_carts.sql =====

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


-- ===== 20261030_dish_recipes.sql =====

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


-- ===== 20261031_off_menu_requests.sql =====

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


-- ===== 20261031_sold_dishes.sql =====

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


-- ===== 20261103_dish_pour_prices.sql =====

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


-- ===== 20261104_ai_usage_estimated_cost.sql =====

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


-- ===== 20261105_ai_usage_reset.sql =====

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


-- ===== 20261106_ai_usage_cached_tokens.sql =====

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


-- ===== 20261107_menu_translate_cache.sql =====

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

