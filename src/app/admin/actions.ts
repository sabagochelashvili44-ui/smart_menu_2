"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient, requireAdminUser } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  type AdminCategory,
  type AdminDish,
  type AdminTable,
} from "@/lib/supabaseAdmin";
import { getActiveRestaurant, requireTenantRestaurant, TENANT_CACHE_TAG } from "@/lib/tenant";
import {
  BRAND_FONTS,
  DEFAULT_BRAND,
  autoBrandPalette,
  normalizeHex,
  parseStoredFontAndColors,
  restaurantLogo,
  serializeFontAndColors,
  slugifyRestaurant,
} from "@/lib/restaurant-brand";
import { omitKeys } from "@/lib/object-omit";
import { parseNutritionInput, parsePrepMinutes } from "@/lib/dish-nutrition";
import { formatHourClock } from "@/lib/opening-hours";
import { normalizeMenuTextList } from "@/lib/menu-list-normalize";
import { toShiftNote, type ShiftNote } from "@/lib/shift-notes";
import { selectShiftNotes } from "@/lib/shift-notes-query";
import { selectWaiterCalls } from "@/lib/waiter-calls-query";
import {
  filterKitchenOrderTickets,
  parseWaiterCallType,
  type WaiterCallType,
} from "@/lib/waiter-call-types";
import {
  invalidateWaiterMenu,
  invalidateWaiterRestaurant,
} from "@/lib/ai-waiter-menu";
import {
  loadDishRecipes,
  loadRestaurantIngredients,
  saveDishRecipe,
  type AdminIngredient,
  type RecipeInputLine,
} from "@/lib/dish-recipes";
import { canonicalDishPrice, parseDrinkPour, parseMoney } from "@/lib/menu-lane";

async function requireMenuEditorRestaurant() {
  await requireAdminUser();
  const ctx = await requireTenantRestaurant();
  const restaurant = ctx.restaurant ?? (await getActiveRestaurant());
  if (!restaurant) {
    return { restaurant: null, error: "No restaurant linked to this account." };
  }
  if (
    !ctx.isSuperAdmin &&
    ctx.staffRole !== "owner" &&
    ctx.staffRole !== "manager"
  ) {
    return { restaurant: null, error: "Forbidden." };
  }
  return { restaurant, error: null };
}

async function requireStockToggleRestaurant() {
  await requireAdminUser();
  const ctx = await requireTenantRestaurant();
  const restaurant = ctx.restaurant ?? (await getActiveRestaurant());
  if (!restaurant) {
    return { restaurant: null, error: "No restaurant linked to this account." };
  }
  if (
    !ctx.isSuperAdmin &&
    ctx.staffRole !== "owner" &&
    ctx.staffRole !== "manager" &&
    ctx.staffRole !== "waiter"
  ) {
    return { restaurant: null, error: "Forbidden." };
  }
  return { restaurant, error: null };
}

export async function loadAdminTables() {
  await requireAdminUser();
  const restaurant = await getActiveRestaurant();
  if (!restaurant) {
    return { restaurant: null, tables: [] as AdminTable[] };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id, restaurant_id, table_number")
    .eq("restaurant_id", restaurant.id)
    .order("table_number");

  if (error) {
    throw new Error(error.message);
  }

  return { restaurant, tables: (data ?? []) as AdminTable[] };
}

export async function addAdminTable(tableNumber: string) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return { error: authError ?? "No restaurant found in Supabase.", table: null };
  }

  const payload = {
    restaurant_id: restaurant.id,
    table_number: tableNumber.trim(),
  };
  const session = await createSupabaseServerClient();
  const result = await session
    .from("tables")
    .insert(payload)
    .select("id, restaurant_id, table_number")
    .single();
  const via = "session";


  if (result.error || !result.data) {
    return { error: result.error?.message ?? "Could not add table.", table: null };
  }

  revalidatePath("/admin/tables");
  return { error: null, table: result.data as AdminTable };
}

export async function deleteAdminTable(tableId: string) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return { error: authError ?? "No restaurant found in Supabase." };
  }

  const session = await createSupabaseServerClient();
  const result = await session
    .from("tables")
    .delete()
    .eq("id", tableId.trim())
    .eq("restaurant_id", restaurant.id);

  if (result.error) {
    return { error: result.error.message };
  }

  revalidatePath("/admin/tables");
  return { error: null };
}

export async function loadAdminMenu() {
  await requireAdminUser();
  const restaurant = await getActiveRestaurant();
  if (!restaurant) {
    return {
      restaurant: null,
      categories: [] as AdminCategory[],
      dishes: [] as AdminDish[],
      ingredients: [] as AdminIngredient[],
    };
  }

  const supabase = createSupabaseAdminClient();
  const categoriesFull = await supabase
    .from("categories")
    .select("id, restaurant_id, name, order_index, name_en, name_ru, station, menu_role")
    .eq("restaurant_id", restaurant.id)
    .order("order_index");
  const categories =
    categoriesFull.error && /name_en|name_ru|station|menu_role/i.test(categoriesFull.error.message)
      ? await supabase
          .from("categories")
          .select("id, restaurant_id, name, order_index")
          .eq("restaurant_id", restaurant.id)
          .order("order_index")
      : categoriesFull;

  if (categories.error) {
    throw new Error(categories.error.message);
  }

  const categoryRows = (categories.data ?? []) as AdminCategory[];
  const categoryIds = categoryRows.map((row) => row.id);
  let dishSelect =
    "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, ingredients, is_available, calories, protein, carbs, fat, name_en, name_ru, description_en, description_ru, prep_minutes, pairing_dish_ids";
  const dishSelectNoPrep = dishSelect.replace(", prep_minutes", "");
  const dishSelectMenu =
    "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, ingredients, is_available, name_en, name_ru, description_en, description_ru, pairing_dish_ids";
  const dishSelectCore =
    "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, is_available";

  let dishRows: AdminDish[] | null = [];
  let dishError = null as { message: string } | null;

  const byRestaurant = await supabase
    .from("dishes")
    .select(dishSelect)
    .eq("restaurant_id", restaurant.id)
    .order("name");
  dishRows = byRestaurant.data as AdminDish[] | null;
  dishError = byRestaurant.error;

  if (dishError && /pairing_dish_ids/i.test(dishError.message)) {
    dishSelect = dishSelect.replace(", pairing_dish_ids", "");
    const withoutPairings = await supabase
      .from("dishes")
      .select(dishSelect)
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutPairings.data as AdminDish[] | null;
    dishError = withoutPairings.error;
  }

  if (dishError && /prep_minutes/i.test(dishError.message)) {
    dishSelect = dishSelect.includes("pairing_dish_ids")
      ? dishSelectNoPrep
      : dishSelectNoPrep.replace(", pairing_dish_ids", "");
    const withoutPrep = await supabase
      .from("dishes")
      .select(dishSelect)
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutPrep.data as AdminDish[] | null;
    dishError = withoutPrep.error;
  }

  if (dishError && /bottle_price|glass_price/i.test(dishError.message)) {
    dishSelect = dishSelect
      .replace(", bottle_price, glass_price", "")
      .replace("bottle_price, glass_price, ", "");
    const withoutPour = await supabase
      .from("dishes")
      .select(dishSelect)
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutPour.data as AdminDish[] | null;
    dishError = withoutPour.error;
  }

  if (dishError && /name_en|name_ru|description_en|description_ru/i.test(dishError.message)) {
    const withoutI18n = await supabase
      .from("dishes")
      .select(
        `id, category_id, name, description, price, margin_score, image_url, allergens, ingredients, is_available, calories, protein, carbs, fat${dishSelect.includes("prep_minutes") ? ", prep_minutes" : ""}`,
      )
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutI18n.data as AdminDish[] | null;
    dishError = withoutI18n.error;
  }

  if (dishError && /calories|protein|carbs|\bfat\b/i.test(dishError.message)) {
    const menuSelect = dishSelect.includes("pairing_dish_ids")
      ? dishSelectMenu
      : dishSelectMenu.replace(", pairing_dish_ids", "");
    const withoutNutrition = await supabase
      .from("dishes")
      .select(menuSelect)
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutNutrition.data as AdminDish[] | null;
    dishError = withoutNutrition.error;
  }

  if (dishError && /ingredients/i.test(dishError.message)) {
    const withoutIngredients = await supabase
      .from("dishes")
      .select(dishSelectCore)
      .eq("restaurant_id", restaurant.id)
      .order("name");
    dishRows = withoutIngredients.data as AdminDish[] | null;
    dishError = withoutIngredients.error;
  }

  if (dishError && /restaurant_id/i.test(dishError.message) && categoryIds.length > 0) {
    const byCategory = await supabase
      .from("dishes")
      .select(dishSelect)
      .in("category_id", categoryIds)
      .order("name");
    dishRows = byCategory.data as AdminDish[] | null;
    dishError = byCategory.error;
  } else if (
    !dishError &&
    (dishRows ?? []).length === 0 &&
    categoryIds.length > 0
  ) {
    const byCategory = await supabase
      .from("dishes")
      .select(dishSelect)
      .in("category_id", categoryIds)
      .order("name");
    if (!byCategory.error) {
      dishRows = byCategory.data as unknown as AdminDish[] | null;
    }
  }

  if (dishError) {
    console.error("[admin-menu] dishes query failed", dishError.message);
    dishRows = [];
  }

  const dishes = ((dishRows ?? []) as AdminDish[]).map((dish) =>
    toAdminDish(dish as unknown as Record<string, unknown>),
  );
  const ingredients = await loadRestaurantIngredients(supabase, restaurant.id);
  const recipesByDish = await loadDishRecipes(
    supabase,
    dishes.map((dish) => dish.id),
    ingredients,
  );
  for (const dish of dishes) {
    dish.recipe = recipesByDish.get(dish.id) ?? [];
  }

  return { restaurant, categories: categoryRows, dishes, ingredients };
}

function optionalI18n(value?: string | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function saveAdminCategory(input: {
  id?: string;
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
  station?: string | null;
  menu_role?: string | null;
}) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return {
      error: authError ?? "No restaurant linked to this account.",
      category: null,
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "Category name is required.", category: null };
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("categories")
    .select("order_index")
    .eq("restaurant_id", restaurant.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = Number(existing?.order_index ?? 0) + 1;
  const station = ["kitchen", "grill", "cold", "pastry", "bar", "other"].includes(
    input.station ?? "",
  )
    ? input.station
    : "kitchen";
  const menuRole = ["food", "drink", "dessert", "sauce", "other"].includes(
    input.menu_role ?? "",
  )
    ? input.menu_role
    : "food";
  const payload = {
    name,
    name_en: optionalI18n(input.name_en),
    name_ru: optionalI18n(input.name_ru),
    station,
    menu_role: menuRole,
  };
  const categorySelect =
    "id, restaurant_id, name, order_index, name_en, name_ru, station, menu_role";

  const write = (body: Record<string, unknown>) =>
    input.id
      ? supabase
          .from("categories")
          .update(body)
          .eq("id", input.id)
          .eq("restaurant_id", restaurant.id)
      : supabase.from("categories").insert({
          restaurant_id: restaurant.id,
          ...body,
          order_index: nextIndex,
        });

  let result = await write({ ...payload }).select(categorySelect).maybeSingle();
  if (result.error && /station|menu_role/i.test(result.error.message)) {
    result = await write({
      name,
      name_en: payload.name_en,
      name_ru: payload.name_ru,
    })
      .select("id, restaurant_id, name, order_index, name_en, name_ru")
      .maybeSingle();
  }
  if (result.error && /name_en|name_ru/i.test(result.error.message)) {
    result = await write({ name })
      .select("id, restaurant_id, name, order_index")
      .maybeSingle();
  }

  if (result.error) {
    return { error: result.error.message, category: null };
  }
  if (!result.data) {
    return { error: "Category could not be saved.", category: null };
  }
  const data = result.data;

  invalidateWaiterMenu(restaurant.id);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  return { error: null, category: data as AdminCategory };
}

export async function deleteAdminCategory(id: string) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return { error: authError ?? "No restaurant linked to this account." };
  }

  const supabase = createSupabaseAdminClient();
  const { data: owned } = await supabase
    .from("categories")
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!owned) {
    return { error: "Category not found." };
  }

  const byRestaurant = await supabase
    .from("dishes")
    .delete()
    .eq("category_id", id)
    .eq("restaurant_id", restaurant.id);

  if (byRestaurant.error && /restaurant_id/i.test(byRestaurant.error.message)) {
    const fallback = await supabase.from("dishes").delete().eq("category_id", id);
    if (fallback.error) {
      return { error: fallback.error.message };
    }
  } else if (byRestaurant.error) {
    return { error: byRestaurant.error.message };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurant.id);

  if (error) {
    return { error: error.message };
  }

  invalidateWaiterMenu(restaurant.id);
  revalidatePath("/admin/menu");
  revalidatePath("/menu", "layout");
  return { error: null };
}

const DISH_COLUMNS_NO_PREP =
  "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, ingredients, is_available, calories, protein, carbs, fat, name_en, name_ru, description_en, description_ru, pairing_dish_ids";
const DISH_COLUMNS = `${DISH_COLUMNS_NO_PREP}, prep_minutes`;
const DISH_COLUMNS_MENU =
  "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, ingredients, is_available, name_en, name_ru, description_en, description_ru, pairing_dish_ids";
const DISH_COLUMNS_CORE =
  "id, category_id, name, description, price, bottle_price, glass_price, margin_score, image_url, allergens, is_available";
const POUR_COLUMN_ERROR = /bottle_price|glass_price/;
const NUTRITION_COLUMN_ERROR = /calories|protein|carbs|\bfat\b/i;
const I18N_COLUMN_ERROR = /name_en|name_ru|description_en|description_ru/;
const PAIRING_COLUMN_ERROR = /pairing_dish_ids/;
const DISH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTextList(value: unknown): string[] {
  return normalizeMenuTextList(value) ?? [];
}

function parsePairingDishIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
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

function toAdminDish(row: Record<string, unknown>): AdminDish {
  return {
    id: String(row.id),
    category_id: String(row.category_id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    bottle_price: parseMoney(row.bottle_price),
    glass_price: parseMoney(row.glass_price),
    margin_score: Number(row.margin_score) || 0,
    image_url: row.image_url ? String(row.image_url) : null,
    allergens: parseTextList(row.allergens),
    ingredients: parseTextList(row.ingredients),
    is_available: Boolean(row.is_available),
    calories: parseNutritionInput(row.calories),
    protein: parseNutritionInput(row.protein),
    carbs: parseNutritionInput(row.carbs),
    fat: parseNutritionInput(row.fat),
    prep_minutes: parsePrepMinutes(row.prep_minutes),
    name_en: row.name_en ? String(row.name_en) : null,
    name_ru: row.name_ru ? String(row.name_ru) : null,
    description_en: row.description_en ? String(row.description_en) : null,
    description_ru: row.description_ru ? String(row.description_ru) : null,
    pairing_dish_ids: parsePairingDishIds(row.pairing_dish_ids),
  };
}

async function verifyDishBelongsToRestaurant(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  dishId: string,
  restaurantId: string,
) {
  const existing = await supabase
    .from("dishes")
    .select("id, category_id")
    .eq("id", dishId)
    .maybeSingle();
  if (!existing.data?.category_id) return false;
  const owned = await supabase
    .from("categories")
    .select("id")
    .eq("id", existing.data.category_id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return Boolean(owned.data);
}

async function setDishAvailability(
  restaurantId: string,
  id: string,
  isAvailable: boolean,
) {
  const supabase = createSupabaseAdminClient();
  let useRestaurantFilter = true;
  let result = await supabase
    .from("dishes")
    .update({ is_available: isAvailable })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select(DISH_COLUMNS)
    .maybeSingle();

  if (
    (result.error && /restaurant_id/i.test(result.error.message)) ||
    (!result.error && !result.data)
  ) {
    const owned = await verifyDishBelongsToRestaurant(
      supabase,
      id,
      restaurantId,
    );
    if (!owned) {
      return { error: "Dish not found.", dish: null };
    }
    useRestaurantFilter = false;
    result = await supabase
      .from("dishes")
      .update({ is_available: isAvailable })
      .eq("id", id)
      .select(DISH_COLUMNS)
      .maybeSingle();
  }

  if (result.error && /prep_minutes/i.test(result.error.message)) {
    const query = supabase
      .from("dishes")
      .update({ is_available: isAvailable })
      .eq("id", id);
    result = await (useRestaurantFilter
      ? query.eq("restaurant_id", restaurantId)
      : query
    )
      .select(DISH_COLUMNS_NO_PREP)
      .maybeSingle();
  }

  if (result.error && NUTRITION_COLUMN_ERROR.test(result.error.message)) {
    const query = supabase
      .from("dishes")
      .update({ is_available: isAvailable })
      .eq("id", id);
    result = await (useRestaurantFilter
      ? query.eq("restaurant_id", restaurantId)
      : query
    )
      .select(DISH_COLUMNS_MENU)
      .maybeSingle();
  }

  if (result.error && /ingredients/i.test(result.error.message)) {
    const query = supabase
      .from("dishes")
      .update({ is_available: isAvailable })
      .eq("id", id);
    result = await (useRestaurantFilter
      ? query.eq("restaurant_id", restaurantId)
      : query
    )
      .select(DISH_COLUMNS_CORE)
      .maybeSingle();
  }

  if (result.error) {
    return { error: result.error.message, dish: null };
  }
  if (!result.data) {
    return { error: "Dish not found.", dish: null };
  }

  invalidateWaiterMenu(restaurantId);
  revalidatePath("/admin/menu");
  revalidatePath("/admin/kitchen");
  revalidatePath("/menu", "layout");
  return {
    error: null as string | null,
    dish: toAdminDish(result.data as unknown as Record<string, unknown>),
  };
}

export async function toggleAdminDish(id: string, isAvailable: boolean) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return {
      error: authError ?? "No restaurant linked to this account.",
      dish: null,
    };
  }
  return setDishAvailability(restaurant.id, id, isAvailable);
}

export async function toggleKitchenDishAvailable(
  id: string,
  isAvailable: boolean,
) {
  const { restaurant, error: authError } = await requireStockToggleRestaurant();
  if (!restaurant) {
    return {
      error: authError ?? "No restaurant linked to this account.",
      dish: null,
    };
  }
  return setDishAvailability(restaurant.id, id, isAvailable);
}

export type DishInput = {
  id?: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  bottle_price?: number | null;
  glass_price?: number | null;
  image_url: string;
  allergens: string[];
  ingredients: string[];
  is_available: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  prep_minutes: number | null;
  name_en?: string | null;
  name_ru?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  pairing_dish_ids?: string[];
  recipe?: RecipeInputLine[];
};

export async function saveAdminDish(input: DishInput) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return { error: authError ?? "No restaurant found in Supabase.", dish: null };
  }

  const supabase = createSupabaseAdminClient();
  const { data: category } = await supabase
    .from("categories")
    .select("id, restaurant_id")
    .eq("id", input.category_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!category) {
    return { error: "Category does not belong to this restaurant.", dish: null };
  }

  if (input.id) {
    const owned = await verifyDishBelongsToRestaurant(
      supabase,
      input.id,
      restaurant.id,
    );
    if (!owned) {
      return { error: "Dish does not belong to this restaurant.", dish: null };
    }
  }

  const previousPrice = input.id
    ? await supabase
        .from("dishes")
        .select("price")
        .eq("id", input.id)
        .maybeSingle()
    : null;

  const restaurantId = restaurant.id;
  const bottlePrice = parseMoney(input.bottle_price);
  const glassPrice = parseMoney(input.glass_price);
  const price = canonicalDishPrice({
    price: input.price,
    bottle_price: bottlePrice,
    glass_price: glassPrice,
  });
  let currentPayload: Record<string, unknown> = {
    category_id: input.category_id,
    restaurant_id: restaurantId,
    name: input.name.trim(),
    description: input.description.trim() || "",
    price,
    bottle_price: bottlePrice,
    glass_price: glassPrice,
    image_url: input.image_url.trim() || null,
    allergens: input.allergens,
    ingredients: input.ingredients,
    is_available: input.is_available,
    calories: parseNutritionInput(input.calories),
    protein: parseNutritionInput(input.protein),
    carbs: parseNutritionInput(input.carbs),
    fat: parseNutritionInput(input.fat),
    prep_minutes: parsePrepMinutes(input.prep_minutes),
    name_en: optionalI18n(input.name_en),
    name_ru: optionalI18n(input.name_ru),
    description_en: optionalI18n(input.description_en),
    description_ru: optionalI18n(input.description_ru),
    pairing_dish_ids: parsePairingDishIds(input.pairing_dish_ids).filter(
      (id) => id !== input.id,
    ),
  };

  // Keep only companion ids that belong to this restaurant's menu.
  if (
    Array.isArray(currentPayload.pairing_dish_ids) &&
    (currentPayload.pairing_dish_ids as string[]).length > 0
  ) {
    const wanted = currentPayload.pairing_dish_ids as string[];
    const owned = await supabase
      .from("dishes")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .in("id", wanted);
    if (!owned.error) {
      const allowed = new Set((owned.data ?? []).map((row) => String(row.id)));
      currentPayload.pairing_dish_ids = wanted.filter((id) => allowed.has(id));
    }
  }

  let useRestaurantFilter = true;
  const write = (body: Record<string, unknown>) => {
    if (input.id) {
      const query = supabase.from("dishes").update(body).eq("id", input.id);
      return useRestaurantFilter
        ? query.eq("restaurant_id", restaurantId)
        : query;
    }
    return supabase.from("dishes").insert({ ...body, margin_score: 5 });
  };

  let selectColumns = DISH_COLUMNS;
  let result = await write(currentPayload).select(selectColumns).maybeSingle();
  if (result.error && /restaurant_id/i.test(result.error.message)) {
    useRestaurantFilter = false;
    currentPayload = omitKeys(currentPayload, ["restaurant_id"]);
    result = await write(currentPayload).select(selectColumns).maybeSingle();
  }
  if (result.error && PAIRING_COLUMN_ERROR.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, ["pairing_dish_ids"]);
    selectColumns = selectColumns.replace(", pairing_dish_ids", "");
    result = await write(currentPayload).select(selectColumns).maybeSingle();
  }
  if (result.error && /prep_minutes/i.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, ["prep_minutes"]);
    selectColumns = DISH_COLUMNS_NO_PREP.replace(
      ", pairing_dish_ids",
      selectColumns.includes("pairing_dish_ids") ? ", pairing_dish_ids" : "",
    );
    result = await write(currentPayload).select(selectColumns).maybeSingle();
  }
  if (result.error && POUR_COLUMN_ERROR.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, ["bottle_price", "glass_price"]);
    selectColumns = selectColumns
      .replace(", bottle_price, glass_price", "")
      .replace("bottle_price, glass_price, ", "");
    result = await write(currentPayload).select(selectColumns).maybeSingle();
  }
  if (result.error && NUTRITION_COLUMN_ERROR.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, [
      "calories",
      "protein",
      "carbs",
      "fat",
    ]);
    result = await write(currentPayload)
      .select(
        DISH_COLUMNS_MENU.replace(
          ", pairing_dish_ids",
          selectColumns.includes("pairing_dish_ids") ? ", pairing_dish_ids" : "",
        ),
      )
      .maybeSingle();
  }
  if (result.error && /ingredients/i.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, [
      "ingredients",
      "calories",
      "protein",
      "carbs",
      "fat",
    ]);
    result = await write(currentPayload)
      .select(DISH_COLUMNS_CORE)
      .maybeSingle();
  }
  if (result.error && I18N_COLUMN_ERROR.test(result.error.message)) {
    currentPayload = omitKeys(currentPayload, [
      "name_en",
      "name_ru",
      "description_en",
      "description_ru",
    ]);
    result = await write(currentPayload)
      .select(DISH_COLUMNS_CORE)
      .maybeSingle();
  }
  if (result.error) {
    return { error: result.error.message, dish: null };
  }
  if (!result.data) {
    return { error: "Dish could not be saved.", dish: null };
  }

  const savedPrice = price;
  const oldPrice = Number(previousPrice?.data?.price);
  if (
    input.id &&
    Number.isFinite(oldPrice) &&
    Number.isFinite(savedPrice) &&
    Math.abs(oldPrice - savedPrice) >= 0.009
  ) {
    await supabase.from("dish_price_changes").insert({
      restaurant_id: restaurant.id,
      dish_id: input.id,
      dish_name: input.name.trim(),
      old_price: oldPrice,
      new_price: savedPrice,
    });
  }

  invalidateWaiterMenu(restaurant.id);
  revalidatePath("/admin/menu");
  revalidatePath("/menu", "layout");
  const dish = toAdminDish(result.data as unknown as Record<string, unknown>);
  try {
    const recipe = await saveDishRecipe(
      supabase,
      restaurant.id,
      dish.id,
      input.recipe,
    );
    if (recipe) dish.recipe = recipe;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recipe save failed";
    if (!/ingredients|dish_recipes|schema cache|does not exist|could not find the/i.test(message)) {
      return { error: message, dish };
    }
  }
  return {
    error: null,
    dish,
  };
}

const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024;

export async function uploadMenuDishImage(formData: FormData) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return {
      error: authError ?? "No restaurant found in Supabase.",
      url: null as string | null,
    };
  }

  const file = formData.get("image") as File | null;
  if (!file || file.size <= 0) {
    return { error: "Choose an image file.", url: null };
  }
  if (file.size > MAX_MENU_IMAGE_BYTES) {
    return { error: "Image must be 2 MB or smaller.", url: null };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { error: "Only image files are allowed.", url: null };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "dish";
  const filePath = `${restaurant.id}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = createSupabaseAdminClient();
  const buckets = ["dishes", "menu-images"] as const;
  let uploadErrorMessage = "";

  for (const bucket of buckets) {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (!uploadError) {
      const publicUrl = supabase.storage.from(bucket).getPublicUrl(filePath)
        .data.publicUrl;
      return { error: null as string | null, url: publicUrl };
    }
    uploadErrorMessage = uploadError.message;
  }

  return {
    error: `Image upload failed (${uploadErrorMessage}). Create the dishes bucket (supabase/migrations/20261008210000_dishes_storage_bucket.sql).`,
    url: null,
  };
}

export async function deleteAdminDish(id: string) {
  const { restaurant, error: authError } = await requireMenuEditorRestaurant();
  if (!restaurant) {
    return { error: authError ?? "No restaurant linked to this account." };
  }
  const supabase = createSupabaseAdminClient();
  let { data, error } = await supabase
    .from("dishes")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .select("id")
    .maybeSingle();

  if ((error && /restaurant_id/i.test(error.message)) || (!error && !data)) {
    const existing = await supabase
      .from("dishes")
      .select("id, category_id")
      .eq("id", id)
      .maybeSingle();
    if (existing.data?.category_id) {
      const owned = await supabase
        .from("categories")
        .select("id")
        .eq("id", existing.data.category_id)
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();
      if (owned.data) {
        const retry = await supabase
          .from("dishes")
          .delete()
          .eq("id", id)
          .select("id")
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      }
    }
  }

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Dish not found." };
  }

  invalidateWaiterMenu(restaurant.id);
  revalidatePath("/admin/menu");
  revalidatePath("/menu", "layout");
  return { error: null };
}

export type KitchenTicketItem = {
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note?: string;
  batch?: number;
  added_at?: string;
  pour?: "glass" | "bottle";
};

export type KitchenTicket = {
  id: string;
  restaurant_id: string;
  table_id: string;
  status: string;
  total_amount: number;
  created_at: string;
  items: KitchenTicketItem[];
};

function parseTicketItems(raw: unknown): KitchenTicketItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const note = String(row.note ?? "").trim().slice(0, 200);
      const batch = Math.floor(Number(row.batch) || 0);
      const addedAt = String(row.added_at ?? "").trim();
      const addedMs = Date.parse(addedAt);
      const pour = parseDrinkPour(row.pour);
      return {
        dish_id: String(row.dish_id ?? ""),
        name: String(row.name ?? "Item"),
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        ...(note ? { note } : {}),
        ...(batch >= 1 ? { batch } : {}),
        ...(Number.isFinite(addedMs) ? { added_at: new Date(addedMs).toISOString() } : {}),
        ...(pour ? { pour } : {}),
      };
    })
    .filter((item) => item.quantity > 0);
}

export type WaiterCallAlert = {
  id: string;
  restaurant_id: string;
  table_id: string;
  table_number: string;
  items: KitchenTicketItem[];
  status: string;
  call_type: WaiterCallType | null;
  created_at: string;
  ready_at?: string | null;
};

function parseCallItems(raw: unknown): KitchenTicketItem[] {
  return parseTicketItems(raw);
}

export async function loadKitchenOrders() {
  await requireAdminUser();
  const ctx = await requireTenantRestaurant();
  const restaurant = ctx.restaurant ?? (await getActiveRestaurant());
  if (!restaurant) {
    return {
      restaurant: null,
      waiterCalls: [] as WaiterCallAlert[],
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await selectWaiterCalls(supabase, restaurant.id);

  if (error) {
    return { restaurant, waiterCalls: [] as WaiterCallAlert[] };
  }

  const waiterCalls = (data ?? []).map((row) => {
    const call = row as Omit<WaiterCallAlert, "items" | "call_type"> & {
      items: unknown;
      call_type?: unknown;
    };
    const status = String(call.status ?? "open").toLowerCase();
    const normalized =
      status === "accepted" || status === "completed" || status === "ready" || status === "served"
        ? "acknowledged"
        : String(call.status ?? "open");
    return {
      ...call,
      status: normalized,
      items: parseCallItems(call.items),
      call_type: parseWaiterCallType(call.call_type),
    };
  });

  return {
    restaurant,
    waiterCalls: filterKitchenOrderTickets(waiterCalls),
  };
}

export async function loadShiftNotes(restaurantId: string) {
  await requireAdminUser();
  const restaurant = await getActiveRestaurant();
  if (!restaurant || (restaurantId && restaurant.id !== restaurantId)) {
    return [] as ShiftNote[];
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await selectShiftNotes(supabase, restaurant.id);

  if (error) return [] as ShiftNote[];
  return (data ?? []).map((row) => toShiftNote(row as Record<string, unknown>));
}

export async function loadAdminBranding() {
  await requireAdminUser();
  const restaurant = await getActiveRestaurant();
  if (!restaurant) return { restaurant };
  const supabase = createSupabaseAdminClient();
  const extra = await supabase
    .from("restaurants")
    .select("hours_enabled, hours_open, hours_close")
    .eq("id", restaurant.id)
    .maybeSingle();
  const place = await supabase
    .from("restaurants")
    .select("latitude, longitude, customization_extra_minutes")
    .eq("id", restaurant.id)
    .maybeSingle();
  return {
    restaurant: {
      ...restaurant,
      ...(extra.error || !extra.data ? {} : extra.data),
      ...(place.error || !place.data ? {} : place.data),
    },
  };
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function brandingTheme(formData: FormData) {
  const { fontId } = parseStoredFontAndColors(
    String(formData.get("font") ?? DEFAULT_BRAND.font),
  );
  const primary_color = normalizeHex(
    String(formData.get("primary_color") ?? ""),
    DEFAULT_BRAND.primary_color,
  );
  const secondary_color = normalizeHex(
    String(formData.get("secondary_color") ?? ""),
    DEFAULT_BRAND.secondary_color,
  );
  const bg_color = normalizeHex(
    String(formData.get("bg_color") ?? ""),
    DEFAULT_BRAND.bg_color,
  );
  const auto = autoBrandPalette({
    primary_color,
    secondary_color,
    bg_color,
  });

  const serializedFont = serializeFontAndColors(
    BRAND_FONTS.some((item) => item.id === fontId) ? fontId : DEFAULT_BRAND.font,
    {
      text_color: normalizeHex(
        String(formData.get("text_color") ?? ""),
        auto.text_color,
      ),
      muted_text_color: normalizeHex(
        String(formData.get("muted_text_color") ?? ""),
        auto.muted_text_color,
      ),
      primary_text_color: normalizeHex(
        String(formData.get("primary_text_color") ?? ""),
        auto.primary_text_color,
      ),
      secondary_text_color: normalizeHex(
        String(formData.get("secondary_text_color") ?? ""),
        auto.secondary_text_color,
      ),
      price_color: normalizeHex(
        String(formData.get("price_color") ?? ""),
        auto.price_color,
      ),
      card_color: normalizeHex(
        String(formData.get("card_color") ?? ""),
        auto.card_color,
      ),
      border_color: normalizeHex(
        String(formData.get("border_color") ?? ""),
        auto.border_color,
      ),
    },
  );

  return {
    primary_color,
    secondary_color,
    bg_color,
    font: serializedFont,
  };
}

function parsePublicHttpUrl(raw: string, invalidMessage: string, protocolMessage: string) {
  if (!raw) return { url: null as string | null, error: null as string | null };
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { url: null, error: protocolMessage };
    }
    return { url: parsed.toString(), error: null };
  } catch {
    return { url: null, error: invalidMessage };
  }
}

async function storeBrandingLogo(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  restaurantId: string,
  currentLogo: string | null,
  formData: FormData,
) {
  const file = formData.get("logo") as File | null;
  if (file && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) {
      return { logoUrl: currentLogo, error: "Logo must be 2 MB or smaller." };
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "");
    const ext = safeName.includes(".")
      ? safeName.slice(safeName.lastIndexOf(".") + 1).toLowerCase()
      : "png";
    const path = `${restaurantId}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("branding")
      .upload(path, bytes, {
        contentType: file.type || "image/png",
        upsert: true,
      });
    if (uploadError) {
      return {
        logoUrl: currentLogo,
        error: `Logo upload failed (${uploadError.message}). Run supabase/restaurant-branding.sql to create the branding bucket, or paste a logo URL instead.`,
      };
    }
    return {
      logoUrl: supabase.storage.from("branding").getPublicUrl(path).data.publicUrl,
      error: null,
    };
  }
  const pasted = String(formData.get("logo_url") ?? "").trim();
  return { logoUrl: pasted || currentLogo, error: null };
}

function isMissingBrandColumn(message: string) {
  const lower = message.toLowerCase();
  return (
    (lower.includes("column") || lower.includes("schema cache")) &&
    (lower.includes("google_review_url") ||
      lower.includes("google_maps_review_url") ||
      lower.includes("service_fee_percent") ||
      lower.includes("hours_enabled") ||
      lower.includes("hours_open") ||
      lower.includes("hours_close") ||
      lower.includes("latitude") ||
      lower.includes("longitude") ||
      lower.includes("customization_extra_minutes"))
  );
}

function missingBrandKeys(message: string) {
  const lower = message.toLowerCase();
  const keys: Array<
    | "google_review_url"
    | "google_maps_review_url"
    | "service_fee_percent"
    | "hours_enabled"
    | "hours_open"
    | "hours_close"
    | "latitude"
    | "longitude"
    | "customization_extra_minutes"
  > = [];
  if (lower.includes("google_review_url") || lower.includes("google_maps_review_url")) {
    keys.push("google_review_url", "google_maps_review_url");
  }
  if (lower.includes("service_fee_percent")) keys.push("service_fee_percent");
  if (
    lower.includes("hours_enabled") ||
    lower.includes("hours_open") ||
    lower.includes("hours_close")
  ) {
    keys.push("hours_enabled", "hours_open", "hours_close");
  }
  if (lower.includes("latitude")) keys.push("latitude");
  if (lower.includes("longitude")) keys.push("longitude");
  if (lower.includes("customization_extra_minutes")) {
    keys.push("customization_extra_minutes");
  }
  return keys;
}

function parseCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function parseExtraMinutes(value: FormDataEntryValue | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.min(30, Math.max(0, Math.round(number)));
}

export async function saveRestaurantBranding(formData: FormData) {
  const access = await requireTenantRestaurant();
  if (!access.user) return { error: "Unauthorized." };
  if (access.staffRole !== "owner") {
    return { error: "Only the restaurant owner can change branding." };
  }
  const restaurant = access.restaurant;
  if (!restaurant) {
    return { error: "No restaurant found in Supabase." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Restaurant name is required." };
  const slug = slugifyRestaurant(String(formData.get("slug") ?? "").trim() || name);
  if (!slug) {
    return { error: "Slug must contain at least one Latin letter or number." };
  }

  const theme = brandingTheme(formData);
  const supabase = createSupabaseAdminClient();
  const { data: slugTaken } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .neq("id", restaurant.id)
    .maybeSingle();
  if (slugTaken) {
    return { error: "That slug is already used by another restaurant." };
  }

  const logo = await storeBrandingLogo(
    supabase,
    restaurant.id,
    restaurantLogo(restaurant),
    formData,
  );
  if (logo.error) return { error: logo.error };

  const review = parsePublicHttpUrl(
    String(
      formData.get("google_maps_review_url") ??
        formData.get("google_review_url") ??
        "",
    ).trim(),
    "Enter a valid Google Review URL.",
    "Google Review URL must start with http:// or https://.",
  );
  if (review.error) return { error: review.error };

  const feeRaw = Number(formData.get("service_fee_percent"));
  const hoursFlag = String(formData.get("hours_enabled") ?? "")
    .trim()
    .toLowerCase();
  const payload = {
    name,
    slug,
    logo: logo.logoUrl,
    logo_url: logo.logoUrl,
    ...theme,
    google_review_url: review.url,
    google_maps_review_url: review.url,
    service_fee_percent: Number.isFinite(feeRaw)
      ? Math.min(100, Math.max(0, feeRaw))
      : 0,
    hours_enabled: hoursFlag === "true" || hoursFlag === "on" || hoursFlag === "1",
    hours_open: formatHourClock(String(formData.get("hours_open") ?? "")) || null,
    hours_close: formatHourClock(String(formData.get("hours_close") ?? "")) || null,
    latitude: parseCoordinate(formData.get("latitude"), -90, 90),
    longitude: parseCoordinate(formData.get("longitude"), -180, 180),
    customization_extra_minutes: parseExtraMinutes(
      formData.get("customization_extra_minutes"),
    ),
  };

  const { error } = await supabase
    .from("restaurants")
    .update(payload)
    .eq("id", restaurant.id);

  if (error) {
    if (!isMissingBrandColumn(error.message)) return { error: error.message };
    const retry = await supabase
      .from("restaurants")
      .update(omitKeys(payload, missingBrandKeys(error.message)))
      .eq("id", restaurant.id);
    if (retry.error) {
      if (!isMissingBrandColumn(retry.error.message)) {
        return { error: retry.error.message };
      }
      const second = await supabase
        .from("restaurants")
        .update(
          omitKeys(payload, [
            ...missingBrandKeys(error.message),
            ...missingBrandKeys(retry.error.message),
          ]),
        )
        .eq("id", restaurant.id);
      if (second.error) return { error: second.error.message };
    }
  }

  invalidateWaiterRestaurant(restaurant.id);
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tables");
  revalidatePath("/menu", "layout");
  revalidateTag(TENANT_CACHE_TAG, "max");
  return { error: null };
}
