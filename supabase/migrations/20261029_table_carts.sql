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
