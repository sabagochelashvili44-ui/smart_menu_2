import {
  isPendingCall,
  type AnalyticsDish,
  type AnalyticsReview,
  type WaiterCallMetric,
} from "@/lib/ai/analytics";
import {
  isDishSaleItem,
  isRatingAlertCall,
  isRatingAlertItem,
  parseRatingAlert,
} from "@/lib/dish-analytics";
import { isBarCategory, type MenuLane } from "@/lib/menu-lane";
import { RESTAURANT_TZ, isTimestampInRange } from "@/lib/restaurant-day";
import { callSaleStamp, confirmedSalesInWindow } from "@/lib/sales-metrics";

export type OverviewLane = MenuLane;
export { isBarCategory };

export type CategoryLaneMeta = {
  id: string;
  name: string;
  station?: string;
  menu_role?: string;
};

function categoryForDish(
  item: { dish_id?: string; name?: string },
  dishesById: Map<string, AnalyticsDish>,
  dishesByName: Map<string, AnalyticsDish>,
  categoriesById: Map<string, CategoryLaneMeta>,
  categoriesByName: Map<string, CategoryLaneMeta>,
) {
  const dish =
    (item.dish_id ? dishesById.get(item.dish_id) : undefined) ??
    (item.name ? dishesByName.get(item.name) : undefined);
  if (!dish) return undefined;
  return (
    (dish.category_id ? categoriesById.get(dish.category_id) : undefined) ??
    (dish.category ? categoriesByName.get(dish.category) : undefined)
  );
}

export function dishLane(
  item: { dish_id?: string; name?: string },
  dishes: AnalyticsDish[],
  categories: CategoryLaneMeta[],
): OverviewLane {
  const category = categoryForDish(
    item,
    new Map(dishes.map((row) => [row.id, row])),
    new Map(dishes.map((row) => [row.name, row])),
    new Map(categories.map((row) => [row.id, row])),
    new Map(categories.map((row) => [row.name, row])),
  );
  if (category && isBarCategory(category)) return "bar";
  if (isBarCategory({ name: item.name })) return "bar";
  return "food";
}

export function callsForLane(
  calls: WaiterCallMetric[],
  dishes: AnalyticsDish[],
  categories: CategoryLaneMeta[],
  lane: OverviewLane,
): WaiterCallMetric[] {
  const dishesById = new Map(dishes.map((row) => [row.id, row]));
  const dishesByName = new Map(dishes.map((row) => [row.name, row]));
  const categoriesById = new Map(categories.map((row) => [row.id, row]));
  const categoriesByName = new Map(categories.map((row) => [row.name, row]));
  const itemLane = (item: { dish_id?: string; name?: string }): OverviewLane => {
    const category = categoryForDish(
      item,
      dishesById,
      dishesByName,
      categoriesById,
      categoriesByName,
    );
    if (category && isBarCategory(category)) return "bar";
    if (isBarCategory({ name: item.name })) return "bar";
    return "food";
  };

  const next: WaiterCallMetric[] = [];
  for (const call of calls) {
    if (isRatingAlertCall(call)) continue;
    const food = (call.items ?? []).filter((item) => isDishSaleItem(item));
    const matching = food.filter((item) => itemLane(item) === lane);
    if (!matching.length) continue;
    const allTotal = food.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );
    const matchTotal = matching.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );
    const share = allTotal > 0 ? matchTotal / allTotal : 0;
    const fees = (call.items ?? [])
      .filter((item) => !isDishSaleItem(item) && !isRatingAlertItem(item))
      .map((item) => ({
        ...item,
        unit_price: Math.round(item.unit_price * share * 100) / 100,
      }));
    next.push({ ...call, items: [...matching, ...fees] });
  }
  return next;
}

export type HourBucket = {
  hour: number;
  label: string;
  orders: number;
  isPeak: boolean;
};

export type CategoryShare = {
  category: string;
  revenue: number;
  percent: number;
};

function padHour(hour: number) {
  return String(hour).padStart(2, "0");
}

export function hourLabel(hour: number) {
  const next = (hour + 1) % 24;
  return `${padHour(hour)}:00–${padHour(next)}:00`;
}

export function tbilisiHour(iso: string) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESTAURANT_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return Number.parseInt(formatted, 10);
}

export function computeHourlyAcknowledgedOrders(
  calls: WaiterCallMetric[],
  from: Date,
  to: Date,
): HourBucket[] {
  const counts = Array.from({ length: 24 }, () => 0);

  for (const call of confirmedSalesInWindow(calls, from, to)) {
    const stamp = callSaleStamp(call);
    if (!stamp) continue;
    const hour = tbilisiHour(stamp);
    if (hour >= 0 && hour <= 23) counts[hour] += 1;
  }

  const peak = Math.max(0, ...counts);
  return counts
    .map((orders, hour) => ({
      hour,
      label: hourLabel(hour),
      orders,
      isPeak: peak > 0 && orders === peak,
    }))
    .filter((row) => row.orders > 0);
}

export function computeCategoryRevenueSplit(
  calls: WaiterCallMetric[],
  dishes: AnalyticsDish[],
  from: Date,
  to: Date,
): CategoryShare[] {
  const categoryByDishId = new Map(
    dishes.map((dish) => [dish.id, dish.category || dish.category_id || ""]),
  );
  const categoryByName = new Map(
    dishes.map((dish) => [dish.name, dish.category || dish.category_id || ""]),
  );

  const totals: Record<string, number> = {};
  let grand = 0;

  for (const call of confirmedSalesInWindow(calls, from, to)) {
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const amount = item.quantity * item.unit_price;
      if (amount <= 0) continue;
      const category =
        categoryByDishId.get(item.dish_id) ||
        categoryByName.get(item.name) ||
        "";
      const key = category || "__other__";
      totals[key] = (totals[key] ?? 0) + amount;
      grand += amount;
    }
  }

  if (grand <= 0) return [];

  return Object.entries(totals)
    .map(([category, revenue]) => ({
      category,
      revenue,
      percent: Number(((revenue / grand) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function countPendingCalls(calls: WaiterCallMetric[]) {
  return countPendingBreakdown(calls).pendingCalls;
}

export function countPendingBreakdown(
  calls: WaiterCallMetric[],
  from?: Date,
  to?: Date,
) {
  const open = calls.filter(
    (call) => isPendingCall(call.status) && !isRatingAlertCall(call),
  );
  const pendingOpenedToday =
    from && to
      ? open.filter((call) => isTimestampInRange(call.created_at, from, to))
          .length
      : open.length;
  return {
    pendingCalls: open.length,
    pendingOpenedToday,
    pendingLeftover: Math.max(0, open.length - pendingOpenedToday),
  };
}

export type OverviewReviewRow = {
  id: string;
  tableId?: string;
  tableNumber: string;
  rating: number;
  comment: string;
  orderedItems: { name: string; quantity: number }[];
  created_at: string;
};

export function reviewsForLane(
  reviews: OverviewReviewRow[],
  laneCalls: WaiterCallMetric[],
) {
  const tables = new Set<string>();
  for (const call of laneCalls) {
    if (call.table_id) tables.add(`id:${call.table_id}`);
    const number = String(call.table_number ?? "").trim();
    if (number) tables.add(`n:${number}`);
  }
  if (!tables.size) return [];
  return reviews.filter((review) => {
    if (review.tableId && tables.has(`id:${review.tableId}`)) return true;
    if (review.tableNumber && tables.has(`n:${review.tableNumber}`)) return true;
    return !review.tableId && !review.tableNumber;
  });
}

export function reviewBreakdown(reviews: OverviewReviewRow[]) {
  return ([5, 4, 3, 2, 1] as const).map((rating) => ({
    rating,
    count: reviews.filter((review) => review.rating === rating).length,
    reviews: reviews.filter((review) => review.rating === rating),
  }));
}

function dishesOrderedByTable(
  calls: WaiterCallMetric[],
  tableId: string | undefined,
  tableNumber: string,
  from: Date,
  to: Date,
) {
  const qty = new Map<string, { name: string; quantity: number }>();
  for (const call of calls) {
    if (isRatingAlertCall(call)) continue;
    const sameTable =
      (tableId && call.table_id === tableId) ||
      (tableNumber && String(call.table_number ?? "") === tableNumber);
    if (!sameTable) continue;
    if (
      !isTimestampInRange(call.created_at, from, to) &&
      !isTimestampInRange(call.acknowledged_at, from, to)
    ) {
      continue;
    }
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const key = item.dish_id || item.name;
      const current = qty.get(key) ?? { name: item.name, quantity: 0 };
      current.quantity += item.quantity;
      if (item.name) current.name = item.name;
      qty.set(key, current);
    }
  }
  return [...qty.values()].sort((a, b) => b.quantity - a.quantity);
}

function reviewFingerprint(table: string, rating: number, iso: string) {
  const bucket = Math.floor(new Date(iso).getTime() / (10 * 60 * 1000));
  return `${table}|${rating}|${bucket}`;
}

export function computeTodayReviews(
  reviews: AnalyticsReview[],
  calls: WaiterCallMetric[],
  from: Date,
  to: Date,
): OverviewReviewRow[] {
  const rows: OverviewReviewRow[] = [];
  const seen = new Set<string>();

  for (const review of reviews) {
    if (!review.created_at || !isTimestampInRange(review.created_at, from, to)) {
      continue;
    }
    if (review.rating < 1 || review.rating > 5) continue;
    const tableNumber = String(review.table_number ?? "").trim();
    const key = reviewFingerprint(
      tableNumber || review.table_id || review.id || "",
      review.rating,
      review.created_at,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = String(review.feedback ?? "").trim();
    rows.push({
      id: review.id || key,
      tableId: review.table_id,
      tableNumber,
      rating: review.rating,
      comment: raw === "—" || raw === "-" ? "" : raw,
      orderedItems: dishesOrderedByTable(
        calls,
        review.table_id,
        tableNumber,
        from,
        to,
      ),
      created_at: review.created_at,
    });
  }

  for (const call of calls) {
    if (!isRatingAlertCall(call) || !call.created_at) continue;
    if (!isTimestampInRange(call.created_at, from, to)) continue;
    const alertItem =
      call.items.find((item) => !isDishSaleItem(item) && item.name) ??
      call.items[0];
    const parsed = parseRatingAlert(alertItem?.name ?? "");
    const rating = parsed.rating || 1;
    const tableNumber = String(call.table_number ?? "").trim();
    const key = reviewFingerprint(
      tableNumber || call.table_id || call.id || "",
      rating,
      call.created_at,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: call.id || key,
      tableId: call.table_id,
      tableNumber,
      rating,
      comment: parsed.comment,
      orderedItems: dishesOrderedByTable(
        calls,
        call.table_id,
        tableNumber,
        from,
        to,
      ),
      created_at: call.created_at,
    });
  }

  return rows.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
