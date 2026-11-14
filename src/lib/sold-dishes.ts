import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRecipeSchema } from "@/lib/dish-recipes";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type IngredientUseRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
};

const PAGE_SIZE = 1000;

function roundQty(value: number) {
  return Number(value.toFixed(3));
}

async function pageRows(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await loadPage(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const chunk = (data ?? []) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

export async function loadIngredientUse(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<IngredientUseRow[]> {
  const supabase = createSupabaseAdminClient();
  const movements = await pageRows((fromIndex, toIndex) =>
    supabase
      .from("inventory_movements")
      .select("ingredient_id, quantity, created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .range(fromIndex, toIndex),
  );

  if (movements.error) {
    if (isMissingRecipeSchema(movements.error)) {
      return loadIngredientUseFromSold(supabase, restaurantId, from, to);
    }
    throw new Error(movements.error.message);
  }

  const totals = new Map<string, number>();
  for (const raw of movements.data) {
    const id = String(raw.ingredient_id ?? "");
    const quantity = Number(raw.quantity);
    if (!id || !(quantity > 0)) continue;
    totals.set(id, (totals.get(id) ?? 0) + quantity);
  }

  if (!totals.size) {
    return loadIngredientUseFromSold(supabase, restaurantId, from, to);
  }

  return attachIngredientNames(supabase, restaurantId, totals);
}

async function loadIngredientUseFromSold(
  supabase: SupabaseClient,
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<IngredientUseRow[]> {
  const sold = await pageRows((fromIndex, toIndex) =>
    supabase
      .from("sold_dishes")
      .select("dish_id, quantity, sold_at")
      .eq("restaurant_id", restaurantId)
      .gte("sold_at", from.toISOString())
      .lte("sold_at", to.toISOString())
      .range(fromIndex, toIndex),
  );
  if (sold.error) {
    if (isMissingRecipeSchema(sold.error)) return [];
    throw new Error(sold.error.message);
  }
  const soldQty = new Map<string, number>();
  for (const raw of sold.data) {
    const dishId = String(raw.dish_id ?? "");
    const quantity = Number(raw.quantity);
    if (!dishId || !(quantity > 0)) continue;
    soldQty.set(dishId, (soldQty.get(dishId) ?? 0) + quantity);
  }
  if (!soldQty.size) return [];

  const recipes = await supabase
    .from("dish_recipes")
    .select("dish_id, ingredient_id, quantity")
    .in("dish_id", [...soldQty.keys()]);
  if (recipes.error) {
    if (isMissingRecipeSchema(recipes.error)) return [];
    throw new Error(recipes.error.message);
  }

  const totals = new Map<string, number>();
  for (const raw of recipes.data ?? []) {
    const row = raw as {
      dish_id?: string;
      ingredient_id?: string;
      quantity?: number;
    };
    const dishSold = soldQty.get(String(row.dish_id ?? "")) ?? 0;
    const ingredientId = String(row.ingredient_id ?? "");
    const perDish = Number(row.quantity);
    if (!ingredientId || !(dishSold > 0) || !(perDish > 0)) continue;
    totals.set(ingredientId, (totals.get(ingredientId) ?? 0) + perDish * dishSold);
  }
  return attachIngredientNames(supabase, restaurantId, totals);
}

async function attachIngredientNames(
  supabase: SupabaseClient,
  restaurantId: string,
  totals: Map<string, number>,
): Promise<IngredientUseRow[]> {
  if (!totals.size) return [];
  const ingredients = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("restaurant_id", restaurantId)
    .in("id", [...totals.keys()]);
  if (ingredients.error) {
    if (isMissingRecipeSchema(ingredients.error)) return [];
    throw new Error(ingredients.error.message);
  }
  const names = new Map(
    (ingredients.data ?? []).map((row) => {
      const item = row as { id?: string; name?: string; unit?: string };
      return [String(item.id ?? ""), item];
    }),
  );
  return [...totals.entries()]
    .map(([id, quantity]) => {
      const item = names.get(id);
      return {
        id,
        name: String(item?.name ?? id),
        unit: String(item?.unit ?? ""),
        quantity: roundQty(quantity),
      };
    })
    .filter((row) => row.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}
