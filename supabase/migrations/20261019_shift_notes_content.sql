-- Live shift_notes requires `content`; keep `body` in sync for older rows.

alter table public.shift_notes
  add column if not exists content text not null default '';

alter table public.shift_notes
  add column if not exists body text not null default '';

update public.shift_notes
set content = body
where (content is null or btrim(content) = '')
  and coalesce(body, '') <> '';

update public.shift_notes
set body = content
where (body is null or btrim(body) = '')
  and coalesce(content, '') <> '';

notify pgrst, 'reload schema';
