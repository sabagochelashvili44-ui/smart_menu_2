alter table public.reviews
  add column if not exists table_id uuid;

alter table public.reviews
  add column if not exists table_number text;

notify pgrst, 'reload schema';
