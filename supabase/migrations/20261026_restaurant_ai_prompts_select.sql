-- Guest and admin can read Chef Assistant chips for the active restaurant.

drop policy if exists restaurant_ai_prompts_select_public on public.restaurant_ai_prompts;
create policy restaurant_ai_prompts_select_public
  on public.restaurant_ai_prompts
  for select
  to anon, authenticated
  using (true);
