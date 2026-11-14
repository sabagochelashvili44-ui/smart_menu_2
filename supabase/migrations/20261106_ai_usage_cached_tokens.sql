-- Optional cached-input token count for Gemini explicit context cache billing.

alter table public.restaurant_ai_usage
  add column if not exists cached_tokens integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_ai_usage_cached_tokens_check'
      and conrelid = 'public.restaurant_ai_usage'::regclass
  ) then
    alter table public.restaurant_ai_usage
      add constraint restaurant_ai_usage_cached_tokens_check
      check (cached_tokens >= 0);
  end if;
end $$;
