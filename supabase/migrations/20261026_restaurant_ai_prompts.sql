-- Per-restaurant Chef Assistant quick-prompt chips.

create table if not exists public.restaurant_ai_prompts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants (id)
    on update cascade
    on delete cascade,
  label text not null,
  query_text text not null,
  icon text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_ai_prompts_label_check
    check (char_length(btrim(label)) between 1 and 80),
  constraint restaurant_ai_prompts_query_check
    check (char_length(btrim(query_text)) between 1 and 500),
  constraint restaurant_ai_prompts_icon_check
    check (char_length(icon) <= 16)
);

create index if not exists restaurant_ai_prompts_restaurant_sort_idx
  on public.restaurant_ai_prompts (restaurant_id, sort_order, created_at);

alter table public.restaurant_ai_prompts enable row level security;

grant select, insert, update, delete on table public.restaurant_ai_prompts
to anon, authenticated, service_role;

drop policy if exists restaurant_ai_prompts_select_public on public.restaurant_ai_prompts;
create policy restaurant_ai_prompts_select_public
  on public.restaurant_ai_prompts
  for select
  to anon, authenticated
  using (true);

insert into public.restaurant_ai_prompts (
  restaurant_id, icon, label, query_text, is_active, sort_order
)
select
  r.id,
  d.icon,
  d.label,
  d.query_text,
  true,
  d.sort_order
from public.restaurants r
cross join (
  values
    (
      0,
      '🍷',
      'რა ღვინო შევუხამო კერძებს?',
      'რა ღვინო ან სასმელი შევუხამო ამ მენიუს ძირითად კერძებს? მხოლოდ ის, რაც ამ მენიუშია.'
    ),
    (
      1,
      '🌱',
      'მირჩიე სამარხვო/ვეგეტარიანული',
      'მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.'
    ),
    (
      2,
      '🌶️',
      'რა არის ყველაზე პოპულარული?',
      'რა არის დღეს ყველაზე პოპულარული კერძები მენიუში?'
    ),
    (
      3,
      '⚡',
      'სწრაფი ლანჩი',
      'მირჩიეთ სწრაფი ლანჩი — კერძი, რომელიც სწრაფად მზადდება და ნოყიერია.'
    ),
    (
      4,
      '🔥',
      'ტოპ 3 ბესტსელერი',
      'რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?'
    ),
    (
      5,
      '🍰',
      'საფირმო დესერტი',
      'მირჩიეთ საფირმო დესერტი ამ მენიუდან.'
    ),
    (
      6,
      '👶',
      'საბავშვო მენიუ',
      'რომელი კერძი გამოდგება ბავშვისთვის ამ მენიუდან — მსუბუქი და არაცხარე?'
    ),
    (
      7,
      '🍽️',
      'სხვა',
      'კიდევ რა განსხვავებულ კერძებს მირჩევდით ჩვენი მენიუს სხვა კატეგორიებიდან (მაგალითად, სალათები, ზღვის პროდუქტები, წვნიანები ან დესერტი)?'
    )
) as d(sort_order, icon, label, query_text)
where not exists (
  select 1
  from public.restaurant_ai_prompts p
  where p.restaurant_id = r.id
);
