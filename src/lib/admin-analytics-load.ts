import {
  computeSalesSummary,
  type MenuDishRef,
  type SalesSummary,
} from "@/lib/analytics-summary";
import { comparisonRange, resolveAnalyticsWindow } from "@/lib/analytics-range";
import {
  computeAnalytics,
  parseAnalyticsItems,
  type AnalyticsDish,
  type AnalyticsReview,
  type IntentEvent,
  type WaiterCallMetric,
} from "@/lib/ai/analytics";
import {
  computeMenuReading,
  emptyMenuReading,
  type MenuReadingCategory,
  type MenuReadingDish,
  type MenuReadingReport,
} from "@/lib/menu-reading";
import { isTimestampInRange } from "@/lib/restaurant-day";
import {
  SALE_SESSION_MS,
  callSaleStamp,
  confirmedSalesInWindow,
  isConfirmedSale,
  snapshotCalls,
} from "@/lib/sales-metrics";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  computePeakDemandDishes,
  computeWeekdayAcknowledgedOrders,
  loadOffMenuRequests,
  type DemandPeaksReport,
} from "@/lib/guest-demand";
import { computeHourlyAcknowledgedOrders } from "@/lib/overview-ops";
import {
  loadIngredientUse,
  type IngredientUseRow,
} from "@/lib/sold-dishes";
import { isMissingCallTypeColumn } from "@/lib/waiter-calls-query";

const PAGE_SIZE = 1000;

const INTENT_COLUMNS =
  "dish_id, dish_name, event_type, quantity, unit_price, created_at, session_id, category_id, duration_ms, table_id";
const INTENT_COLUMNS_BASE =
  "dish_id, dish_name, event_type, quantity, unit_price, created_at";

const WAITER_CALL_COLUMNS =
  "id, items, status, created_at, acknowledged_at, table_id, table_number, call_type, acknowledged_by, acknowledged_by_email, ready_at";
const WAITER_CALL_COLUMNS_BASE =
  "id, items, status, created_at, acknowledged_at, table_id, table_number, call_type";
const WAITER_CALL_COLUMNS_LEGACY =
  "id, items, status, created_at, acknowledged_at, table_id, table_number";

function isMissingOpsColumn(error: { message: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("acknowledged_by") ||
    message.includes("ready_at") ||
    message.includes("session_id") ||
    message.includes("duration_ms") ||
    message.includes("category_id")
  );
}

async function fetchAllRows(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
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

function mapWaiterCall(row: Record<string, unknown>): WaiterCallMetric {
  return {
    id: String(row.id),
    table_id: row.table_id ? String(row.table_id) : undefined,
    table_number: String(row.table_number ?? ""),
    call_type: row.call_type ? String(row.call_type) : null,
    items: parseAnalyticsItems(row.items),
    status: String(row.status ?? "open"),
    created_at: row.created_at ? String(row.created_at) : undefined,
    acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
    acknowledged_by: row.acknowledged_by ? String(row.acknowledged_by) : null,
    acknowledged_by_email: row.acknowledged_by_email
      ? String(row.acknowledged_by_email)
      : null,
    ready_at: row.ready_at ? String(row.ready_at) : null,
  };
}

async function pageWaiterCalls(
  restaurantId: string,
  options: {
    column?: "created_at" | "acknowledged_at";
    from?: string;
    to?: string;
    status?: string;
  } = {},
) {
  const supabase = createSupabaseAdminClient();

  const load = async (select: string, start: number, end: number) => {
    let query = supabase
      .from("waiter_calls")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .range(start, end);
    if (options.from && options.column) {
      query = query.gte(options.column, options.from);
    }
    if (options.to && options.column) {
      query = query.lte(options.column, options.to);
    }
    if (options.status) {
      query = query.eq("status", options.status);
    }
    return query;
  };

  const first = await fetchAllRows((start, end) =>
    load(WAITER_CALL_COLUMNS, start, end),
  );
  if (!first.error) return first;
  if (isMissingOpsColumn(first.error)) {
    const base = await fetchAllRows((start, end) =>
      load(WAITER_CALL_COLUMNS_BASE, start, end),
    );
    if (!base.error || !isMissingCallTypeColumn(base.error)) return base;
  }

  if (!isMissingCallTypeColumn(first.error) && !isMissingOpsColumn(first.error)) {
    return first;
  }

  return fetchAllRows((start, end) =>
    load(WAITER_CALL_COLUMNS_LEGACY, start, end),
  );
}

function mergeCallsById(groups: Record<string, unknown>[][]) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row.id ?? "");
      if (id) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

function isMissingIntentTable(error: { message: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the")
  );
}

function mapIntentEvent(row: Record<string, unknown>): IntentEvent {
  return {
    dish_id: String(row.dish_id ?? ""),
    dish_name: String(row.dish_name ?? ""),
    event_type: String(row.event_type ?? ""),
    quantity: Number(row.quantity) || 1,
    unit_price: Number(row.unit_price) || 0,
    duration_ms: Number(row.duration_ms) || 0,
    category_id: row.category_id ? String(row.category_id) : "",
    table_id: row.table_id ? String(row.table_id) : undefined,
    session_id: row.session_id ? String(row.session_id) : "",
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

async function pageIntentEvents(
  restaurantId: string,
  from?: string,
  to?: string,
): Promise<{
  data: Record<string, unknown>[];
  error: { message: string } | null;
  columnsReady: boolean;
}> {
  const supabase = createSupabaseAdminClient();
  const applyWindow = <
    Q extends { gte: (col: string, value: string) => Q; lte: (col: string, value: string) => Q },
  >(
    query: Q,
  ) => {
    let next = query;
    if (from) next = next.gte("created_at", from);
    if (to) next = next.lte("created_at", to);
    return next;
  };

  const full = await fetchAllRows((start, end) =>
    applyWindow(
      supabase
        .from("guest_intent_events")
        .select(INTENT_COLUMNS)
        .eq("restaurant_id", restaurantId),
    ).range(start, end),
  );
  if (!full.error) return { ...full, columnsReady: true };

  if (!isMissingOpsColumn(full.error) && !isMissingIntentTable(full.error)) {
    return { ...full, columnsReady: false };
  }

  const base = await fetchAllRows((start, end) =>
    applyWindow(
      supabase
        .from("guest_intent_events")
        .select(INTENT_COLUMNS_BASE)
        .eq("restaurant_id", restaurantId),
    ).range(start, end),
  );
  if (!base.error) return { ...base, columnsReady: false };
  if (isMissingIntentTable(base.error)) {
    return { data: [], error: null, columnsReady: false };
  }
  return { ...base, columnsReady: false };
}

export async function loadRestaurantAnalyticsContext(
  restaurantId: string,
  options?: {
    createdAtGte?: string;
    createdAtLte?: string;
    from?: string;
    to?: string;
    includeOpen?: boolean;
  },
) {
  const supabase = createSupabaseAdminClient();
  const loadStartedAt = Date.now();
  const from = options?.from ?? options?.createdAtGte;
  const to = options?.to ?? options?.createdAtLte;

  const applyCreatedAt = <
    Q extends { gte: (col: string, value: string) => Q; lte: (col: string, value: string) => Q },
  >(
    query: Q,
  ) => {
    let next = query;
    if (from) next = next.gte("created_at", from);
    if (to) next = next.lte("created_at", to);
    return next;
  };

  const [categoriesResult, createdCalls, ackCalls, openCalls, reviewsPaged, intentPaged, tablesResult] =
    await Promise.all([
      supabase.from("categories").select("id, name").eq("restaurant_id", restaurantId),
      pageWaiterCalls(restaurantId, { column: "created_at", from, to }),
      from || to
        ? pageWaiterCalls(restaurantId, {
            column: "acknowledged_at",
            from,
            to,
          })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      options?.includeOpen
        ? pageWaiterCalls(restaurantId, { status: "open" })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      fetchAllRows(async (start, end) => {
        const query = applyCreatedAt(
          supabase
            .from("reviews")
            .select("id, rating, feedback, created_at, table_id, table_number")
            .eq("restaurant_id", restaurantId),
        ).range(start, end);
        return query;
      }),
      fetchAllRows(async (start, end) => {
        const full = applyCreatedAt(
          supabase.from("guest_intent_events").select(INTENT_COLUMNS).eq("restaurant_id", restaurantId),
        ).range(start, end);
        const result = await full;
        if (!result.error || !isMissingOpsColumn(result.error)) return result;
        return applyCreatedAt(
          supabase
            .from("guest_intent_events")
            .select(INTENT_COLUMNS_BASE)
            .eq("restaurant_id", restaurantId),
        ).range(start, end);
      }),
      supabase
        .from("tables")
        .select("id, table_number")
        .eq("restaurant_id", restaurantId)
        .order("table_number"),
    ]);

  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (createdCalls.error) throw new Error(createdCalls.error.message);
  if (ackCalls.error) throw new Error(ackCalls.error.message);
  if (openCalls.error) throw new Error(openCalls.error.message);

  let reviewsData: Record<string, unknown>[] = reviewsPaged.data;
  if (reviewsPaged.error) {
    const retry = await fetchAllRows((start, end) =>
      supabase
        .from("reviews")
        .select("id, rating, feedback, created_at")
        .eq("restaurant_id", restaurantId)
        .range(start, end),
    );
    reviewsData = retry.error ? [] : retry.data;
  }

  const intentEvents: IntentEvent[] = intentPaged.error
    ? []
    : intentPaged.data.map(mapIntentEvent);

  const categoryRows = (categoriesResult.data ?? []).map((row) => {
    const category = row as Record<string, unknown>;
    return {
      id: String(category.id),
      name: String(category.name ?? ""),
    };
  });
  const categoryIds = categoryRows.map((row) => row.id);
  const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));

  let dishes: AnalyticsDish[] = [];
  if (categoryIds.length > 0) {
    let { data, error } = await supabase
      .from("dishes")
      .select("id, name, price, margin_score, is_available, category_id")
      .in("category_id", categoryIds)
      .eq("restaurant_id", restaurantId);
    if (error) {
      const retry = await supabase
        .from("dishes")
        .select("id, name, price, margin_score, is_available, category_id")
        .in("category_id", categoryIds);
      data = retry.data;
      error = retry.error;
    }
    if (error) throw new Error(error.message);
    dishes = (data ?? []).map((row) => {
      const dish = row as Record<string, unknown>;
      const categoryId = String(dish.category_id ?? "");
      return {
        id: String(dish.id),
        name: String(dish.name ?? "Item"),
        price: Number(dish.price) || 0,
        margin_score: Number(dish.margin_score) || 0,
        is_available: Boolean(dish.is_available),
        category_id: categoryId,
        category: categoryNameById.get(categoryId) ?? "",
      };
    });
  }

  const waiterCalls: WaiterCallMetric[] = mergeCallsById([
    createdCalls.data,
    ackCalls.data,
    openCalls.data,
  ]).map(mapWaiterCall);


  const reviews: AnalyticsReview[] = reviewsData.map((row) => ({
    id: String(row.id ?? ""),
    rating: Number(row.rating) || 0,
    feedback: String(row.feedback ?? ""),
    table_id: row.table_id ? String(row.table_id) : undefined,
    table_number: row.table_number ? String(row.table_number) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));

  const tables = tablesResult.error
    ? []
    : (tablesResult.data ?? []).map((row) => {
        const table = row as Record<string, unknown>;
        return {
          id: String(table.id),
          table_number: String(table.table_number ?? ""),
        };
      });

  return { dishes, reviews, intentEvents, waiterCalls, tables, orderTicketCount: 0 };
}

export function filterCallsForWindow(
  calls: WaiterCallMetric[],
  from: Date,
  to: Date,
) {
  return snapshotCalls(calls, from, to);
}

export function filterIntentForWindow(
  events: IntentEvent[],
  from: Date,
  to: Date,
) {
  return events.filter((event) =>
    isTimestampInRange(event.created_at, from, to),
  );
}

export function snapshotForWindow(
  context: Awaited<ReturnType<typeof loadRestaurantAnalyticsContext>>,
  from: Date,
  to: Date,
) {
  return computeAnalytics({
    dishes: context.dishes,
    reviews: context.reviews.filter((review) =>
      isTimestampInRange(review.created_at, from, to),
    ),
    intentEvents: filterIntentForWindow(context.intentEvents, from, to),
    waiterCalls: snapshotCalls(context.waiterCalls, from, to),
  });
}

/** Same acknowledgement-time window as Overview so Analytics "today" matches. */
export function snapshotForCreatedAtWindow(
  context: Awaited<ReturnType<typeof loadRestaurantAnalyticsContext>>,
  from: Date,
  to: Date,
) {
  return snapshotForWindow(context, from, to);
}

export function salesObservationCycle(
  calls: WaiterCallMetric[],
  now = new Date(),
) {
  return observationFromFirstStamp(
    calls
      .filter((call) => isConfirmedSale(call))
      .map((call) => new Date(callSaleStamp(call) ?? "").getTime()),
    now,
  );
}

function observationFromFirstStamp(times: number[], now: Date) {
  const finite = times.filter((time) => Number.isFinite(time));
  if (!finite.length) {
    return {
      observationReady: false,
      observationDaysElapsed: 0,
      firstAcknowledgedAt: null as string | null,
    };
  }

  const first = Math.min(...finite);
  const elapsedMs = now.getTime() - first;
  const observationReady = elapsedMs >= 7 * 86_400_000;
  const observationDaysElapsed = observationReady
    ? 7
    : Math.min(7, Math.max(1, Math.floor(elapsedMs / 86_400_000) + 1));

  return {
    observationReady,
    observationDaysElapsed,
    firstAcknowledgedAt: new Date(first).toISOString(),
  };
}

async function firstConfirmedStamp(
  restaurantId: string,
  orderColumn: "acknowledged_at" | "created_at",
  requireAck: boolean,
) {
  const supabase = createSupabaseAdminClient();
  const page = 80;
  const selects = [
    WAITER_CALL_COLUMNS,
    WAITER_CALL_COLUMNS_BASE,
    WAITER_CALL_COLUMNS_LEGACY,
  ];
  let selectIndex = 0;

  for (let offset = 0; offset < 4000; offset += page) {
    let rows: unknown[] | null = null;
    let error: { message: string } | null = null;
    for (let index = selectIndex; index < selects.length; index += 1) {
      const select = selects[index];
      let pageQuery = supabase
        .from("waiter_calls")
        .select(select)
        .eq("restaurant_id", restaurantId)
        .in("status", ["acknowledged", "completed"])
        .order(orderColumn, { ascending: true, nullsFirst: false })
        .range(offset, offset + page - 1);
      if (requireAck) {
        pageQuery = pageQuery.not("acknowledged_at", "is", null);
      }
      const result = await pageQuery;
      rows = (result.data ?? null) as unknown[] | null;
      error = result.error;
      if (!error) {
        selectIndex = index;
        break;
      }
      const retryable =
        isMissingOpsColumn(error) || isMissingCallTypeColumn(error);
      if (!retryable) break;
    }
    if (error) throw new Error(error.message);

    const pageRows = rows ?? [];
    for (const row of pageRows) {
      const call = mapWaiterCall(row as Record<string, unknown>);
      if (!isConfirmedSale(call)) continue;
      const time = new Date(callSaleStamp(call) ?? "").getTime();
      if (Number.isFinite(time)) return time;
    }
    if (pageRows.length < page) break;
  }

  return null;
}

export async function loadSalesObservationCycle(
  restaurantId: string,
  now = new Date(),
) {
  const [byAck, byCreated] = await Promise.all([
    firstConfirmedStamp(restaurantId, "acknowledged_at", true),
    firstConfirmedStamp(restaurantId, "created_at", false),
  ]);
  const times = [byAck, byCreated].filter(
    (time): time is number => time !== null,
  );
  return observationFromFirstStamp(times, now);
}

export function analyticsLookbackStart(windowFrom: Date, previousFrom: Date) {
  return new Date(
    Math.min(previousFrom.getTime(), windowFrom.getTime() - SALE_SESSION_MS),
  );
}

async function loadMenuDishCatalog(restaurantId: string): Promise<{
  dishes: MenuReadingDish[];
  categories: MenuReadingCategory[];
}> {
  const supabase = createSupabaseAdminClient();
  const categoriesResult = await supabase
    .from("categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  const categories: MenuReadingCategory[] = (categoriesResult.data ?? [])
    .map((row) => {
      const category = row as { id?: string; name?: string };
      return {
        id: String(category.id ?? ""),
        name: String(category.name ?? ""),
      };
    })
    .filter((category) => category.id);
  const categoryIds = categories.map((category) => category.id);
  if (!categoryIds.length) return { dishes: [], categories };

  const loadDishes = (select: string, withRestaurant: boolean) => {
    let query = supabase.from("dishes").select(select).in("category_id", categoryIds);
    if (withRestaurant) query = query.eq("restaurant_id", restaurantId);
    return query;
  };

  let { data, error } = await loadDishes("id, name, category_id, price", true);
  if (error) {
    const retry = await loadDishes("id, name, category_id, price", false);
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const withoutPrice = await loadDishes("id, name, category_id", true);
    data = withoutPrice.data;
    error = withoutPrice.error;
    if (error) {
      const retry = await loadDishes("id, name, category_id", false);
      data = retry.data;
      error = retry.error;
    }
  }
  if (error) throw new Error(error.message);

  const dishes: MenuReadingDish[] = (data ?? [])
    .map((row) => {
      const dish = row as {
        id?: string;
        name?: string;
        category_id?: string;
        price?: number | string | null;
      };
      return {
        id: String(dish.id ?? ""),
        name: String(dish.name ?? ""),
        category_id: String(dish.category_id ?? ""),
        price: Number(dish.price) || 0,
      };
    })
    .filter((dish) => dish.id && dish.name);

  return { dishes, categories };
}

function toMenuDishRefs(dishes: MenuReadingDish[]): MenuDishRef[] {
  return dishes.map((dish) => ({ id: dish.id, name: dish.name }));
}

export async function loadSalesSummary(
  restaurantId: string,
  range?: string | null,
  fromParam?: string | null,
  toParam?: string | null,
): Promise<SalesSummary & {
  window: string;
  windowFromYmd: string;
  windowToYmd: string;
  menuReading: MenuReadingReport;
  ingredientUse: IngredientUseRow[];
  demandPeaks: DemandPeaksReport;
}> {
  const window = resolveAnalyticsWindow({
    range,
    from: fromParam,
    to: toParam,
  });
  const previous = comparisonRange(window);
  const lookback = analyticsLookbackStart(window.from, previous.from);
  const [createdCalls, ackCalls, catalog, intentPaged, ingredientUse, offMenu] =
    await Promise.all([
    pageWaiterCalls(restaurantId, {
      column: "created_at",
      from: lookback.toISOString(),
      to: window.to.toISOString(),
    }),
    pageWaiterCalls(restaurantId, {
      column: "acknowledged_at",
      from: lookback.toISOString(),
      to: window.to.toISOString(),
    }),
    loadMenuDishCatalog(restaurantId),
    pageIntentEvents(
      restaurantId,
      window.from.toISOString(),
      window.to.toISOString(),
    ),
    loadIngredientUse(restaurantId, window.from, window.to),
    loadOffMenuRequests(restaurantId, window.from, window.to),
  ]);
  if (createdCalls.error) throw new Error(createdCalls.error.message);
  if (ackCalls.error) throw new Error(ackCalls.error.message);

  const calls = mergeCallsById([createdCalls.data, ackCalls.data]).map(
    mapWaiterCall,
  );
  const summary = computeSalesSummary({
    calls,
    dishes: toMenuDishRefs(catalog.dishes),
    from: window.from,
    to: window.to,
    previousFrom: previous.from,
    previousTo: previous.to,
  });

  let menuReading = emptyMenuReading(false);
  if (intentPaged.error && !isMissingIntentTable(intentPaged.error)) {
    throw new Error(intentPaged.error.message);
  }
  const intentEvents =
    intentPaged.columnsReady && !intentPaged.error
      ? intentPaged.data.map(mapIntentEvent)
      : [];
  if (intentPaged.columnsReady && !intentPaged.error) {
    menuReading = computeMenuReading({
      events: intentEvents,
      sales: confirmedSalesInWindow(calls, window.from, window.to),
      dishes: catalog.dishes,
      categories: catalog.categories,
    });
  }

  const peakHours = computeHourlyAcknowledgedOrders(
    calls,
    window.from,
    window.to,
  );
  const peakDays = computeWeekdayAcknowledgedOrders(
    calls,
    window.from,
    window.to,
  );
  const demandPeaks: DemandPeaksReport = {
    offMenu,
    peakHours,
    peakDays,
    peakDemand: computePeakDemandDishes({
      calls,
      events: intentEvents,
      peakHours: peakHours.filter((row) => row.isPeak).map((row) => row.hour),
      from: window.from,
      to: window.to,
    }),
  };

  return {
    ...summary,
    window: window.preset,
    windowFromYmd: window.fromYmd,
    windowToYmd: window.toYmd,
    menuReading,
    ingredientUse,
    demandPeaks,
  };
}
