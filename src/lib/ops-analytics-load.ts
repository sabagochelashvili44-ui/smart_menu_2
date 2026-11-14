import type { IntentEvent, WaiterCallMetric } from "@/lib/ai/analytics";
import {
  computeOpsAnalytics,
  type OpsCall,
  type OpsCategory,
  type OpsDish,
  type OpsIntentEvent,
  type OpsPriceChange,
  type OpsReport,
  type OpsWeatherDay,
} from "@/lib/ops-analytics";
import { calendarDateInTbilisi, isTimestampInRange } from "@/lib/restaurant-day";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const DAY_MS = 24 * 60 * 60 * 1000;

function missingColumn(message: string, column: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes(column) &&
    (lower.includes("schema cache") ||
      lower.includes("column") ||
      lower.includes("could not find") ||
      lower.includes("does not exist"))
  );
}

function toOpsEvent(event: IntentEvent): OpsIntentEvent {
  return {
    dish_id: event.dish_id,
    dish_name: event.dish_name,
    category_id: event.category_id ?? "",
    event_type: event.event_type,
    quantity: event.quantity,
    duration_ms: event.duration_ms ?? 0,
    table_id: event.table_id,
    session_id: event.session_id ?? "",
    created_at: event.created_at,
  };
}

function toOpsCall(call: WaiterCallMetric): OpsCall {
  return {
    id: call.id,
    table_id: call.table_id,
    table_number: call.table_number,
    call_type: call_typeOf(call),
    items: call.items,
    status: call.status,
    created_at: call.created_at,
    acknowledged_at: call.acknowledged_at,
    acknowledged_by: call.acknowledged_by,
    acknowledged_by_email: call.acknowledged_by_email,
    ready_at: call.ready_at,
  };
}

function call_typeOf(call: WaiterCallMetric) {
  return call.call_type;
}

function inWindow(iso: string | null | undefined, from: Date, to: Date) {
  return isTimestampInRange(iso, from, to);
}

function toCategory(row: Record<string, unknown>): OpsCategory {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    station: String(row.station ?? "kitchen"),
    menu_role: String(row.menu_role ?? "food"),
  };
}

async function loadPrepDishes(restaurantId: string, dishes: OpsDish[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("dishes")
    .select("id, prep_minutes")
    .eq("restaurant_id", restaurantId);
  if (error || !data) return dishes;
  const prep = new Map(
    (data as Array<{ id?: string; prep_minutes?: number | null }>).map((row) => [
      String(row.id),
      row.prep_minutes ?? null,
    ]),
  );
  return dishes.map((dish) => ({
    ...dish,
    prep_minutes: prep.get(dish.id) ?? dish.prep_minutes,
  }));
}

async function loadCategories(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  const full = await supabase
    .from("categories")
    .select("id, name, station, menu_role")
    .eq("restaurant_id", restaurantId);
  if (!full.error) {
    return ((full.data ?? []) as Record<string, unknown>[]).map(toCategory);
  }
  const basic = await supabase
    .from("categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId);
  return ((basic.data ?? []) as Record<string, unknown>[]).map(toCategory);
}

async function loadPriceChanges(restaurantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("dish_price_changes")
    .select("dish_id, dish_name, old_price, new_price, changed_at")
    .eq("restaurant_id", restaurantId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error || !data) return [] as OpsPriceChange[];
  return (data as Record<string, unknown>[]).map((record) => ({
    dish_id: String(record.dish_id ?? ""),
    dish_name: String(record.dish_name ?? ""),
    old_price: Number(record.old_price) || 0,
    new_price: Number(record.new_price) || 0,
    changed_at: String(record.changed_at ?? ""),
  }));
}

function callsWithItems(rows: Record<string, unknown>[]): OpsCall[] {
  return rows.map((row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      id: String(row.id ?? ""),
      table_id: row.table_id ? String(row.table_id) : undefined,
      status: String(row.status ?? ""),
      call_type: row.call_type ? String(row.call_type) : null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
      items: items.map((item) => {
        const line = item as Record<string, unknown>;
        const note = String(line.note ?? "").trim();
        return {
          dish_id: String(line.dish_id ?? ""),
          name: String(line.name ?? ""),
          quantity: Number(line.quantity) || 0,
          unit_price: Number(line.unit_price) || 0,
          ...(note ? { note } : {}),
        };
      }),
    };
  });
}

async function loadHistoryCallItems(restaurantId: string, fromIso: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("waiter_calls")
    .select("id, items, status, created_at, acknowledged_at, table_id, call_type")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", fromIso)
    .limit(5000);
  if (error || !data) return [] as OpsCall[];
  return callsWithItems(data as Record<string, unknown>[]);
}

type WeatherSync = {
  days: OpsWeatherDay[];
  forecastRain: boolean | null;
  hasLocation: boolean;
  unavailable: boolean;
};

async function syncWeather(restaurantId: string): Promise<WeatherSync> {
  const supabase = createSupabaseAdminClient();
  const place = await supabase
    .from("restaurants")
    .select("latitude, longitude")
    .eq("id", restaurantId)
    .maybeSingle();
  if (
    place.error &&
    (missingColumn(place.error.message, "latitude") ||
      missingColumn(place.error.message, "longitude"))
  ) {
    return { days: [], forecastRain: null, hasLocation: false, unavailable: true };
  }
  const latitude = Number(place.data?.latitude);
  const longitude = Number(place.data?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { days: [], forecastRain: null, hasLocation: false, unavailable: false };
  }

  const today = calendarDateInTbilisi();
  const start = calendarDateInTbilisi(new Date(Date.now() - 90 * DAY_MS));
  const stored = await supabase
    .from("restaurant_weather_days")
    .select("day, precipitation_mm, condition")
    .eq("restaurant_id", restaurantId)
    .gte("day", start);
  if (stored.error) {
    return { days: [], forecastRain: null, hasLocation: true, unavailable: true };
  }

  const days = new Map<string, OpsWeatherDay>();
  for (const row of (stored.data ?? []) as Record<string, unknown>[]) {
    const day = String(row.day ?? "");
    if (!day) continue;
    days.set(day, {
      day,
      precipitation_mm: Number(row.precipitation_mm) || 0,
      condition: row.condition === "rain" ? "rain" : "dry",
    });
  }

  try {
    const yesterday = calendarDateInTbilisi(new Date(Date.now() - DAY_MS));
    if (!days.has(yesterday)) {
      const archive = await fetchWeather(
        "https://archive-api.open-meteo.com/v1/archive",
        latitude,
        longitude,
        start,
        yesterday,
      );
      await upsertWeather(restaurantId, archive, days);
    }
    const tomorrow = calendarDateInTbilisi(new Date(Date.now() + DAY_MS));
    const forecast = await fetchWeather(
      "https://api.open-meteo.com/v1/forecast",
      latitude,
      longitude,
      today,
      tomorrow,
    );
    await upsertWeather(restaurantId, forecast, days);
    return {
      days: [...days.values()],
      forecastRain: days.get(tomorrow)?.condition === "rain",
      hasLocation: true,
      unavailable: !days.has(tomorrow),
    };
  } catch {
    return {
      days: [...days.values()],
      forecastRain: null,
      hasLocation: true,
      unavailable: true,
    };
  }
}

async function fetchWeather(
  base: string,
  latitude: number,
  longitude: number,
  start: string,
  end: string,
) {
  const url = new URL(base);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);
  url.searchParams.set("daily", "temperature_2m_mean,precipitation_sum");
  url.searchParams.set("timezone", "Asia/Tbilisi");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("weather");
  const json = (await response.json()) as {
    daily?: {
      time?: string[];
      temperature_2m_mean?: Array<number | null>;
      precipitation_sum?: Array<number | null>;
    };
  };
  const time = json.daily?.time ?? [];
  return time.map((day, index) => {
    const precipitation = Number(json.daily?.precipitation_sum?.[index] ?? 0);
    return {
      day,
      temperature_c: json.daily?.temperature_2m_mean?.[index] ?? null,
      precipitation_mm: Number.isFinite(precipitation) ? precipitation : 0,
      condition: precipitation >= 1 ? ("rain" as const) : ("dry" as const),
    };
  });
}

async function upsertWeather(
  restaurantId: string,
  rows: Array<{
    day: string;
    temperature_c: number | null;
    precipitation_mm: number;
    condition: "rain" | "dry";
  }>,
  days: Map<string, OpsWeatherDay>,
) {
  const payload = rows
    .filter((row) => row.day)
    .map((row) => ({
      restaurant_id: restaurantId,
      day: row.day,
      temperature_c: row.temperature_c,
      precipitation_mm: row.precipitation_mm,
      condition: row.condition,
    }));
  if (!payload.length) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("restaurant_weather_days")
    .upsert(payload, { onConflict: "restaurant_id,day" });
  if (error) return;
  for (const row of payload) {
    days.set(row.day, {
      day: row.day,
      precipitation_mm: row.precipitation_mm,
      condition: row.condition,
    });
  }
}

export async function loadOpsAnalytics(input: {
  restaurantId: string;
  from: Date;
  to: Date;
  events: IntentEvent[];
  calls: WaiterCallMetric[];
  dishes: Array<{ id: string; name: string; category_id?: string }>;
  peakHours: number[];
}): Promise<OpsReport> {
  const supabase = createSupabaseAdminClient();
  const [categories, priceChanges, weather, place] = await Promise.all([
    loadCategories(input.restaurantId),
    loadPriceChanges(input.restaurantId),
    syncWeather(input.restaurantId),
    supabase
      .from("restaurants")
      .select("customization_extra_minutes")
      .eq("id", input.restaurantId)
      .maybeSingle(),
  ]);

  const extraRaw = Number(
    (place.data as { customization_extra_minutes?: number } | null)
      ?.customization_extra_minutes,
  );
  const dishes = await loadPrepDishes(
    input.restaurantId,
    input.dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      category_id: dish.category_id ?? "",
      prep_minutes: null,
    })),
  );

  let historyCalls = input.calls.map(toOpsCall);
  if (priceChanges.length) {
    const oldest = priceChanges.reduce((min, change) => {
      const time = new Date(change.changed_at).getTime();
      return Number.isFinite(time) ? Math.min(min, time) : min;
    }, Date.now());
    const loaded = await loadHistoryCallItems(
      input.restaurantId,
      new Date(oldest - 14 * DAY_MS).toISOString(),
    );
    if (loaded.length) historyCalls = loaded;
  }

  return computeOpsAnalytics({
    events: input.events
      .filter((event) => inWindow(event.created_at, input.from, input.to))
      .map(toOpsEvent),
    calls: input.calls
      .filter((call) =>
        inWindow(call.acknowledged_at || call.created_at, input.from, input.to),
      )
      .map(toOpsCall),
    dishes,
    categories,
    priceChanges,
    historyCalls,
    weatherDays: weather.days,
    forecastRain: weather.forecastRain,
    hasLocation: weather.hasLocation,
    weatherUnavailable: weather.unavailable,
    peakHours: input.peakHours,
    extraMinutesEach: Number.isFinite(extraRaw) ? extraRaw : 2,
  });
}
