import { adminUi, engineeringRoleLabel, type AdminLocale } from "@/lib/admin-i18n";
import { recordGeminiUsage, type AiUsageFeature } from "@/lib/ai-usage";
import type { AnalyticsInsights } from "@/lib/ai/analytics-shared";
import { isDishSaleItem, isRatingAlertCall } from "@/lib/dish-analytics";
import { dishLabel } from "@/lib/menu-copy";
import { isTimestampInRange } from "@/lib/restaurant-day";
import {
  filterConfirmedSales,
  isAcknowledgedCall,
  isCancelledCall,
  isOpenSaleTicket,
  isPendingCall,
  isSaleCandidate,
  splitCallRevenue,
} from "@/lib/sales-metrics";

export {
  isEmptySalesMetrics,
  placeholderInsights,
  type AnalyticsInsights,
} from "@/lib/ai/analytics-shared";
export {
  isAcknowledgedCall,
  isCancelledCall,
  isPendingCall,
} from "@/lib/sales-metrics";

export type AnalyticsLine = {
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note?: string;
};

export type AnalyticsTicket = {
  items: AnalyticsLine[];
  status?: string;
  total_amount?: number;
};

export type AnalyticsDish = {
  id: string;
  name: string;
  price: number;
  margin_score: number;
  is_available: boolean;
  category_id?: string;
  category?: string;
};

export type AnalyticsReview = {
  id?: string;
  rating: number;
  feedback: string;
  table_id?: string;
  table_number?: string;
  created_at?: string;
};

export type IntentEvent = {
  dish_id: string;
  dish_name: string;
  category_id?: string;
  event_type: string;
  quantity: number;
  unit_price?: number;
  duration_ms?: number;
  table_id?: string;
  session_id?: string;
  created_at?: string;
};

export type WaiterCallMetric = {
  id?: string;
  table_id?: string;
  table_number?: string;
  call_type?: string | null;
  items: AnalyticsLine[];
  status: string;
  created_at?: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  acknowledged_by_email?: string | null;
  ready_at?: string | null;
};


function recordSold(
  sold: Record<string, { qty: number; revenue: number; name: string }>,
  items: AnalyticsLine[],
) {
  for (const item of items) {
    if (!isDishSaleItem(item)) continue;
    const key = dishKey(item.dish_id, item.name);
    const current = sold[key] ?? { qty: 0, revenue: 0, name: item.name };
    current.qty += item.quantity;
    current.revenue += item.quantity * item.unit_price;
    if (item.name) current.name = item.name;
    sold[key] = current;
  }
}

function recordCombos(combos: Record<string, number>, items: AnalyticsLine[]) {
  const names = [
    ...new Set(
      items
        .filter((item) => isDishSaleItem(item))
        .map((item) => item.dish_id || item.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const pair = [names[i], names[j]]
        .sort((a, b) => a.localeCompare(b))
        .join("||");
      combos[pair] = (combos[pair] ?? 0) + 1;
    }
  }
}

export function parseAnalyticsItems(raw: unknown): AnalyticsLine[] {
  if (typeof raw === "string") {
    try {
      return parseAnalyticsItems(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const note = String(row.note ?? "").trim().slice(0, 200);
      return {
        dish_id: String(row.dish_id ?? ""),
        name: String(row.name ?? "Item"),
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        ...(note ? { note } : {}),
      };
    })
    .filter((item) => item.quantity > 0);
}

function dishKey(id: string, name: string) {
  return id || name;
}

function estimatedProfit(revenue: number, marginScore: number) {
  return revenue * (Math.min(12, Math.max(0, marginScore)) / 12);
}

function tallyCompletedCalls(calls: WaiterCallMetric[]) {
  const sold: Record<string, { qty: number; revenue: number; name: string }> = {};
  const combos: Record<string, number> = {};
  const sales = filterConfirmedSales(calls);
  let revenue = 0;
  let revenueDishes = 0;
  let revenueFee = 0;

  for (const call of sales) {
    const items = call.items ?? [];
    const split = splitCallRevenue(items);
    revenue += split.total;
    revenueDishes += split.dishes;
    revenueFee += split.fee;
    recordCombos(combos, items);
    recordSold(sold, items);
  }

  const pendingCallCount = calls.filter(
    (call) => isPendingCall(call.status) && !isRatingAlertCall(call),
  ).length;
  const pendingSaleTickets = calls.filter((call) => isOpenSaleTicket(call)).length;
  const cancelledCallCount = calls.filter(
    (call) => isCancelledCall(call.status) && isSaleCandidate(call),
  ).length;

  return {
    sold,
    combos,
    revenue,
    revenueDishes,
    revenueFee,
    orderCount: sales.length,
    acknowledgedCallCount: sales.length,
    pendingCallCount,
    pendingSaleTickets,
    cancelledCallCount,
  };
}

function tallyIntent(events: IntentEvent[]) {
  const views: Record<string, number> = {};
  const cartAdds: Record<string, { qty: number; name: string }> = {};
  for (const event of events) {
    const key = dishKey(event.dish_id, event.dish_name);
    if (event.event_type === "view" || event.event_type === "dish_dwell") {
      views[key] = (views[key] ?? 0) + Math.max(1, event.quantity);
    }
    if (event.event_type === "cart_add") {
      const current = cartAdds[key] ?? { qty: 0, name: event.dish_name };
      current.qty += Math.max(1, event.quantity);
      if (event.dish_name) current.name = event.dish_name;
      cartAdds[key] = current;
    }
    if (event.event_type === "cart_remove") {
      const current = cartAdds[key] ?? { qty: 0, name: event.dish_name };
      current.qty = Math.max(0, current.qty - Math.max(1, event.quantity));
      if (event.dish_name) current.name = event.dish_name;
      cartAdds[key] = current;
    }
  }
  return { views, cartAdds };
}

function waitMetrics(calls: WaiterCallMetric[]) {
  const waitSamples: number[] = [];
  let openCalls = 0;
  const now = Date.now();
  for (const call of calls) {
    if (call.status === "open") {
      openCalls += 1;
      if (call.created_at) {
        waitSamples.push(
          Math.max(0, (now - new Date(call.created_at).getTime()) / 60000),
        );
      }
    }
    if (call.status === "acknowledged" && call.created_at && call.acknowledged_at) {
      waitSamples.push(
        Math.max(
          0,
          (new Date(call.acknowledged_at).getTime() -
            new Date(call.created_at).getTime()) /
            60000,
        ),
      );
    }
  }
  const avgWaitMinutes = waitSamples.length
    ? Number(
        (
          waitSamples.reduce((sum, value) => sum + value, 0) / waitSamples.length
        ).toFixed(1),
      )
    : 0;
  return { avgWaitMinutes, openCalls };
}

function dishRole(
  dish: AnalyticsDish,
  qty: number,
  abandonedQty: number,
) {
  if (!dish.is_available) return "waste-risk";
  if (qty >= 2 && dish.margin_score >= 8) return "star";
  if (qty >= 2 && dish.margin_score < 6) return "plowhorse";
  if (qty === 0 && dish.margin_score >= 8) return "puzzle";
  if (qty === 0 && abandonedQty >= 3) return "waste-risk";
  return "standard";
}

export function computeAnalytics(input: {
  dishes: AnalyticsDish[];
  tickets?: AnalyticsTicket[];
  reviews: AnalyticsReview[];
  intentEvents?: IntentEvent[];
  waiterCalls?: WaiterCallMetric[];
}) {
  const calls = input.waiterCalls ?? [];
  const {
    sold,
    combos,
    revenue,
    orderCount,
    acknowledgedCallCount,
    pendingCallCount,
    pendingSaleTickets,
    cancelledCallCount,
    revenueDishes,
    revenueFee,
  } = tallyCompletedCalls(calls);
  const completedRevenue = revenue;
  const completedOrderCount = orderCount;
  const { views, cartAdds } = tallyIntent(input.intentEvents ?? []);

  const waiterShown: Record<string, { qty: number; name: string }> = {};
  for (const call of input.waiterCalls ?? []) {
    if (isAcknowledgedCall(call.status) || isRatingAlertCall(call)) continue;
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const key = dishKey(item.dish_id, item.name);
      const current = waiterShown[key] ?? { qty: 0, name: item.name };
      current.qty += item.quantity;
      waiterShown[key] = current;
    }
  }

  const { avgWaitMinutes, openCalls } = waitMetrics(calls);

  const engineering = input.dishes.map((dish) => {
    const key = dish.id;
    const stats = sold[key] ?? sold[dish.name] ?? {
      qty: 0,
      revenue: 0,
      name: dish.name,
    };
    const viewCount = views[key] ?? views[dish.name] ?? 0;
    const cartQty = cartAdds[key]?.qty ?? cartAdds[dish.name]?.qty ?? 0;
    const shownQty = waiterShown[key]?.qty ?? waiterShown[dish.name]?.qty ?? 0;
    const intentQty = Math.max(cartQty, shownQty);
    const abandonedQty = Math.max(0, intentQty - stats.qty);
    const conversion =
      intentQty > 0 ? Number((stats.qty / intentQty).toFixed(2)) : stats.qty > 0 ? 1 : 0;
    const profit = estimatedProfit(stats.revenue, dish.margin_score);
    const profitIndex = Number((stats.qty * dish.margin_score + profit).toFixed(2));

    const role = dishRole(dish, stats.qty, abandonedQty);

    return {
      id: dish.id,
      name: dish.name,
      price: dish.price,
      margin_score: dish.margin_score,
      is_available: dish.is_available,
      qty: stats.qty,
      revenue: stats.revenue,
      profit,
      profitIndex,
      views: viewCount,
      cartAdds: cartQty,
      waiterShown: shownQty,
      abandonedQty,
      conversion,
      role,
    };
  });

  const popularDishes = [...engineering]
    .filter((row) => row.qty > 0)
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  const seenPopular = new Set(popularDishes.map((row) => row.id));
  for (const [key, stats] of Object.entries(sold)) {
    if (stats.qty <= 0 || seenPopular.has(key)) continue;
    if (!isDishSaleItem({ dish_id: key, name: stats.name })) continue;
    if (popularDishes.some((row) => row.name === stats.name)) continue;
    popularDishes.push({
      id: key,
      name: stats.name,
      price: 0,
      margin_score: 0,
      is_available: true,
      qty: stats.qty,
      revenue: stats.revenue,
      profit: 0,
      profitIndex: stats.qty,
      views: 0,
      cartAdds: 0,
      waiterShown: 0,
      abandonedQty: 0,
      conversion: 1,
      role: "standard",
    });
  }
  popularDishes.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  const highMarginStars = [...engineering]
    .filter((row) => row.is_available && row.qty > 0 && row.margin_score >= 7)
    .sort((a, b) => b.profitIndex - a.profitIndex || b.qty - a.qty);

  const wasteRisk = engineering.filter(
    (d) =>
      !d.is_available ||
      d.role === "waste-risk" ||
      (d.qty === 0 && d.margin_score <= 4 && d.cartAdds + d.waiterShown === 0),
  );

  const financialRisk = [...engineering]
    .filter(
      (d) =>
        !d.is_available ||
        d.role === "plowhorse" ||
        d.abandonedQty >= 2 ||
        (orderCount > 0 && d.qty === 0 && d.margin_score <= 4),
    )
    .sort(
      (a, b) =>
        b.abandonedQty - a.abandonedQty || a.qty - b.qty || a.margin_score - b.margin_score,
    );

  const upsell = engineering
    .filter((d) => d.is_available && (d.role === "puzzle" || d.margin_score >= 8))
    .sort((a, b) => b.margin_score - a.margin_score || a.qty - b.qty);

  const intentRows = [...engineering]
    .filter((row) => row.views > 0 || row.cartAdds > 0 || row.waiterShown > 0)
    .sort(
      (a, b) =>
        b.abandonedQty - a.abandonedQty ||
        b.cartAdds + b.waiterShown - (a.cartAdds + a.waiterShown),
    );

  const dishNameById = Object.fromEntries(
    input.dishes.map((dish) => [dish.id, dish.name]),
  );

  const comboOffers = Object.entries(combos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([pair, count]) => {
      const [left, right] = pair.split("||");
      return {
        left: dishNameById[left ?? ""] ?? left ?? "",
        right: dishNameById[right ?? ""] ?? right ?? "",
        count,
      };
    })
    .filter((row) => row.left && row.right);

  const ratings = input.reviews.map((r) => r.rating);
  const avgRating = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 0;

  const aov = orderCount > 0 ? revenue / orderCount : 0;
  const estimatedProfitTotal = engineering.reduce((sum, row) => sum + row.profit, 0);
  const abandonedCallCount = pendingSaleTickets + cancelledCallCount;
  const conversionDenom = orderCount + pendingSaleTickets;
  const orderConversionRate =
    conversionDenom > 0 ? Number((orderCount / conversionDenom).toFixed(3)) : 0;

  return {
    revenue,
    revenueDishes,
    revenueFee,
    orderCount,
    completedRevenue,
    completedOrderCount,
    aov,
    estimatedProfit: estimatedProfitTotal,
    lostRevenue: engineering.reduce(
      (sum, row) => sum + row.abandonedQty * row.price,
      0,
    ),
    orderConversionRate,
    acknowledgedCallCount,
    pendingCallCount,
    cancelledCallCount,
    abandonedCallCount,
    avgWaitMinutes,
    openWaiterCalls: openCalls,
    waiterCallCount: (input.waiterCalls ?? []).length,
    avgRating: Number(avgRating.toFixed(2)),
    engineering,
    popularDishes,
    highMarginStars,
    wasteRisk,
    financialRisk,
    intentRows,
    comboOffers,
    upsell,
    negativeReviews: input.reviews.filter((r) => r.rating <= 2),
  };
}

export type AnalyticsSnapshot = ReturnType<typeof computeAnalytics>;

export type TableFloorRow = {
  tableId: string;
  tableNumber: string;
  status: "calling" | "in_progress" | "free";
};

export function computeTableFloor(
  tables: { id: string; table_number: string }[],
  calls: WaiterCallMetric[],
  todayFrom: Date,
  todayTo: Date,
): TableFloorRow[] {
  const calling = new Set<string>();
  const inProgress = new Set<string>();

  for (const call of calls) {
    const tableId = call.table_id;
    if (!tableId || isRatingAlertCall(call)) continue;
    if (isPendingCall(call.status)) {
      calling.add(tableId);
    }
    const confirmedAt = call.acknowledged_at || call.created_at;
    if (
      isAcknowledgedCall(call.status) &&
      isTimestampInRange(confirmedAt, todayFrom, todayTo)
    ) {
      inProgress.add(tableId);
    }
  }

  return [...tables]
    .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }))
    .map((table) => ({
      tableId: table.id,
      tableNumber: table.table_number,
      status: calling.has(table.id)
        ? "calling"
        : inProgress.has(table.id)
          ? "in_progress"
          : "free",
    }));
}

async function generateAiCompletion(options: {
  system: string;
  user: string;
  temperature: number;
  jsonMode?: boolean;
  restaurantId?: string;
  feature?: AiUsageFeature;
}) {
  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  for (const model of [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ]) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: options.user,
        config: {
          systemInstruction: options.system,
          temperature: options.temperature,
          ...(options.jsonMode
            ? { responseMimeType: "application/json" }
            : {}),
        },
      });
      const text = res.text?.trim() ?? "";
      if (text) {
        if (options.feature) {
          await recordGeminiUsage({
            restaurantId: options.restaurantId,
            feature: options.feature,
            model,
            response: res,
          });
        }
        return text;
      }
    } catch {
      continue;
    }
  }

  throw new Error("GEMINI_API_KEY request failed.");
}

export async function generateDailyDigest(
  snapshot: {
    revenue: number;
    orderCount: number;
    waiterCallCount?: number;
    popularDishes: { name: string; qty: number }[];
    hoursLabel?: string;
    lane?: "food" | "bar";
    hourly?: { label: string; orders: number; isPeak?: boolean }[];
    categories?: { category: string; percent: number; revenue: number }[];
  },
  locale: AdminLocale,
  restaurantId?: string,
): Promise<string> {
  const language = insightLanguage(locale);
  const top = snapshot.popularDishes.slice(0, 3).map((row) => ({
    name: dishLabel(row.name, locale),
    qty: row.qty,
  }));
  const peaks = (snapshot.hourly ?? [])
    .filter((row) => row.isPeak)
    .map((row) => row.label);
  const system = `You are the Chef Assistant of Georgian House.
${language.instruction}
Write ONE or TWO short sentences of sales advice for THIS service window only (${snapshot.hoursLabel || "opening to closing today"}).
Use only the provided opening-to-closing numbers from the live database. Do not mention other days, weeks, or history.
Give a concrete tip that can increase sales now (push a top seller, fill a quiet hour, or pair a lagging category).
Lane: ${snapshot.lane === "bar" ? "bar / drinks" : "dishes and desserts"}.
No greeting. No bullet list. Plain text only.`;

  return generateAiCompletion({
    system,
    user: JSON.stringify({
      serviceWindow: snapshot.hoursLabel || "today opening-to-closing",
      todayRevenueGel: Number(snapshot.revenue.toFixed(2)),
      todayOrders: snapshot.orderCount,
      todayCalls: snapshot.waiterCallCount ?? snapshot.orderCount,
      topSellers: top,
      peakHours: peaks,
      categoryShare: (snapshot.categories ?? []).slice(0, 5),
    }),
    temperature: 0.35,
    restaurantId,
    feature: "digest",
  });
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function insightLanguage(locale: AdminLocale) {
  if (locale === "en") {
    return {
      name: "English",
      instruction:
        "Write every recommendation entirely in English. Do not use Georgian or Russian.",
    };
  }
  if (locale === "ru") {
    return {
      name: "Russian",
      instruction:
        "Пиши все рекомендации полностью на русском. Не используй грузинский или английский.",
    };
  }
  return {
    name: "Georgian",
    instruction:
      "დაწერე ყველა რეკომენდაცია მხოლოდ ქართულად. ნუ გამოიყენებ ინგლისურს ან რუსულს.",
  };
}

export function parseAdminInsightLocale(value: unknown): AdminLocale {
  return value === "en" || value === "ru" || value === "ka" ? value : "ka";
}

export async function generateAnalyticsInsights(
  snapshot: AnalyticsSnapshot & {
    windowDays?: number;
    window?: string;
    windowFrom?: string;
    windowTo?: string;
    peakHours?: { label: string; orders: number; isPeak?: boolean }[];
    previous?: {
      revenue: number;
      orderCount: number;
      aov: number;
      waiterCallCount: number;
    };
    comparison?: {
      revenue: number;
      orderCount: number;
      aov: number;
      waiterCallCount: number;
    };
  },
  locale: AdminLocale,
  restaurantId?: string,
): Promise<AnalyticsInsights> {
  const language = insightLanguage(locale);
  const copy = adminUi[locale];
  const sales = snapshot.engineering.map((row) => ({
    name: dishLabel(row.name, locale),
    confirmedQty: row.qty,
    confirmedRevenueGel: Number(row.revenue.toFixed(2)),
    estimatedProfitGel: Number(row.profit.toFixed(2)),
    lostRevenueGel: Number((row.abandonedQty * row.price).toFixed(2)),
    priceGel: Number(row.price.toFixed(2)),
    margin_score: row.margin_score,
    available: row.is_available,
    views: row.views,
    cartAdds: row.cartAdds,
    waiterCallItems: row.waiterShown,
    abandonedQty: row.abandonedQty,
    conversion: row.conversion,
    role: engineeringRoleLabel(locale, row.role),
  }));

  const windowDays = Math.max(1, snapshot.windowDays ?? 7);
  const windowLabel =
    snapshot.window === "today"
      ? "today (Tbilisi calendar day)"
      : snapshot.window === "last30"
        ? "the last 30 calendar days"
        : snapshot.window === "month"
          ? "the current calendar month"
          : snapshot.window === "custom"
            ? `the custom window ${snapshot.windowFrom ?? ""} → ${snapshot.windowTo ?? ""}`
            : "the last 7 calendar days";
  const peak = (snapshot.peakHours ?? []).filter((row) => row.isPeak || row.orders > 0);
  const peakSummary =
    peak.length > 0
      ? peak
          .slice(0, 5)
          .map((row) => `${row.label}: ${row.orders}`)
          .join("; ")
      : "no acknowledged-call peak hour in this window";

  const system = `You are a precision Restaurant Finance & Operations analyst for Georgian House, Tbilisi. Currency is GEL (₾).
The admin UI language is ${locale} (${language.name}).
${language.instruction}

DATASET: The selected reporting window is ${windowLabel} (${windowDays} day(s); kitchen acknowledgement from ${snapshot.windowFrom ?? "start"} through ${snapshot.windowTo ?? "end"}). Aggregate peak hours, trends, and AOV across THIS entire window — not a hardcoded 7-day slice unless that is the selected range.
SALES TRUTH: ₾ revenue, AOV, popularity, and profit proxies come ONLY from kitchen-acknowledged waiter_calls with dish items in that window (one dining check per table; later bills on the same table are not a second sale). Revenue includes the service fee; category and profit figures are dish-only. Conversion is confirmed sales ÷ (confirmed sales + still-open sale tickets). Estimated profit is a 0–12 margin heuristic, not bookkeeping.
Cart views, cart_add events, and pending/cancelled calls are INTENT / abandonment — never add them to confirmed revenue.
QUOTE the provided numbers. Do not invent dishes, prices, or percentages. If a figure is 0, say so. No generic restaurant clichés.

Reply ONLY with JSON (English keys; values entirely in ${language.name}):
{
  "weeklyFinance":"...",
  "menuOptimization":"...",
  "cartAbandonment":"...",
  "nextWeekActions":"..."
}

- weeklyFinance (${copy.weeklyFinance}): confirmed revenue, estimated profit, AOV, conversion, and vs the immediately preceding period of equal length. Name high-margin stars with ₾ and margin_score. Cite peak hours: ${peakSummary}.
- menuOptimization (${copy.menuOptimization}): top vs low-efficiency dishes (promote, reprice, or 86). Use roles star="${copy.star}", puzzle="${copy.puzzle}", plowhorse="${copy.plowhorse}", waste-risk="${copy.wasteRisk}".
- cartAbandonment (${copy.cartAbandonment}): abandoned qty vs confirmed, lost GEL, which dishes guests add but do not convert.
- nextWeekActions (${copy.nextWeekActions}): 4–7 concrete next steps (length similar to this window) to raise orders and cut waste/cost. Each step must cite a number from this dataset.`;

  const user = JSON.stringify({
    uiLanguage: locale,
    windowPreset: snapshot.window ?? "last7",
    windowDays,
    windowFrom: snapshot.windowFrom,
    windowTo: snapshot.windowTo,
    peakHours: snapshot.peakHours ?? [],
    previousPeriod: snapshot.previous ?? null,
    comparisonPctVsPrevious: snapshot.comparison ?? null,
    lostRevenueGel: Number(snapshot.lostRevenue.toFixed(2)),
    confirmedRevenueGel: Number(snapshot.revenue.toFixed(2)),
    confirmedOrderCount: snapshot.orderCount,
    acknowledgedCallCount: snapshot.acknowledgedCallCount,
    pendingCallCount: snapshot.pendingCallCount,
    cancelledCallCount: snapshot.cancelledCallCount,
    abandonedCallCount: snapshot.abandonedCallCount,
    orderConversionRate: snapshot.orderConversionRate,
    aovGel: Number(snapshot.aov.toFixed(2)),
    estimatedProfitGel: Number(snapshot.estimatedProfit.toFixed(2)),
    avgWaitMinutes: snapshot.avgWaitMinutes,
    openWaiterCalls: snapshot.openWaiterCalls,
    waiterCallCount: snapshot.waiterCallCount,
    comboOffers: snapshot.comboOffers.map((row) => ({
      left: dishLabel(row.left, locale),
      right: dishLabel(row.right, locale),
      count: row.count,
    })),
    dishes: sales,
  });

  const raw = await generateAiCompletion({
    system,
    user,
    temperature: 0.3,
    jsonMode: true,
    restaurantId,
    feature: "analytics",
  });
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const weeklyFinance = String(
    parsed.weeklyFinance ?? parsed.marginGrowth ?? parsed.marginUpsell ?? "",
  ).trim();
  const menuOptimization = String(
    parsed.menuOptimization ?? parsed.menuEngineering ?? "",
  ).trim();
  const cartAbandonment = String(
    parsed.cartAbandonment ?? parsed.behavioralInsights ?? "",
  ).trim();
  const nextWeekActions = String(
    parsed.nextWeekActions ?? parsed.operationalRisk ?? parsed.wastePrevention ?? "",
  ).trim();

  return {
    weeklyFinance,
    menuOptimization,
    cartAbandonment,
    nextWeekActions,
    marginGrowth: weeklyFinance,
    behavioralInsights: cartAbandonment,
    operationalRisk: nextWeekActions,
    menuEngineering: menuOptimization,
    wastePrevention: nextWeekActions,
    marginUpsell: weeklyFinance,
  };
}
