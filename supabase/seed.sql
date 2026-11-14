-- Seed: Georgian House (small demo, 5 dishes)
-- Paste into Supabase → SQL Editor → Run
-- Primary dish/category text is Georgian (KA); EN/RU live in *_en / *_ru columns.
-- The last SELECT returns the restaurant UUID for /menu/<uuid>/Table 1

delete from public.restaurants
where name = 'Georgian House';

with new_restaurant as (
  insert into public.restaurants (name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font)
  values (
    'Georgian House',
    'georgian-house',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    '#6d0808',
    '#757d6f',
    '#eeead7',
    'noto-sans-georgian'
  )
  returning id
),
new_tables as (
  insert into public.tables (restaurant_id, table_number)
  select
    new_restaurant.id,
    table_number
  from new_restaurant
  cross join (
    values
      ('Table 1'),
      ('Table 2')
  ) as t(table_number)
  returning id
),
new_categories as (
  insert into public.categories (restaurant_id, name, name_en, name_ru, order_index)
  select
    new_restaurant.id,
    c.name,
    c.name_en,
    c.name_ru,
    c.order_index
  from new_restaurant
  cross join (
    values
      ('ძირითადი კერძები', 'Main Dishes', 'Основные блюда', 0),
      ('სასმელები', 'Drinks', 'Напитки', 1),
      ('დესერტები', 'Desserts', 'Десерты', 2)
  ) as c(name, name_en, name_ru, order_index)
  returning id, name
),
new_dishes as (
  insert into public.dishes (
    restaurant_id,
    category_id,
    name,
    description,
    name_en,
    description_en,
    name_ru,
    description_ru,
    price,
    margin_score,
    image_url,
    allergens,
    is_available
  )
  select
    (select id from new_restaurant),
    c.id,
    d.name,
    d.description,
    d.name_en,
    d.description_en,
    d.name_ru,
    d.description_ru,
    d.price,
    d.margin_score,
    d.image_url,
    d.allergens,
    true
  from new_categories as c
  join (
    values
      (
        'ძირითადი კერძები',
        'აჭარული ხაჭაპური',
        'ნავისებრი აჭარული ხაჭაპური სულგუნით, კვერცხით და კარაქით.',
        'Adjarian Khachapuri',
        'Boat-shaped oven bread filled with molten sulguni and imeruli cheese, finished with a farm egg and a pat of butter at the table.',
        'Аджарский хачапури',
        'Хачапури-лодка с сулугуни, яйцом и маслом.',
        18.50,
        8,
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
        array['gluten', 'dairy', 'eggs']::text[]
      ),
      (
        'ძირითადი კერძები',
        'ხინკალი',
        'ხელით შეკრული ხინკალი სანელებლებიანი ხორცით. თავი გადაახვიეთ, ბულიონი გადაავლეთ და შემდეგ მიირთვით.',
        'Khinkali',
        'Hand-pleated soup dumplings stuffed with spiced beef and pork. Twist off the top, sip the broth, then eat the rest.',
        'Хинкали',
        'Хинкали с пряным мясом — откусите хвостик, выпейте бульон и съешьте.',
        16.00,
        7,
        'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=1200&q=80',
        array['gluten']::text[]
      ),
      (
        'სასმელები',
        'საფერავი',
        'მშრალი ქართული საფერავი — მუქი ალუბალი, სანელებლები და მსუბუქი კვამლი. კახეთი.',
        'Saperavi Red Wine',
        'A generous glass of dry Georgian saperavi — dark cherry, spice, and a little smoke. Grown in Kakheti.',
        'Саперави',
        'Сухой грузинский саперави — тёмная вишня, специи и лёгкий дымок.',
        11.00,
        10,
        'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80',
        array['sulfites']::text[]
      ),
      (
        'სასმელები',
        'ტარხუნა',
        'გაზირებული ტარხუნას ლიმონათი — ნათელი და არომატული. სახლის ულკოჰოლო სასმელი.',
        'Tarkhuna Lemonade',
        'Sparkling tarragon soda, bright and herbal. The house non-alcoholic pour.',
        'Тархун',
        'Газированный тархун — яркий и травянистый.',
        5.50,
        11,
        'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
        array[]::text[]
      ),
      (
        'დესერტები',
        'თაფლის ნამცხვარი კაკლით',
        'ფენებიანი ქართული თაფლის ნამცხვარი არაჟნის კრემით და მოხალული კაკლით.',
        'Honey Walnut Cake',
        'Layered Georgian honey cake with sour-cream frosting and toasted walnuts.',
        'Медовый торт с грецким орехом',
        'Слоёный медовый торт со сметанным кремом и грецким орехом.',
        9.00,
        9,
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80',
        array['gluten', 'dairy', 'eggs', 'nuts']::text[]
      )
  ) as d(
    category_name,
    name,
    description,
    name_en,
    description_en,
    name_ru,
    description_ru,
    price,
    margin_score,
    image_url,
    allergens
  )
    on c.name = d.category_name
  returning id
)
select
  new_restaurant.id as restaurant_id,
  'Open /menu/' || new_restaurant.id || '/Table 1' as qr_menu_table_1,
  'Open /menu/' || new_restaurant.id || '/Table 2' as qr_menu_table_2
from new_restaurant;
