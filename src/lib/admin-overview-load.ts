import { loadRestaurantAnalyticsContext, snapshotForWindow } from "@/lib/admin-analytics-load";
import {
  callsForLane,
  computeCategoryRevenueSplit,
  computeHourlyAcknowledgedOrders,
  computeTodayReviews,
  countPendingBreakdown,
  reviewBreakdown,
  reviewsForLane,
  type CategoryLaneMeta,
  type OverviewLane,
} from "@/lib/overview-ops";
import {
  operatingWindow,
  restaurantHoursLabel,
  type RestaurantHours,
} from "@/lib/opening-hours";
import {
  type OverviewLaneSnapshot,
  type OverviewSnapshot,
} from "@/lib/overview-types";
import { SALE_SESSION_MS } from "@/lib/sales-metrics";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function loadRestaurantHours(restaurantId: string): Promise<RestaurantHours> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("hours_enabled, hours_open, hours_close")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error || !data) return {};
  return data as RestaurantHours;
}

async function loadCategoryLanes(restaurantId: string): Promise<CategoryLaneMeta[]> {
  const supabase = createSupabaseAdminClient();
  const full = await supabase
    .from("categories")
    .select("id, name, station, menu_role")
    .eq("restaurant_id", restaurantId);
  if (!full.error) {
    return ((full.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      station: String(row.station ?? ""),
      menu_role: String(row.menu_role ?? ""),
    }));
  }
  const basic = await supabase
    .from("categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId);
  return ((basic.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    station: "",
    menu_role: "",
  }));
}

function laneSnapshot(
  context: Awaited<ReturnType<typeof loadRestaurantAnalyticsContext>>,
  categories: CategoryLaneMeta[],
  lane: OverviewLane,
  from: Date,
  to: Date,
): OverviewLaneSnapshot {
  const laneCalls = callsForLane(
    context.waiterCalls,
    context.dishes,
    categories,
    lane,
  );
  const snapshot = snapshotForWindow(
    { ...context, waiterCalls: laneCalls },
    from,
    to,
  );
  const reviews = reviewsForLane(
    computeTodayReviews(context.reviews, context.waiterCalls, from, to),
    laneCalls,
  );
  const pending = countPendingBreakdown(laneCalls, from, to);
  return {
    revenue: snapshot.revenue,
    revenueDishes: snapshot.revenueDishes,
    revenueFee: snapshot.revenueFee,
    orderCount: snapshot.orderCount,
    pendingCalls: pending.pendingCalls,
    pendingOpenedToday: pending.pendingOpenedToday,
    pendingLeftover: pending.pendingLeftover,
    aov: snapshot.aov,
    hourly: computeHourlyAcknowledgedOrders(laneCalls, from, to),
    categories: computeCategoryRevenueSplit(
      laneCalls,
      context.dishes,
      from,
      to,
    ),
    topToday: snapshot.popularDishes
      .filter((row) => row.qty > 0)
      .slice(0, 3)
      .map((row) => ({
      id: row.id,
      name: row.name,
      qty: row.qty,
    })),
    reviewsToday: reviews,
    reviewBreakdown: reviewBreakdown(reviews),
  };
}

export async function loadTodayOverview(
  restaurantId: string,
): Promise<OverviewSnapshot> {
  const hours = await loadRestaurantHours(restaurantId);
  const { from, to } = operatingWindow(hours);
  const [context, categories] = await Promise.all([
    loadRestaurantAnalyticsContext(restaurantId, {
      from: new Date(from.getTime() - SALE_SESSION_MS).toISOString(),
      to: to.toISOString(),
      includeOpen: true,
    }),
    loadCategoryLanes(restaurantId),
  ]);

  return {
    hoursLabel: restaurantHoursLabel(hours) || `${padIso(from)}–${padIso(to)}`,
    windowFrom: from.toISOString(),
    windowTo: to.toISOString(),
    window: "today",
    food: laneSnapshot(context, categories, "food", from, to),
    bar: laneSnapshot(context, categories, "bar", from, to),
  };
}

function padIso(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tbilisi",
  });
}
