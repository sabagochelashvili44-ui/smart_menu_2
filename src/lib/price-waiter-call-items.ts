import "server-only";

import { ui } from "@/lib/menu-copy";
import { isUuid } from "@/lib/restaurant-brand";
import {
  isServiceFeeItem,
  parseServiceFeePercent,
  syncServiceFeeLine,
} from "@/lib/service-fee";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { parseMoney, priceForPour } from "@/lib/menu-lane";
import {
  sanitizeWaiterCallItems,
  type WaiterCallLine,
} from "@/lib/waiter-call-items";

const MAX_LINES = 30;

type PricedDish = {
  id: string;
  name: string;
  price: number;
  bottle_price: number | null;
  glass_price: number | null;
  is_available: boolean;
};

function mapDish(row: Record<string, unknown>): PricedDish {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    price: Math.max(0, Number(row.price) || 0),
    bottle_price: parseMoney(row.bottle_price),
    glass_price: parseMoney(row.glass_price),
    is_available: row.is_available !== false,
  };
}

async function loadPricedDishes(restaurantId: string, dishIds: string[]) {
  if (!isUuid(restaurantId) || dishIds.length === 0) return [] as PricedDish[];
  const supabase = createSupabaseAdminClient();
  const selectPour = "id, name, price, bottle_price, glass_price, is_available, restaurant_id";
  const selectCore = "id, name, price, is_available, restaurant_id";
  const byRestaurant = await supabase
    .from("dishes")
    .select(selectPour)
    .eq("restaurant_id", restaurantId)
    .in("id", dishIds);

  if (!byRestaurant.error) {
    return ((byRestaurant.data ?? []) as Record<string, unknown>[]).map(mapDish);
  }

  if (/bottle_price|glass_price/i.test(byRestaurant.error.message)) {
    const withoutPour = await supabase
      .from("dishes")
      .select(selectCore)
      .eq("restaurant_id", restaurantId)
      .in("id", dishIds);
    if (!withoutPour.error) {
      return ((withoutPour.data ?? []) as Record<string, unknown>[]).map(mapDish);
    }
  }

  if (!/restaurant_id/i.test(byRestaurant.error.message)) {
    return [] as PricedDish[];
  }

  const categories = await supabase
    .from("categories")
    .select("id")
    .eq("restaurant_id", restaurantId);
  const categoryIds = (categories.data ?? []).map((row) => String(row.id));
  if (categoryIds.length === 0) return [] as PricedDish[];

  const byCategory = await supabase
    .from("dishes")
    .select("id, name, price, bottle_price, glass_price, is_available, category_id")
    .in("category_id", categoryIds)
    .in("id", dishIds);
  if (!byCategory.error) {
    return ((byCategory.data ?? []) as Record<string, unknown>[]).map(mapDish);
  }
  if (/bottle_price|glass_price/i.test(byCategory.error.message)) {
    const withoutPour = await supabase
      .from("dishes")
      .select("id, name, price, is_available, category_id")
      .in("category_id", categoryIds)
      .in("id", dishIds);
    if (withoutPour.error) return [] as PricedDish[];
    return ((withoutPour.data ?? []) as Record<string, unknown>[]).map(mapDish);
  }
  return [] as PricedDish[];
}

async function loadServiceFeePercent(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("restaurants")
    .select("service_fee_percent")
    .eq("id", restaurantId)
    .maybeSingle();
  return parseServiceFeePercent(data?.service_fee_percent);
}

export async function priceWaiterCallItems(
  restaurantId: string,
  rawItems: unknown,
  options: { allowUnavailable?: boolean } = {},
): Promise<WaiterCallLine[]> {
  const sanitized = (sanitizeWaiterCallItems(rawItems) ?? [])
    .filter((item) => !isServiceFeeItem(item))
    .slice(0, MAX_LINES);

  const dishIds = [
    ...new Set(sanitized.map((item) => item.dish_id).filter((id) => isUuid(id))),
  ];
  const dishes = await loadPricedDishes(restaurantId, dishIds);
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));

  const lines: WaiterCallLine[] = [];
  for (const item of sanitized) {
    const dish = byId.get(item.dish_id);
    if (!dish?.name) continue;
    if (!options.allowUnavailable && !dish.is_available) continue;
    lines.push({
      dish_id: dish.id,
      name: dish.name,
      quantity: item.quantity,
      unit_price: priceForPour(dish, item.pour),
      ...(item.note ? { note: item.note } : {}),
      ...(item.batch && item.batch >= 1 ? { batch: item.batch } : {}),
      ...(item.added_at ? { added_at: item.added_at } : {}),
      ...(item.pour ? { pour: item.pour } : {}),
    });
  }

  const percent = await loadServiceFeePercent(restaurantId);
  return syncServiceFeeLine(lines, percent, ui.ka.serviceFee(percent));
}
