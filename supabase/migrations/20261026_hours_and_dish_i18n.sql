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
