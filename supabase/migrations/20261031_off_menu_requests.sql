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
