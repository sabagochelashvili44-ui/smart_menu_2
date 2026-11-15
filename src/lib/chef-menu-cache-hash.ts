import { createHash } from "crypto";
import type { AssistantDish } from "@/lib/ai-assistant";

/** Warn threshold for chef turn latency logs (ms). */
export const CHEF_SLOW_RESPONSE_MS = 8_000;

function priceToken(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return value.toFixed(2);
}

function listToken(values: string[] | null | undefined) {
  return (values ?? [])
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
}

/**
 * Content hash for Gemini menu cache entries.
 * Price, pour prices, availability, copy, and allergen/ingredient lists all
 * participate so admin edits cannot silently reuse a stale remote cache.
 */
export function hashChefMenuCache(input: {
  restaurantName: string;
  serviceFeePercent: number;
  dishes: AssistantDish[];
}) {
  const rows = input.dishes
    .map((dish) =>
      [
        String(dish.id ?? "").trim(),
        String(dish.name ?? "").trim(),
        String(dish.name_en ?? "").trim(),
        String(dish.name_ru ?? "").trim(),
        String(dish.description ?? "").trim(),
        String(dish.description_en ?? "").trim(),
        String(dish.description_ru ?? "").trim(),
        priceToken(dish.price),
        priceToken(dish.bottle_price),
        priceToken(dish.glass_price),
        dish.is_available === false ? "0" : "1",
        listToken(dish.ingredients ?? null),
        listToken(dish.allergens ?? null),
        listToken(
          (dish.pairing_dish_ids ?? []).map((id) => String(id ?? "").trim()),
        ),
      ].join("|"),
    )
    .sort();
  return createHash("sha256")
    .update(
      [
        input.restaurantName.trim(),
        String(Math.max(0, Math.min(100, Number(input.serviceFeePercent) || 0))),
        ...rows,
      ].join("\n"),
    )
    .digest("hex");
}
