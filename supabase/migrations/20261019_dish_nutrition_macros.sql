alter table public.dishes
  add column if not exists calories numeric;

alter table public.dishes
  add column if not exists protein numeric;

alter table public.dishes
  add column if not exists carbs numeric;

alter table public.dishes
  add column if not exists fat numeric;

notify pgrst, 'reload schema';
