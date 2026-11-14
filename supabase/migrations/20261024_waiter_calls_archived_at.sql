-- Soft-hide kitchen history. Confirmed sales stay in Overview and Analytics.

alter table public.waiter_calls
  add column if not exists archived_at timestamptz;

create index if not exists waiter_calls_restaurant_active_idx
  on public.waiter_calls (restaurant_id, created_at desc)
  where archived_at is null;
