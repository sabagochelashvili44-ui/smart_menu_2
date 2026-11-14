import type { SupabaseClient } from "@supabase/supabase-js";
import { isDishSaleItem } from "@/lib/dish-analytics";
import { isMissingRecipeSchema } from "@/lib/dish-recipes";
import { sanitizeWaiterCallItems } from "@/lib/waiter-call-items";

function isUniqueViolation(message: string) {
  return /duplicate key|unique constraint|inventory_movements_line_key|sold_dishes_line_key/i.test(
    message,
  );
}

const DISH_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function saleLines(items: unknown) {
  return (sanitizeWaiterCallItems(items) ?? []).filter(
    (item) =>
      isDishSaleItem(item) && DISH_ID_RE.test(item.dish_id),
  );
}

export async function recordSoldDishesForCall(
  supabase: SupabaseClient,
  restaurantId: string,
  call: { id?: string | null; items?: unknown; soldAt?: string },
) {
  const callId = String(call.id ?? "").trim();
  if (!callId) return;
  const dishLines = saleLines(call.items);
  if (!dishLines.length) return;

  const soldAt = call.soldAt || new Date().toISOString();
  const rows = dishLines.map((item) => ({
    restaurant_id: restaurantId,
    waiter_call_id: callId,
    dish_id: item.dish_id,
    dish_name: item.name.slice(0, 200),
    quantity: item.quantity,
    unit_price: item.unit_price,
    batch: item.batch && item.batch >= 1 ? item.batch : 1,
    sold_at: soldAt,
  }));

  const inserted = await supabase.from("sold_dishes").upsert(rows, {
    onConflict: "waiter_call_id,dish_id,batch",
    ignoreDuplicates: true,
  });
  if (inserted.error) {
    if (isMissingRecipeSchema(inserted.error)) return;
    if (isUniqueViolation(inserted.error.message)) return;
    throw new Error(inserted.error.message);
  }
}

export async function deductInventoryForCall(
  supabase: SupabaseClient,
  restaurantId: string,
  call: { id?: string | null; items?: unknown; soldAt?: string },
) {
  await recordSoldDishesForCall(supabase, restaurantId, call);

  const callId = String(call.id ?? "").trim();
  if (!callId) return;
  const dishLines = saleLines(call.items);
  if (!dishLines.length) return;

  const dishIds = [...new Set(dishLines.map((item) => item.dish_id))];
  const recipes = await supabase
    .from("dish_recipes")
    .select("dish_id, ingredient_id, quantity")
    .in("dish_id", dishIds);
  if (recipes.error) {
    if (isMissingRecipeSchema(recipes.error)) return;
    throw new Error(recipes.error.message);
  }

  const owned = await supabase
    .from("ingredients")
    .select("id")
    .eq("restaurant_id", restaurantId);
  if (owned.error) {
    if (isMissingRecipeSchema(owned.error)) return;
    throw new Error(owned.error.message);
  }
  const ownedIds = new Set(
    (owned.data ?? []).map((row) => String((row as { id?: string }).id ?? "")),
  );

  const byDish = new Map<string, Array<{ ingredient_id: string; quantity: number }>>();
  for (const raw of recipes.data ?? []) {
    const row = raw as {
      dish_id?: string;
      ingredient_id?: string;
      quantity?: number;
    };
    const dishId = String(row.dish_id ?? "");
    const ingredientId = String(row.ingredient_id ?? "");
    const quantity = Number(row.quantity);
    if (!dishId || !ownedIds.has(ingredientId) || !(quantity > 0)) continue;
    const list = byDish.get(dishId) ?? [];
    list.push({ ingredient_id: ingredientId, quantity });
    byDish.set(dishId, list);
  }

  for (const item of dishLines) {
    const lines = byDish.get(item.dish_id) ?? [];
    const batch = item.batch && item.batch >= 1 ? item.batch : 1;
    for (const recipe of lines) {
      const delta = recipe.quantity * item.quantity;
      if (!(delta > 0)) continue;
      await deductLine(supabase, {
        restaurantId,
        callId,
        dishId: item.dish_id,
        batch,
        ingredientId: recipe.ingredient_id,
        quantity: delta,
      });
    }
  }
}

async function deductLine(
  supabase: SupabaseClient,
  input: {
    restaurantId: string;
    callId: string;
    dishId: string;
    batch: number;
    ingredientId: string;
    quantity: number;
  },
) {
  const movement = await supabase.from("inventory_movements").insert({
    restaurant_id: input.restaurantId,
    waiter_call_id: input.callId,
    dish_id: input.dishId,
    batch: input.batch,
    ingredient_id: input.ingredientId,
    quantity: input.quantity,
  });
  if (movement.error) {
    if (isMissingRecipeSchema(movement.error)) return;
    if (isUniqueViolation(movement.error.message)) return;
    throw new Error(movement.error.message);
  }

  const current = await supabase
    .from("ingredients")
    .select("stock_qty")
    .eq("id", input.ingredientId)
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();
  if (current.error) {
    if (isMissingRecipeSchema(current.error)) return;
    throw new Error(current.error.message);
  }
  const stock = Number((current.data as { stock_qty?: number } | null)?.stock_qty) || 0;
  const updated = await supabase
    .from("ingredients")
    .update({ stock_qty: stock - input.quantity })
    .eq("id", input.ingredientId)
    .eq("restaurant_id", input.restaurantId);
  if (updated.error) {
    if (isMissingRecipeSchema(updated.error)) return;
    throw new Error(updated.error.message);
  }
}
