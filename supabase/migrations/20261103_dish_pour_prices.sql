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
