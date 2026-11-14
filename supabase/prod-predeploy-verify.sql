-- Run on PRODUCTION (bxvxredftkpdwmonvfgc) to see what is already present.
-- Does not modify data.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'restaurant_ai_hosts',
    'restaurant_ai_prompts',
    'restaurant_ai_usage',
    'table_carts',
    'menu_translate_cache',
    'ingredients',
    'dish_recipes',
    'inventory_movements',
    'sold_dishes',
    'off_menu_requests',
    'guest_intent_events',
    'dish_price_changes',
    'restaurant_weather_days'
  )
order by 1;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'dishes'
  and column_name in (
    'name_en','name_ru','description_en','description_ru',
    'calories','protein','carbs','fat','prep_minutes',
    'bottle_price','glass_price'
  )
order by 1;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'waiter_calls'
  and column_name in ('archived_at','ready_at','call_type','acknowledged_at')
order by 1;
