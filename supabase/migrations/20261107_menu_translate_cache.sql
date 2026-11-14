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
