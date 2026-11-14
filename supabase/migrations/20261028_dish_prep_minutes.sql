alter table public.dishes
  add column if not exists prep_minutes integer;

alter table public.dishes
  drop constraint if exists dishes_prep_minutes_range;

alter table public.dishes
  add constraint dishes_prep_minutes_range
  check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 1440));

notify pgrst, 'reload schema';
