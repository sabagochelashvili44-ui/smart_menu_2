import type { SupabaseClient } from "@supabase/supabase-js";

export const RECIPE_UNITS = ["g", "ml", "pcs"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export type AdminIngredient = {
  id: string;
  name: string;
  unit: RecipeUnit;
  cost_per_unit: number;
  stock_qty: number;
};

export type AdminRecipeLine = {
  ingredient_id: string;
  name: string;
  unit: RecipeUnit;
  quantity: number;
  cost_per_unit: number;
  stock_qty: number;
};

export type RecipeInputLine = {
  name: string;
  unit: string;
  quantity: number;
  cost_per_unit?: number | null;
  stock_qty?: number | null;
};

function isMissingRecipeTable(message: string) {
  return /ingredients|dish_recipes|inventory_movements|sold_dishes|schema cache|does not exist|could not find the/i.test(
    message,
  );
}

export function isRecipeUnit(value: string): value is RecipeUnit {
  return (RECIPE_UNITS as readonly string[]).includes(value);
}

function recipeKey(name: string, unit: string) {
  return `${name.trim().toLowerCase()}|${unit}`;
}

export function normalizeRecipeInput(lines: RecipeInputLine[] | undefined) {
  if (!lines?.length) return [];
  const merged = new Map<string, RecipeInputLine>();
  for (const line of lines) {
    const name = String(line.name ?? "").trim();
    const unit = String(line.unit ?? "").trim();
    const quantity = Number(line.quantity);
    if (!name || !isRecipeUnit(unit) || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    const key = recipeKey(name, unit);
    const current = merged.get(key);
    if (current) {
      current.quantity += quantity;
      continue;
    }
    merged.set(key, {
      name,
      unit,
      quantity,
      cost_per_unit: line.cost_per_unit,
      stock_qty: line.stock_qty,
    });
  }
  return [...merged.values()];
}

function toIngredient(row: Record<string, unknown>): AdminIngredient | null {
  const unit = String(row.unit ?? "");
  if (!isRecipeUnit(unit)) return null;
  const id = String(row.id ?? "");
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    unit,
    cost_per_unit: Number(row.cost_per_unit) || 0,
    stock_qty: Number(row.stock_qty) || 0,
  };
}

export async function loadRestaurantIngredients(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<AdminIngredient[]> {
  const result = await supabase
    .from("ingredients")
    .select("id, name, unit, cost_per_unit, stock_qty")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (result.error) {
    if (isMissingRecipeTable(result.error.message)) return [];
    throw new Error(result.error.message);
  }
  return ((result.data ?? []) as Record<string, unknown>[])
    .map(toIngredient)
    .filter((row): row is AdminIngredient => Boolean(row));
}

export async function loadDishRecipes(
  supabase: SupabaseClient,
  dishIds: string[],
  catalog: AdminIngredient[],
): Promise<Map<string, AdminRecipeLine[]>> {
  const byDish = new Map<string, AdminRecipeLine[]>();
  if (!dishIds.length) return byDish;
  const result = await supabase
    .from("dish_recipes")
    .select("dish_id, ingredient_id, quantity")
    .in("dish_id", dishIds);
  if (result.error) {
    if (isMissingRecipeTable(result.error.message)) return byDish;
    throw new Error(result.error.message);
  }
  const byId = new Map(catalog.map((row) => [row.id, row]));
  for (const raw of result.data ?? []) {
    const row = raw as Record<string, unknown>;
    const dishId = String(row.dish_id ?? "");
    const ingredient = byId.get(String(row.ingredient_id ?? ""));
    const quantity = Number(row.quantity);
    if (!dishId || !ingredient || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    const list = byDish.get(dishId) ?? [];
    list.push({
      ingredient_id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity,
      cost_per_unit: ingredient.cost_per_unit,
      stock_qty: ingredient.stock_qty,
    });
    byDish.set(dishId, list);
  }
  return byDish;
}

async function upsertIngredient(
  supabase: SupabaseClient,
  restaurantId: string,
  catalog: AdminIngredient[],
  line: RecipeInputLine,
): Promise<AdminIngredient | null> {
  const unit = line.unit as RecipeUnit;
  const key = recipeKey(line.name, unit);
  const existing = catalog.find((row) => recipeKey(row.name, row.unit) === key);
  const cost =
    line.cost_per_unit === undefined || line.cost_per_unit === null
      ? existing?.cost_per_unit ?? 0
      : Math.max(0, Number(line.cost_per_unit) || 0);
  const stock =
    line.stock_qty === undefined || line.stock_qty === null
      ? existing?.stock_qty ?? 0
      : Number(line.stock_qty) || 0;

  if (existing) {
    const patch: Record<string, number> = {};
    if (line.cost_per_unit !== undefined && line.cost_per_unit !== null) {
      patch.cost_per_unit = cost;
    }
    if (line.stock_qty !== undefined && line.stock_qty !== null) {
      patch.stock_qty = stock;
    }
    if (Object.keys(patch).length) {
      const updated = await supabase
        .from("ingredients")
        .update(patch)
        .eq("id", existing.id)
        .eq("restaurant_id", restaurantId)
        .select("id, name, unit, cost_per_unit, stock_qty")
        .maybeSingle();
      if (updated.error) {
        if (isMissingRecipeTable(updated.error.message)) return null;
        throw new Error(updated.error.message);
      }
      const next = updated.data
        ? toIngredient(updated.data as Record<string, unknown>)
        : existing;
      if (next) {
        const index = catalog.findIndex((row) => row.id === existing.id);
        if (index >= 0) catalog[index] = next;
        return next;
      }
    }
    return existing;
  }

  const inserted = await supabase
    .from("ingredients")
    .insert({
      restaurant_id: restaurantId,
      name: line.name,
      unit,
      cost_per_unit: cost,
      stock_qty: stock,
    })
    .select("id, name, unit, cost_per_unit, stock_qty")
    .maybeSingle();
  if (inserted.error) {
    if (isMissingRecipeTable(inserted.error.message)) return null;
    if (/duplicate key|unique constraint|ingredients_restaurant_name_unit_key/i.test(inserted.error.message)) {
      const retry = await loadRestaurantIngredients(supabase, restaurantId);
      catalog.splice(0, catalog.length, ...retry);
      return (
        catalog.find((row) => recipeKey(row.name, row.unit) === recipeKey(line.name, unit)) ??
        null
      );
    }
    throw new Error(inserted.error.message);
  }
  const created = inserted.data
    ? toIngredient(inserted.data as Record<string, unknown>)
    : null;
  if (created) catalog.push(created);
  return created;
}

export async function saveDishRecipe(
  supabase: SupabaseClient,
  restaurantId: string,
  dishId: string,
  lines: RecipeInputLine[] | undefined,
): Promise<AdminRecipeLine[] | null> {
  if (lines === undefined) return null;
  const normalized = normalizeRecipeInput(lines);
  const catalog = await loadRestaurantIngredients(supabase, restaurantId);
  if (!catalog.length && normalized.length === 0) {
    const probe = await supabase
      .from("dish_recipes")
      .select("id")
      .eq("dish_id", dishId)
      .limit(1);
    if (probe.error && isMissingRecipeTable(probe.error.message)) return [];
  }

  const resolved: AdminRecipeLine[] = [];
  for (const line of normalized) {
    const ingredient = await upsertIngredient(
      supabase,
      restaurantId,
      catalog,
      line,
    );
    if (!ingredient) continue;
    resolved.push({
      ingredient_id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: line.quantity,
      cost_per_unit: ingredient.cost_per_unit,
      stock_qty: ingredient.stock_qty,
    });
  }

  const removed = await supabase.from("dish_recipes").delete().eq("dish_id", dishId);
  if (removed.error) {
    if (isMissingRecipeTable(removed.error.message)) return [];
    throw new Error(removed.error.message);
  }

  if (!resolved.length) return [];

  const inserted = await supabase.from("dish_recipes").insert(
    resolved.map((line) => ({
      dish_id: dishId,
      ingredient_id: line.ingredient_id,
      quantity: line.quantity,
    })),
  );
  if (inserted.error) {
    if (isMissingRecipeTable(inserted.error.message)) return [];
    throw new Error(inserted.error.message);
  }
  return resolved;
}

export function isMissingRecipeSchema(error: { message: string } | null) {
  return Boolean(error && isMissingRecipeTable(error.message));
}
