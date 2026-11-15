import { parseNutritionInput, parsePrepMinutes } from "@/lib/dish-nutrition";
import { parseMoney } from "@/lib/menu-lane";
import { normalizeMenuTextList } from "@/lib/menu-list-normalize";
import { loadRestaurantAiPrompts } from "@/lib/restaurant-ai-prompts";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  isUuid,
  RESTAURANT_BRAND_SELECT,
  restaurantLogo,
  type RestaurantBrandFields,
} from "@/lib/restaurant-brand";
import type { SupabaseClient } from "@supabase/supabase-js";

type TableRow = {
  id: string;
  restaurant_id: string;
  table_number: string;
};

type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  order_index: number;
  name_en?: string | null;
  name_ru?: string | null;
};

type DishRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  bottle_price?: number | null;
  glass_price?: number | null;
  image_url: string | null;
  allergens: string[] | null;
  is_available: boolean;
  ingredients?: string[] | null;
  wine_pairing?: string | null;
  pairing_dish_ids?: string[] | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  prep_minutes?: number | null;
  name_en?: string | null;
  name_ru?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
};

export type GuestMenuRestaurant = RestaurantBrandFields & {
  logo: string | null;
};

const DISH_SELECT_FULL_BASE =
  "id, category_id, name, description, price, bottle_price, glass_price, image_url, allergens, is_available, ingredients, wine_pairing, pairing_dish_ids, calories, protein, carbs, fat, prep_minutes";
const DISH_SELECT_NUTRITION_BASE =
  "id, category_id, name, description, price, image_url, allergens, is_available, ingredients, pairing_dish_ids, calories, protein, carbs, fat";
const DISH_SELECT_NUTRITION_CORE_BASE =
  "id, category_id, name, description, price, image_url, allergens, is_available, calories, protein, carbs, fat";
const DISH_SELECT_MENU_BASE =
  "id, category_id, name, description, price, image_url, allergens, is_available, ingredients, wine_pairing, pairing_dish_ids";
const DISH_SELECT_CORE_BASE =
  "id, category_id, name, description, price, image_url, allergens, is_available";
const DISH_I18N = ", name_en, name_ru, description_en, description_ru";
const I18N_COLUMN_ERROR = /name_en|name_ru|description_en|description_ru/;
const PAIRING_COLUMN_ERROR = /pairing_dish_ids/;
const DISH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asTextList(value: unknown): string[] | null {
  return normalizeMenuTextList(value);
}

function asPairingIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = String(item ?? "").trim();
    if (!DISH_UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function mapGuestDish(row: Record<string, unknown>): DishRow {
  return {
    id: String(row.id),
    category_id: String(row.category_id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    bottle_price: parseMoney(row.bottle_price),
    glass_price: parseMoney(row.glass_price),
    image_url: row.image_url ? String(row.image_url) : null,
    allergens: asTextList(row.allergens),
    is_available: row.is_available !== false,
    ingredients: asTextList(row.ingredients),
    wine_pairing: row.wine_pairing ? String(row.wine_pairing) : null,
    pairing_dish_ids: asPairingIds(row.pairing_dish_ids),
    calories: parseNutritionInput(row.calories ?? row.kcal),
    protein: parseNutritionInput(row.protein ?? row.proteins),
    carbs: parseNutritionInput(row.carbs ?? row.carbohydrates),
    fat: parseNutritionInput(row.fat ?? row.fats),
    prep_minutes: parsePrepMinutes(row.prep_minutes),
    name_en: row.name_en ? String(row.name_en) : null,
    name_ru: row.name_ru ? String(row.name_ru) : null,
    description_en: row.description_en ? String(row.description_en) : null,
    description_ru: row.description_ru ? String(row.description_ru) : null,
  };
}

async function fetchRestaurant(slugOrId: string) {
  const supabase = createSupabaseAdminClient();
  const branded = supabase.from("restaurants").select(RESTAURANT_BRAND_SELECT);
  const legacy = supabase
    .from("restaurants")
    .select(
      "id, name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font",
    );

  if (isUuid(slugOrId)) {
    const { data, error } = await branded
      .eq("id", slugOrId)
      .maybeSingle<RestaurantBrandFields>();
    if (!error && data) return data;
    const fallback = await legacy
      .eq("id", slugOrId)
      .maybeSingle<RestaurantBrandFields>();
    if (!fallback.error && fallback.data) return fallback.data;
    const minimal = await supabase
      .from("restaurants")
      .select("id, name, logo")
      .eq("id", slugOrId)
      .maybeSingle<RestaurantBrandFields>();
    return minimal.data ?? null;
  }

  const slug = slugOrId.toLowerCase();
  const { data, error } = await branded
    .eq("slug", slug)
    .maybeSingle<RestaurantBrandFields>();
  if (!error && data) return data;
  const fallback = await legacy
    .eq("slug", slug)
    .maybeSingle<RestaurantBrandFields>();
  return fallback.data ?? null;
}

async function fetchRestaurantHours(
  row: RestaurantBrandFields | null,
): Promise<RestaurantBrandFields | null> {
  if (!row) return null;
  const supabase = createSupabaseAdminClient();
  const extra = await supabase
    .from("restaurants")
    .select("hours_enabled, hours_open, hours_close")
    .eq("id", row.id)
    .maybeSingle();
  if (extra.error || !extra.data) return row;
  return { ...row, ...extra.data };
}

async function selectDishes(
  supabase: SupabaseClient,
  select: string,
  restaurantId: string,
  categoryIds: string[],
) {
  const byRestaurant = await supabase
    .from("dishes")
    .select(select)
    .eq("restaurant_id", restaurantId)
    .returns<DishRow[]>();

  if (!byRestaurant.error) {
    const rows = byRestaurant.data ?? [];
    if (rows.length > 0 || categoryIds.length === 0) {
      return { data: rows, error: null };
    }
  }

  const restaurantIdMissing =
    byRestaurant.error && /restaurant_id/i.test(byRestaurant.error.message);
  if (byRestaurant.error && !restaurantIdMissing) {
    return byRestaurant;
  }

  if (categoryIds.length === 0) {
    return { data: [] as DishRow[], error: null };
  }

  return supabase
    .from("dishes")
    .select(select)
    .in("category_id", categoryIds)
    .returns<DishRow[]>();
}

function missingColumnError(
  error: { message?: string } | null | undefined,
  pattern: RegExp,
) {
  return pattern.test(error?.message ?? "");
}

async function fetchRestaurantDishes(
  supabase: SupabaseClient,
  restaurantId: string,
  categoryIds: string[],
) {
  const chain = [
    DISH_SELECT_FULL_BASE,
    DISH_SELECT_FULL_BASE.replace(", pairing_dish_ids", ""),
    DISH_SELECT_FULL_BASE.replace(", bottle_price, glass_price", ""),
    DISH_SELECT_FULL_BASE
      .replace(", bottle_price, glass_price", "")
      .replace(", pairing_dish_ids", ""),
    DISH_SELECT_NUTRITION_BASE,
    DISH_SELECT_NUTRITION_BASE.replace(", pairing_dish_ids", ""),
    DISH_SELECT_NUTRITION_CORE_BASE,
    DISH_SELECT_MENU_BASE,
    DISH_SELECT_MENU_BASE.replace(", pairing_dish_ids", ""),
    DISH_SELECT_CORE_BASE,
  ];
  const suffixes = [DISH_I18N, ""];

  let lastError: { message: string } | null = null;
  for (const suffix of suffixes) {
    for (const base of chain) {
      const result = await selectDishes(
        supabase,
        base + suffix,
        restaurantId,
        categoryIds,
      );
      if (!result.error) {
        return ((result.data ?? []) as unknown as Record<string, unknown>[]).map(
          mapGuestDish,
        );
      }
      lastError = result.error;
      if (suffix && missingColumnError(result.error, I18N_COLUMN_ERROR)) break;
    }
  }
  if (lastError) {
    console.error("[guest-menu] dishes query failed", lastError.message);
  }
  return [] as DishRow[];
}

function tableLookupKey(value: string) {
  const trimmed = value.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  return decoded
    .replaceAll("+", " ")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

async function findGuestTable(
  supabase: SupabaseClient,
  restaurantId: string,
  rawKey: string,
) {
  const key = rawKey.trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from("tables")
    .select("id, restaurant_id, table_number")
    .eq("restaurant_id", restaurantId)
    .returns<TableRow[]>();
  if (error || !data?.length) return null;

  if (isUuid(key)) {
    const byId = data.find((row) => row.id === key);
    if (byId) return byId;
  }

  const exact = data.filter((row) => row.table_number === key);
  if (exact.length === 1) return exact[0];

  const wanted = tableLookupKey(key);
  const fuzzy = data.filter((row) => tableLookupKey(row.table_number) === wanted);
  if (fuzzy.length === 1) return fuzzy[0];
  if (exact.length > 1) return exact[0];
  if (fuzzy.length > 1) {
    return [...fuzzy].sort((a, b) => a.id.localeCompare(b.id))[0];
  }
  return null;
}

export async function loadGuestMenu(
  restaurantSlug: string,
  tableId?: string,
) {
  const restaurantRow = await fetchRestaurantHours(
    await fetchRestaurant(restaurantSlug),
  );
  if (!restaurantRow) return null;

  const { manager_email: _managerEmail, ...publicRestaurant } = restaurantRow;
  void _managerEmail;
  const restaurant: GuestMenuRestaurant = {
    ...publicRestaurant,
    logo: restaurantLogo(restaurantRow),
  };

  const supabase = createSupabaseAdminClient();
  let table: TableRow | null = null;

  if (tableId) {
    table = await findGuestTable(supabase, restaurant.id, tableId);
    if (!table) return null;
  }

  const categoriesFull = await supabase
    .from("categories")
    .select("id, restaurant_id, name, order_index, name_en, name_ru")
    .eq("restaurant_id", restaurant.id)
    .order("order_index", { ascending: true })
    .returns<CategoryRow[]>();
  const categories =
    categoriesFull.error &&
    /name_en|name_ru/i.test(categoriesFull.error.message)
      ? await supabase
          .from("categories")
          .select("id, restaurant_id, name, order_index")
          .eq("restaurant_id", restaurant.id)
          .order("order_index", { ascending: true })
          .returns<CategoryRow[]>()
      : categoriesFull;

  if (categories.error) {
    console.error("[guest-menu] categories query failed", categories.error.message);
  }

  const categoryRows = categories.data ?? [];
  const categoryIds = categoryRows.map((category) => category.id);
  const [dishes, promptLoad] = await Promise.all([
    fetchRestaurantDishes(supabase, restaurant.id, categoryIds),
    loadRestaurantAiPrompts(restaurant.id, { activeOnly: true }),
  ]);

  return {
    restaurant,
    table,
    categories: categoryRows,
    dishes,
    quickPrompts: promptLoad.tableReady ? promptLoad.prompts : null,
  };
}
