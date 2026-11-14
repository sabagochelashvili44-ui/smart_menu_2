import { parseDrinkPour, type DrinkPour } from "@/lib/menu-lane";
import { isServiceFeeItem } from "@/lib/service-fee";

export type WaiterCallLine = {
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note?: string;
  /** 1 is the first send. Later numbers are additions on the same ticket. */
  batch?: number;
  /** Set when this line was sent to kitchen. Newest batch restarts the timer. */
  added_at?: string;
  /** Bar serving. Kitchen dishes omit this. */
  pour?: DrinkPour;
};

function parseAddedAt(raw: unknown): string | undefined {
  const iso = String(raw ?? "").trim();
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function foodBatch(item: { batch?: number }) {
  return item.batch && item.batch > 0 ? item.batch : 1;
}

export function stampAddedAt<T extends { added_at?: string }>(
  items: T[],
  at = new Date().toISOString(),
): T[] {
  return items.map((item) => ({ ...item, added_at: at }));
}

export function kitchenTimerAt(
  createdAt: string,
  items: Array<{ batch?: number; added_at?: string; dish_id?: string }>,
): string {
  const food = items.filter((item) => !isServiceFeeItem(item));
  const newest = food.reduce((max, item) => Math.max(max, foodBatch(item)), 1);
  if (newest <= 1) return createdAt;
  let latest = "";
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const item of food) {
    if (foodBatch(item) !== newest) continue;
    const ms = Date.parse(item.added_at ?? "");
    if (!Number.isFinite(ms) || ms < latestMs) continue;
    latestMs = ms;
    latest = item.added_at ?? "";
  }
  return latest || createdAt;
}

export function sanitizeWaiterCallItems(raw: unknown): WaiterCallLine[] | null {
  if (!Array.isArray(raw)) return null;
  const lines: WaiterCallLine[] = [];
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const quantity = Math.min(99, Math.max(0, Math.floor(Number(row.quantity) || 0)));
    if (quantity < 1) continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const note = String(row.note ?? "").trim().slice(0, 200);
    const batch = Math.floor(Number(row.batch) || 0);
    const addedAt = parseAddedAt(row.added_at);
    const pour = parseDrinkPour(row.pour);
    lines.push({
      dish_id: String(row.dish_id ?? "").trim(),
      name,
      quantity,
      unit_price: Math.max(0, Number(row.unit_price) || 0),
      ...(note ? { note } : {}),
      ...(batch >= 1 && batch <= 99 ? { batch } : {}),
      ...(addedAt ? { added_at: addedAt } : {}),
      ...(pour ? { pour } : {}),
    });
  }
  return lines;
}

export function waiterCallItemsTotal(items: WaiterCallLine[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}
