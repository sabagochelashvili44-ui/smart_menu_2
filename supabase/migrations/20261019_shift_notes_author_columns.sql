-- Older shift_notes tables may exist without author columns because
-- `create table if not exists` does not add missing fields later.

alter table public.shift_notes
  add column if not exists author_email text not null default '';

alter table public.shift_notes
  add column if not exists author_role text;

notify pgrst, 'reload schema';
