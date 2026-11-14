import { parseAnalyticsItems } from "@/lib/ai/analytics";
import type { AssistantDish } from "@/lib/ai-assistant";
import { isDishSaleItem } from "@/lib/dish-analytics";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const POPULARITY_TTL_MS = 60_000;
const popularityCache = new Map<
  string,
  { expiresAt: number; counts: Map<string, number>; popularKeys: Set<string> }
>();

async function loadPopularityForRestaurant(restaurantId: string) {
  const now = Date.now();
  const cached = popularityCache.get(restaurantId);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const counts = new Map<string, number>();
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("waiter_calls")
      .select("items, status")
      .eq("restaurant_id", restaurantId)
      .in("status", ["acknowledged", "completed", "accepted"])
      .limit(300);
    if (!error) {
      for (const row of data ?? []) {
        const call = row as { items?: unknown };
        for (const item of parseAnalyticsItems(call.items)) {
          if (!isDishSaleItem(item)) continue;
          const keys = [item.dish_id, item.name].filter(Boolean);
          for (const key of keys) {
            counts.set(key, (counts.get(key) ?? 0) + item.quantity);
          }
        }
      }
    }
  } catch {
    // Live counts are optional; keep payload dishes as-is.
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const popularKeys = new Set(ranked.slice(0, 3).map(([key]) => key));
  const entry = {
    expiresAt: now + POPULARITY_TTL_MS,
    counts,
    popularKeys,
  };
  popularityCache.set(restaurantId, entry);
  return entry;
}

export async function enrichDishesWithPopularity(
  restaurantId: string | undefined,
  dishes: AssistantDish[],
) {
  if (!restaurantId || !dishes.length) return dishes;

  const { counts, popularKeys } =
    await loadPopularityForRestaurant(restaurantId);

  return dishes.map((dish) => {
    const fromOrders =
      counts.get(dish.id ?? "") ?? counts.get(dish.name ?? "") ?? 0;
    const orderCount = Math.max(fromOrders, Number(dish.order_count) || 0);
    return {
      ...dish,
      order_count: orderCount,
      is_popular: Boolean(
        dish.is_popular ||
          popularKeys.has(dish.id ?? "") ||
          popularKeys.has(dish.name ?? ""),
      ),
    };
  });
}
