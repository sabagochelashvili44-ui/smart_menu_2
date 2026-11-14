import "server-only";

import type { AssistantDish } from "@/lib/ai-assistant";
import { parseNutritionInput, parsePrepMinutes } from "@/lib/dish-nutrition";
import { invalidateGeminiMenuCache } from "@/lib/gemini-menu-cache";
import { parseMoney } from "@/lib/menu-lane";
import { invalidateMenuTranslateCache } from "@/lib/menu-translate-cache";
import { normalizeMenuTextList } from "@/lib/menu-list-normalize";
import { parseServiceFeePercent } from "@/lib/service-fee";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { revalidateTag, unstable_cache } from "next/cache";

const MENU_REVALIDATE_SECONDS = 45;
const RESTAURANT_REVALIDATE_SECONDS = 60;

function waiterMenuTag(restaurantId: string) {
  return `waiter-menu:${restaurantId}`;
}

function waiterRestaurantTag(restaurantId: string) {
  return `waiter-restaurant:${restaurantId}`;
}

export function invalidateWaiterMenu(restaurantId: string) {
  if (!restaurantId) return;
  revalidateTag(waiterMenuTag(restaurantId), "max");
  invalidateGeminiMenuCache(restaurantId);
  invalidateMenuTranslateCache(restaurantId);
}

export function invalidateWaiterRestaurant(restaurantId: string) {
  if (!restaurantId) return;
  revalidateTag(waiterRestaurantTag(restaurantId), "max");
  invalidateGeminiMenuCache(restaurantId);
  invalidateMenuTranslateCache(restaurantId);
}

export function invalidateWaiterCaches(restaurantId: string) {
  invalidateWaiterMenu(restaurantId);
  invalidateWaiterRestaurant(restaurantId);
}

async function fetchWaiterRestaurant(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("name, service_fee_percent")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { name?: unknown; service_fee_percent?: unknown };
  return {
    name: String(row.name ?? "").trim(),
    percent: parseServiceFeePercent(row.service_fee_percent),
  };
}

export async function loadWaiterRestaurant(restaurantId: string) {
  if (!restaurantId) return { name: "", percent: 0 };
  try {
    const cached = await unstable_cache(
      async () => {
        const restaurant = await fetchWaiterRestaurant(restaurantId);
        if (!restaurant) {
          throw new Error("WAITER_RESTAURANT_FETCH_FAILED");
        }
        return restaurant;
      },
      ["waiter-restaurant", restaurantId],
      {
        revalidate: RESTAURANT_REVALIDATE_SECONDS,
        tags: [waiterRestaurantTag(restaurantId)],
      },
    )();
    return cached;
  } catch {
    return { name: "", percent: 0 };
  }
}

export async function loadWaiterRestaurantServiceFee(restaurantId: string) {
  const { percent } = await loadWaiterRestaurant(restaurantId);
  return percent;
}

const DISH_I18N = "name_en, name_ru, description_en, description_ru";
const DISH_SELECT_FULL =
  `id, name, price, bottle_price, glass_price, description, category_id, ingredients, allergens, calories, protein, carbs, fat, is_available, prep_minutes, ${DISH_I18N}`;
const DISH_SELECT_NO_PREP =
  `id, name, price, description, category_id, ingredients, allergens, calories, protein, carbs, fat, is_available, ${DISH_I18N}`;
const DISH_SELECT_CORE =
  `id, name, price, description, category_id, allergens, is_available, ${DISH_I18N}`;
const DISH_SELECT_FULL_NO_I18N =
  "id, name, price, description, category_id, ingredients, allergens, calories, protein, carbs, fat, is_available, prep_minutes";
const DISH_SELECT_NO_POUR =
  `id, name, price, description, category_id, ingredients, allergens, calories, protein, carbs, fat, is_available, prep_minutes, ${DISH_I18N}`;

function asTextList(value: unknown): string[] | null {
  return normalizeMenuTextList(value);
}

function mapWaiterDish(
  row: Record<string, unknown>,
  categoryNameById: Map<string, string>,
): AssistantDish {
  const categoryId = String(row.category_id ?? "");
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    name_en: row.name_en ? String(row.name_en) : null,
    name_ru: row.name_ru ? String(row.name_ru) : null,
    description: row.description ? String(row.description) : null,
    description_en: row.description_en ? String(row.description_en) : null,
    description_ru: row.description_ru ? String(row.description_ru) : null,
    price: Number(row.price) || 0,
    bottle_price: parseMoney(row.bottle_price),
    glass_price: parseMoney(row.glass_price),
    allergens: asTextList(row.allergens),
    ingredients: asTextList(row.ingredients),
    category: categoryNameById.get(categoryId) ?? null,
    is_available: row.is_available !== false,
    calories: parseNutritionInput(row.calories),
    protein: parseNutritionInput(row.protein),
    carbs: parseNutritionInput(row.carbs),
    fat: parseNutritionInput(row.fat),
    prep_minutes: parsePrepMinutes(row.prep_minutes),
  };
}

async function fetchWaiterMenuDishes(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId);

  const categoryNameById = new Map(
    (categories ?? []).map((row) => {
      const category = row as { id: string; name: string };
      return [String(category.id), String(category.name ?? "")];
    }),
  );
  const categoryIds = [...categoryNameById.keys()];

  let data: unknown[] | null = null;
  let error: { message: string } | null = null;

  const first = await supabase
    .from("dishes")
    .select(DISH_SELECT_FULL)
    .eq("restaurant_id", restaurantId);
  data = first.data as unknown[] | null;
  error = first.error;

  if (error && /bottle_price|glass_price/i.test(error.message)) {
    const retry = await supabase
      .from("dishes")
      .select(DISH_SELECT_NO_POUR)
      .eq("restaurant_id", restaurantId);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error && /name_en|name_ru|description_en|description_ru/i.test(error.message)) {
    const retry = await supabase
      .from("dishes")
      .select(DISH_SELECT_FULL_NO_I18N)
      .eq("restaurant_id", restaurantId);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error && /prep_minutes/i.test(error.message)) {
    const retry = await supabase
      .from("dishes")
      .select(DISH_SELECT_NO_PREP)
      .eq("restaurant_id", restaurantId);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error && /calories|protein|carbs|\bfat\b/i.test(error.message)) {
    const retry = await supabase
      .from("dishes")
      .select(
        "id, name, price, description, category_id, ingredients, allergens, is_available",
      )
      .eq("restaurant_id", restaurantId);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error && /ingredients/i.test(error.message)) {
    const retry = await supabase
      .from("dishes")
      .select(DISH_SELECT_CORE)
      .eq("restaurant_id", restaurantId);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error && /restaurant_id/i.test(error.message) && categoryIds.length) {
    const retry = await supabase
      .from("dishes")
      .select(DISH_SELECT_FULL)
      .in("category_id", categoryIds);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }
  if (error) {
    console.error("[ai-waiter] menu query failed", error.message);
    return null;
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapWaiterDish(row, categoryNameById),
  );
}

async function fetchLiveDishStock(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  let data: unknown[] | null = null;
  let error: { message: string } | null = null;

  const first = await supabase
    .from("dishes")
    .select("id, is_available")
    .eq("restaurant_id", restaurantId);
  data = first.data as unknown[] | null;
  error = first.error;

  if (error && /restaurant_id/i.test(error.message)) {
    const { data: categories } = await supabase
      .from("categories")
      .select("id")
      .eq("restaurant_id", restaurantId);
    const categoryIds = (categories ?? []).map((row) =>
      String((row as { id?: unknown }).id ?? ""),
    ).filter(Boolean);
    if (!categoryIds.length) return new Map<string, boolean>();
    const retry = await supabase
      .from("dishes")
      .select("id, is_available")
      .in("category_id", categoryIds);
    data = retry.data as unknown[] | null;
    error = retry.error;
  }

  if (error) {
    console.error("[ai-waiter] stock query failed", error.message);
    return null;
  }

  const stock = new Map<string, boolean>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    stock.set(id, row.is_available !== false);
  }
  return stock;
}

function applyLiveStock(
  dishes: AssistantDish[],
  stock: Map<string, boolean>,
) {
  return dishes
    .filter((dish) => stock.has(dish.id ?? ""))
    .map((dish) => ({
      ...dish,
      is_available: stock.get(dish.id ?? "") !== false,
    }));
}

function catalogMembershipChanged(
  dishes: AssistantDish[],
  stock: Map<string, boolean>,
) {
  if (dishes.length !== stock.size) return true;
  for (const dish of dishes) {
    if (!stock.has(dish.id ?? "")) return true;
  }
  return false;
}

async function loadCachedWaiterMenu(restaurantId: string) {
  try {
    return await unstable_cache(
      async () => {
        const dishes = await fetchWaiterMenuDishes(restaurantId);
        if (!dishes) {
          throw new Error("WAITER_MENU_FETCH_FAILED");
        }
        return dishes;
      },
      ["waiter-menu", restaurantId],
      {
        revalidate: MENU_REVALIDATE_SECONDS,
        tags: [waiterMenuTag(restaurantId)],
      },
    )();
  } catch {
    return [] as AssistantDish[];
  }
}

export async function loadWaiterMenuDishes(restaurantId: string) {
  if (!restaurantId) return [] as AssistantDish[];

  const stock = await fetchLiveDishStock(restaurantId);
  if (!stock) {
    return (await fetchWaiterMenuDishes(restaurantId)) ?? [];
  }

  let dishes = await loadCachedWaiterMenu(restaurantId);
  if (catalogMembershipChanged(dishes, stock)) {
    dishes = (await fetchWaiterMenuDishes(restaurantId)) ?? dishes;
    invalidateWaiterMenu(restaurantId);
  }

  return applyLiveStock(dishes, stock);
}

export function filterMenuBySelectedTag(
  dishes: AssistantDish[],
  selectedTag?: string | null,
) {
  const available = dishes.filter((dish) => dish.is_available !== false);
  const tag = selectedTag?.trim().toLowerCase();
  if (
    !tag ||
    /^(all|other|something else|more|სხვა|სხვა რამე|ყველა|другое|еще|ещё)$/i.test(
      tag,
    )
  ) {
    return available;
  }

  if (tag === "meat") {
    const matched = available.filter((dish) => {
      const category = (dish.category ?? "").trim().toLowerCase();
      const blob = `${category} ${dish.name.toLowerCase()} ${(dish.description ?? "").toLowerCase()}`;
      return (
        category === "main" ||
        category.startsWith("main ") ||
        /main|grill|meat|khinkali|მწვად|ხორც|ძირითად|ცხელი კერძ|ხინკალ|ქაბაბ|ჩაშუშულ|შქმერულ|ხარჩო|мангал|основн|хинкал|мяс/.test(
          blob,
        )
      );
    });
    return matched.length ? matched : available;
  }

  const matched = available.filter((dish) =>
    (dish.category ?? "").toLowerCase().includes(tag),
  );
  return matched.length ? matched : available;
}
