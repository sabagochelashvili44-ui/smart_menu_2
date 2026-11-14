import "server-only";

import {
  estimateGeminiCostUsd,
  projectMonthlyGeminiCostFromRows,
  roundUsd,
  type GeminiMonthlyProjection,
} from "@/lib/gemini-cost";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireSuperAdmin } from "@/lib/super-admin";
import type { SubscriptionStatus } from "@/lib/super-admin-shared";

export type AiPlan = "free" | "paid";
export type AiCapAlert = "ok" | "warn" | "over";

export type SuperAdminAiModel = {
  model: string;
  provider: string;
  tokens: number;
  costUsd: number;
};

export type SuperAdminHourlyBucket = {
  hour: number;
  chatCalls: number;
  allCalls: number;
  chatTokens: number;
  totalTokens: number;
};

export type SuperAdminRestaurant = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  bg_color: string | null;
  font: string | null;
  subscription_status: SubscriptionStatus;
  subscription_fee: number;
  valid_until: string | null;
  manager_email: string | null;
  service_fee_percent: number;
  google_maps_review_url: string | null;
  google_review_url: string | null;
  order_count: number;
  ai_total_tokens: number;
  ai_cost_usd: number;
  ai_monthly_projected_usd: number;
  ai_heavy_monthly_usd: number;
  ai_peak_daily_usd: number;
  ai_plan: AiPlan;
  ai_daily_token_limit: number | null;
  ai_weekly_token_limit: number | null;
  ai_tokens_today: number;
  ai_tokens_week: number;
  ai_models: SuperAdminAiModel[];
  ai_alert: AiCapAlert;
};

export type SuperAdminKpis = {
  totalRestaurants: number;
  activeSubscribers: number;
  mrr: number;
  totalOrders: number;
  ai_total_tokens: number;
  ai_cost_usd: number;
  ai_monthly_projected_usd: number;
  ai_alert_count: number;
};

const NETWORK_RESTAURANT_SELECT =
  "id, name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font, subscription_status, subscription_fee, valid_until, manager_email, service_fee_percent, google_maps_review_url, google_review_url, ai_plan, ai_daily_token_limit, ai_weekly_token_limit";
const NETWORK_RESTAURANT_SELECT_BRAND =
  "id, name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font, subscription_status, subscription_fee, valid_until, manager_email, service_fee_percent, google_maps_review_url, google_review_url";
const NETWORK_RESTAURANT_SELECT_CORE =
  "id, name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font, subscription_status, subscription_fee, valid_until, manager_email";

async function fetchRestaurantRows(
  supabase: { from: (table: string) => { select: (columns: string) => any } },
) {
  const full = await fetchAllRows(supabase, "restaurants", NETWORK_RESTAURANT_SELECT);
  if (full.ok) return full.rows;
  const brand = await fetchAllRows(
    supabase,
    "restaurants",
    NETWORK_RESTAURANT_SELECT_BRAND,
  );
  if (brand.ok) return brand.rows;
  const core = await fetchAllRows(
    supabase,
    "restaurants",
    NETWORK_RESTAURANT_SELECT_CORE,
  );
  return core.rows;
}

async function fetchAllRows(
  supabase: { from: (table: string) => { select: (columns: string) => any } },
  table: string,
  columns: string,
) {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) return { ok: false as const, rows: [] as Record<string, unknown>[] };
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { ok: true as const, rows };
}

function mergeById(groups: Record<string, unknown>[][]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row.id ?? "");
      if (id) map.set(id, row);
    }
  }
  return [...map.values()];
}

function asStatus(value: string): SubscriptionStatus {
  if (value === "active" || value === "trial" || value === "suspended") {
    return value;
  }
  return "trial";
}

function asAiPlan(value: unknown): AiPlan {
  return String(value ?? "").trim() === "paid" ? "paid" : "free";
}

function asOptionalLimit(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function aiCapLevel(used: number, limit: number | null): AiCapAlert {
  if (!limit) return "ok";
  if (used >= limit) return "over";
  if (used >= limit * 0.8) return "warn";
  return "ok";
}

function worseAlert(left: AiCapAlert, right: AiCapAlert): AiCapAlert {
  if (left === "over" || right === "over") return "over";
  if (left === "warn" || right === "warn") return "warn";
  return "ok";
}

function toTenant(
  row: Record<string, unknown>,
  extras: {
    orderCount: number;
    lifetime: { tokens: number; cost: number };
    today: number;
    week: number;
    models: SuperAdminAiModel[];
    projection: GeminiMonthlyProjection;
  },
): SuperAdminRestaurant {
  const daily = asOptionalLimit(row.ai_daily_token_limit);
  const weekly = asOptionalLimit(row.ai_weekly_token_limit);
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: row.slug ? String(row.slug) : null,
    logo: row.logo ? String(row.logo) : null,
    logo_url: row.logo_url ? String(row.logo_url) : null,
    primary_color: row.primary_color ? String(row.primary_color) : null,
    secondary_color: row.secondary_color ? String(row.secondary_color) : null,
    bg_color: row.bg_color ? String(row.bg_color) : null,
    font: row.font ? String(row.font) : null,
    subscription_status: asStatus(String(row.subscription_status ?? "trial")),
    subscription_fee: Number(row.subscription_fee) || 0,
    valid_until: row.valid_until ? String(row.valid_until) : null,
    manager_email: row.manager_email ? String(row.manager_email) : null,
    service_fee_percent: Number(row.service_fee_percent) || 0,
    google_maps_review_url: row.google_maps_review_url
      ? String(row.google_maps_review_url)
      : null,
    google_review_url: row.google_review_url
      ? String(row.google_review_url)
      : null,
    order_count: extras.orderCount,
    ai_total_tokens: extras.lifetime.tokens,
    ai_cost_usd: extras.lifetime.cost,
    ai_monthly_projected_usd: extras.projection.monthlyProjectedUsd,
    ai_heavy_monthly_usd: extras.projection.heavyLoadMonthlyUsd,
    ai_peak_daily_usd: extras.projection.peakDailyCostUsd,
    ai_plan: asAiPlan(row.ai_plan),
    ai_daily_token_limit: daily,
    ai_weekly_token_limit: weekly,
    ai_tokens_today: extras.today,
    ai_tokens_week: extras.week,
    ai_models: extras.models,
    ai_alert: worseAlert(
      aiCapLevel(extras.today, daily),
      aiCapLevel(extras.week, weekly),
    ),
  };
}

/** Unique ticket ids per restaurant from waiter_calls and orders. */
function orderCountsByRestaurant(rows: Record<string, unknown>[]) {
  const byRestaurant = new Map<string, Set<string>>();
  for (const row of rows) {
    const restaurantId = String(row.restaurant_id ?? "");
    const id = String(row.id ?? "");
    if (!restaurantId || !id) continue;
    const ids = byRestaurant.get(restaurantId) ?? new Set<string>();
    ids.add(id);
    byRestaurant.set(restaurantId, ids);
  }
  const counts = new Map<string, number>();
  for (const [restaurantId, ids] of byRestaurant) {
    counts.set(restaurantId, ids.size);
  }
  return counts;
}

function mergeByRestaurantId(groups: Record<string, unknown>[][]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row.restaurant_id ?? "");
      if (id) map.set(id, row);
    }
  }
  return [...map.values()];
}

function mergeModelRows(groups: Record<string, unknown>[][]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const row of group) {
      const restaurantId = String(row.restaurant_id ?? "");
      if (!restaurantId) continue;
      const key = `${restaurantId}|${String(row.provider ?? "")}|${String(row.model ?? "")}`;
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function usageCostUsd(row: Record<string, unknown>) {
  if (row.estimated_cost_usd != null && row.estimated_cost_usd !== "") {
    const estimated = Number(row.estimated_cost_usd);
    if (Number.isFinite(estimated)) return estimated;
  }
  return Number(row.cost_usd) || 0;
}

function usageTokens(row: Record<string, unknown>) {
  const total = Number(row.total_tokens);
  if (Number.isFinite(total) && total > 0) return total;
  return (Number(row.prompt_tokens) || 0) + (Number(row.completion_tokens) || 0);
}

function isActiveGeminiRow(row: Record<string, unknown>) {
  if (row.archived_at) return false;
  const provider = String(row.provider ?? "gemini").trim().toLowerCase();
  return !provider || provider === "gemini";
}

function aggregateRawUsage(rows: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isActiveGeminiRow(row)) continue;
    const id = String(row.restaurant_id ?? "");
    if (!id) continue;
    const prev = map.get(id) ?? {
      restaurant_id: id,
      total_tokens: 0,
      cost_usd: 0,
      estimated_cost_usd: 0,
    };
    const tokens = usageTokens(row);
    const cost = usageCostUsd(row);
    prev.total_tokens = (Number(prev.total_tokens) || 0) + tokens;
    prev.cost_usd = (Number(prev.cost_usd) || 0) + cost;
    prev.estimated_cost_usd = (Number(prev.estimated_cost_usd) || 0) + cost;
    map.set(id, prev);
  }
  return [...map.values()];
}

function aggregateRawModels(rows: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isActiveGeminiRow(row)) continue;
    const restaurantId = String(row.restaurant_id ?? "");
    if (!restaurantId) continue;
    const provider = String(row.provider ?? "");
    const model = String(row.model ?? "").trim() || "unknown";
    const key = `${restaurantId}|${provider}|${model}`;
    const prev = map.get(key) ?? {
      restaurant_id: restaurantId,
      provider,
      model,
      total_tokens: 0,
      cost_usd: 0,
      estimated_cost_usd: 0,
    };
    const tokens = usageTokens(row);
    const cost = usageCostUsd(row);
    prev.total_tokens = (Number(prev.total_tokens) || 0) + tokens;
    prev.cost_usd = (Number(prev.cost_usd) || 0) + cost;
    prev.estimated_cost_usd = (Number(prev.estimated_cost_usd) || 0) + cost;
    map.set(key, prev);
  }
  return [...map.values()];
}

async function fetchAiUsageTotals(
  supabase: { from: (table: string) => { select: (columns: string) => any } },
) {
  const preferred = await fetchAllRows(
    supabase,
    "restaurant_ai_usage_totals",
    "restaurant_id, total_tokens, cost_usd, estimated_cost_usd",
  );
  if (preferred.ok) return preferred.rows;
  const legacy = await fetchAllRows(
    supabase,
    "restaurant_ai_usage_totals",
    "restaurant_id, total_tokens, cost_usd",
  );
  if (legacy.ok) return legacy.rows;
  const raw = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    "restaurant_id, provider, prompt_tokens, completion_tokens, total_tokens, cost_usd, estimated_cost_usd, archived_at",
  );
  if (raw.ok) return aggregateRawUsage(raw.rows);
  const oldest = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    "restaurant_id, provider, prompt_tokens, completion_tokens, total_tokens, cost_usd",
  );
  return oldest.ok ? aggregateRawUsage(oldest.rows) : [];
}

async function fetchAiUsageModels(
  supabase: { from: (table: string) => { select: (columns: string) => any } },
) {
  const preferred = await fetchAllRows(
    supabase,
    "restaurant_ai_usage_by_model",
    "restaurant_id, provider, model, total_tokens, cost_usd, estimated_cost_usd",
  );
  if (preferred.ok) return preferred.rows;
  const legacy = await fetchAllRows(
    supabase,
    "restaurant_ai_usage_by_model",
    "restaurant_id, provider, model, total_tokens, cost_usd",
  );
  if (legacy.ok) return legacy.rows;
  const raw = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    "restaurant_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, estimated_cost_usd, archived_at",
  );
  if (raw.ok) return aggregateRawModels(raw.rows);
  const oldest = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    "restaurant_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd",
  );
  return oldest.ok ? aggregateRawModels(oldest.rows) : [];
}

const USAGE_EVENT_COLUMNS =
  "restaurant_id, provider, model, prompt_tokens, completion_tokens, cached_tokens, estimated_cost_usd, cost_usd, created_at, archived_at";
const USAGE_EVENT_COLUMNS_LEGACY =
  "restaurant_id, provider, model, prompt_tokens, completion_tokens, estimated_cost_usd, cost_usd, created_at, archived_at";
const USAGE_EVENT_COLUMNS_OLDEST =
  "restaurant_id, provider, model, prompt_tokens, completion_tokens, cost_usd, created_at";

async function fetchAiUsageEvents(
  supabase: { from: (table: string) => { select: (columns: string) => any } },
) {
  const preferred = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    USAGE_EVENT_COLUMNS,
  );
  if (preferred.ok) return preferred.rows;
  const legacy = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    USAGE_EVENT_COLUMNS_LEGACY,
  );
  if (legacy.ok) return legacy.rows;
  const oldest = await fetchAllRows(
    supabase,
    "restaurant_ai_usage",
    USAGE_EVENT_COLUMNS_OLDEST,
  );
  return oldest.ok ? oldest.rows : [];
}

function exactUsageByRestaurant(rows: Record<string, unknown>[]) {
  const totals = new Map<string, { tokens: number; cost: number }>();
  for (const row of rows) {
    if (!isActiveGeminiRow(row)) continue;
    const id = String(row.restaurant_id ?? "");
    if (!id) continue;
    const prompt = Number(row.prompt_tokens) || 0;
    const completion = Number(row.completion_tokens) || 0;
    const cached = Number(row.cached_tokens) || 0;
    const priced = estimateGeminiCostUsd(String(row.model ?? ""), {
      promptTokens: prompt,
      completionTokens: completion,
      cachedTokens: cached,
    });
    const stored = usageCostUsd(row);
    const cost = prompt || completion ? priced : stored;
    const prev = totals.get(id) ?? { tokens: 0, cost: 0 };
    prev.tokens += usageTokens(row);
    prev.cost += cost;
    totals.set(id, prev);
  }
  for (const value of totals.values()) {
    value.cost = roundUsd(value.cost);
  }
  return totals;
}

function projectionByRestaurant(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (!isActiveGeminiRow(row)) continue;
    const id = String(row.restaurant_id ?? "");
    if (!id) continue;
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  const projections = new Map<string, GeminiMonthlyProjection>();
  for (const [id, events] of grouped) {
    projections.set(
      id,
      projectMonthlyGeminiCostFromRows(
        events.map((event) => ({
          created_at: event.created_at ? String(event.created_at) : null,
          model: event.model ? String(event.model) : null,
          prompt_tokens: Number(event.prompt_tokens) || 0,
          completion_tokens: Number(event.completion_tokens) || 0,
          cached_tokens: Number(event.cached_tokens) || 0,
          estimated_cost_usd: Number(event.estimated_cost_usd),
          cost_usd: Number(event.cost_usd),
        })),
      ),
    );
  }
  return projections;
}

function aiUsageByRestaurant(rows: Record<string, unknown>[]) {
  const totals = new Map<string, { tokens: number; cost: number }>();
  for (const row of rows) {
    const id = String(row.restaurant_id ?? "");
    if (!id) continue;
    totals.set(id, {
      tokens: usageTokens(row),
      cost: usageCostUsd(row),
    });
  }
  return totals;
}

function tokenSumByRestaurant(rows: Record<string, unknown>[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.restaurant_id ?? "");
    if (!id) continue;
    totals.set(id, Number(row.total_tokens) || 0);
  }
  return totals;
}

function modelsByRestaurant(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, SuperAdminAiModel[]>();
  for (const row of rows) {
    const id = String(row.restaurant_id ?? "");
    const model = String(row.model ?? "").trim() || "unknown";
    if (!id) continue;
    if (String(row.provider ?? "gemini").toLowerCase() === "openai") continue;
    const list = grouped.get(id) ?? [];
    list.push({
      model,
      provider: String(row.provider ?? ""),
      tokens: usageTokens(row),
      costUsd: usageCostUsd(row),
    });
    grouped.set(id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
  }
  return grouped;
}

function fillHourlyBuckets(rows: Record<string, unknown>[]): SuperAdminHourlyBucket[] {
  const byHour = new Map<number, SuperAdminHourlyBucket>();
  for (let hour = 0; hour < 24; hour += 1) {
    byHour.set(hour, {
      hour,
      chatCalls: 0,
      allCalls: 0,
      chatTokens: 0,
      totalTokens: 0,
    });
  }
  for (const row of rows) {
    const hour = Math.round(Number(row.hour));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    byHour.set(hour, {
      hour,
      chatCalls: Number(row.chat_calls) || 0,
      allCalls: Number(row.all_calls) || 0,
      chatTokens: Number(row.chat_tokens) || 0,
      totalTokens: Number(row.total_tokens) || 0,
    });
  }
  return [...byHour.values()];
}

/**
 * Global SaaS metrics. Never reads getTenant() or restaurant_id from the admin layout.
 */
export async function loadSuperAdminNetwork() {
  await requireSuperAdmin();

  const sessionClient = await createSupabaseServerClient();
  const serviceClient = createSupabaseAdminClient();

  const [
    sessionRestaurants,
    serviceRestaurants,
    sessionCalls,
    serviceCalls,
    sessionOrders,
    serviceOrders,
    sessionAiUsage,
    serviceAiUsage,
    sessionAiModels,
    serviceAiModels,
    sessionAiToday,
    serviceAiToday,
    sessionAiWeek,
    serviceAiWeek,
    sessionHourly,
    serviceHourly,
    sessionAiEvents,
    serviceAiEvents,
  ] = await Promise.all([
      fetchRestaurantRows(sessionClient),
      fetchRestaurantRows(serviceClient),
      fetchAllRows(sessionClient, "waiter_calls", "id, restaurant_id").then(
        (result) => result.rows,
      ),
      fetchAllRows(serviceClient, "waiter_calls", "id, restaurant_id").then(
        (result) => result.rows,
      ),
      fetchAllRows(sessionClient, "orders", "id, restaurant_id").then(
        (result) => result.rows,
      ),
      fetchAllRows(serviceClient, "orders", "id, restaurant_id").then(
        (result) => result.rows,
      ),
      fetchAiUsageTotals(sessionClient),
      fetchAiUsageTotals(serviceClient),
      fetchAiUsageModels(sessionClient),
      fetchAiUsageModels(serviceClient),
      fetchAllRows(
        sessionClient,
        "restaurant_ai_usage_today",
        "restaurant_id, total_tokens",
      ).then((result) => result.rows),
      fetchAllRows(
        serviceClient,
        "restaurant_ai_usage_today",
        "restaurant_id, total_tokens",
      ).then((result) => result.rows),
      fetchAllRows(
        sessionClient,
        "restaurant_ai_usage_week",
        "restaurant_id, total_tokens",
      ).then((result) => result.rows),
      fetchAllRows(
        serviceClient,
        "restaurant_ai_usage_week",
        "restaurant_id, total_tokens",
      ).then((result) => result.rows),
      fetchAllRows(
        sessionClient,
        "restaurant_ai_usage_hourly",
        "hour, chat_calls, all_calls, chat_tokens, total_tokens",
      ).then((result) => result.rows),
      fetchAllRows(
        serviceClient,
        "restaurant_ai_usage_hourly",
        "hour, chat_calls, all_calls, chat_tokens, total_tokens",
      ).then((result) => result.rows),
      fetchAiUsageEvents(sessionClient),
      fetchAiUsageEvents(serviceClient),
    ]);

  const restaurantRows = mergeById([sessionRestaurants, serviceRestaurants]);
  const callCounts = orderCountsByRestaurant(
    mergeById([sessionCalls, serviceCalls]),
  );
  const orderTableCounts = orderCountsByRestaurant(
    mergeById([sessionOrders, serviceOrders]),
  );
  const aiUsage = aiUsageByRestaurant(
    mergeByRestaurantId([sessionAiUsage, serviceAiUsage]),
  );
  const models = modelsByRestaurant(
    mergeModelRows([sessionAiModels, serviceAiModels]),
  );
  const todayTokens = tokenSumByRestaurant(
    mergeByRestaurantId([sessionAiToday, serviceAiToday]),
  );
  const weekTokens = tokenSumByRestaurant(
    mergeByRestaurantId([sessionAiWeek, serviceAiWeek]),
  );
  const hourly = fillHourlyBuckets(
    serviceHourly.length ? serviceHourly : sessionHourly,
  );
  const usageEvents = serviceAiEvents.length ? serviceAiEvents : sessionAiEvents;
  const projections = projectionByRestaurant(usageEvents);
  const exactUsage = exactUsageByRestaurant(usageEvents);
  const emptyProjection = projectMonthlyGeminiCostFromRows([]);
  const restaurants = restaurantRows
    .map((row) => {
      const id = String(row.id ?? "");
      const orderCount =
        (callCounts.get(id) ?? 0) + (orderTableCounts.get(id) ?? 0);
      return toTenant(row, {
        orderCount,
        lifetime: exactUsage.get(id) ?? aiUsage.get(id) ?? { tokens: 0, cost: 0 },
        today: todayTokens.get(id) ?? 0,
        week: weekTokens.get(id) ?? 0,
        models: models.get(id) ?? [],
        projection: projections.get(id) ?? emptyProjection,
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const active = restaurants.filter((row) => row.subscription_status === "active");
  const kpis: SuperAdminKpis = {
    totalRestaurants: restaurants.length,
    activeSubscribers: active.length,
    mrr: active.reduce((sum, row) => sum + row.subscription_fee, 0),
    totalOrders: restaurants.reduce((sum, row) => sum + row.order_count, 0),
    ai_total_tokens: restaurants.reduce(
      (sum, row) => sum + row.ai_total_tokens,
      0,
    ),
    ai_cost_usd: restaurants.reduce((sum, row) => sum + row.ai_cost_usd, 0),
    ai_monthly_projected_usd: restaurants.reduce(
      (sum, row) => sum + (row.ai_monthly_projected_usd ?? 0),
      0,
    ),
    ai_alert_count: restaurants.filter((row) => row.ai_alert !== "ok").length,
  };

  return { restaurants, kpis, hourly };
}
