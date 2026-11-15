-- Run on DEV and PRODUCTION (safe / idempotent).
alter table public.dishes
  add column if not exists pairing_dish_ids uuid[] not null default '{}';

comment on column public.dishes.pairing_dish_ids is
  'Ordered companion dish/drink ids from the same restaurant menu for guest upsell and AI pairing.';
