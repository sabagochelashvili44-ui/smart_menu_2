-- Curated "serve with" companions from the live menu (dishes and drinks).
-- Used by admin menu editor, guest cross-sell, and chef chat pairing answers.

alter table public.dishes
  add column if not exists pairing_dish_ids uuid[] not null default '{}';

comment on column public.dishes.pairing_dish_ids is
  'Ordered list of companion dish/drink ids from the same restaurant menu. Guest UI and AI prefer these over algorithmic pairings.';
