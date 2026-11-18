-- Production / DEV: seed owner rows from restaurants.manager_email.
-- Safe / idempotent. Run in Supabase → SQL Editor.
-- Also ensure Vercel has SUPABASE_SERVICE_ROLE_KEY = legacy service_role JWT
-- (or SUPABASE_ALLOW_SECRET_KEY=1 with sb_secret_…).

insert into public.restaurant_staff (restaurant_id, email, role)
select r.id, lower(trim(r.manager_email)), 'owner'
from public.restaurants r
where coalesce(nullif(trim(r.manager_email), ''), '') <> ''
  and not exists (
    select 1
    from public.restaurant_staff s
    where s.restaurant_id = r.id
      and lower(trim(s.email)) = lower(trim(r.manager_email))
  );
