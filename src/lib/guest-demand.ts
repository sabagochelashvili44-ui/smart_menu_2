import type { IntentEvent } from "@/lib/ai/analytics";
import { isDishSaleItem } from "@/lib/dish-analytics";
import { looksLikeCulinaryQuestion } from "@/lib/host-query";
import { tbilisiHour, type HourBucket } from "@/lib/overview-ops";
import { RESTAURANT_TZ } from "@/lib/restaurant-day";
import {
  callSaleStamp,
  confirmedSalesInWindow,
  type SaleCall,
} from "@/lib/sales-metrics";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const OFF_MENU_MIN_COUNT = 5;
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type OffMenuDemandRow = {
  key: string;
  name: string;
  count: number;
};

export type WeekdayBucket = {
  weekday: number;
  key: WeekdayKey;
  orders: number;
  isPeak: boolean;
};

export type PeakDemandDish = {
  id: string;
  name: string;
  sold: number;
  interest: number;
};

export type DemandPeaksReport = {
  offMenu: OffMenuDemandRow[];
  peakHours: HourBucket[];
  peakDays: WeekdayBucket[];
  peakDemand: PeakDemandDish[];
};

export type OffMenuSource = "search" | "chat";

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const SKIP_WHOLE =
  /^(გამარჯობა|სალამი|მადლობა|hello|hi|hey|thanks|thank you|ok|okay|yes|no|კი|არა|привет|спасибо|меню|მენიუ|waiter|მიმტანი)$/i;

export function demandQueryKey(raw: string) {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function offMenuDishQuery(raw: string): string | null {
  const original = raw.trim();
  if (original.length < 3 || original.length > 120) return null;

  const extracted = original.match(
    /^(?:do you have|have you got|is there|got any|can i (?:get|have)|გაქვთ(?:\s+თუ)?|არის(?:\s+თუ\s+არა)?|მინდა|გინდა|მომეცით|есть ли|у вас есть|можно|хочу)\s+(.+)$/i,
  );
  let text = (extracted?.[1] ?? original).replace(/[?؟!.,!;:]+$/g, "").trim();
  if (SKIP_WHOLE.test(text)) return null;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length <= 3) {
    const key = demandQueryKey(text);
    return key.length >= 3 ? text.slice(0, 80) : null;
  }
  if (!extracted && looksLikeCulinaryQuestion(original)) return null;
  if (words.length > 8) return null;
  const key = demandQueryKey(text);
  return key.length >= 3 ? text.slice(0, 80) : null;
}

export function menuCoversQuery(
  dishes: Array<{
    name?: string | null;
    name_en?: string | null;
    name_ru?: string | null;
    description?: string | null;
    description_en?: string | null;
    description_ru?: string | null;
    ingredients?: string[] | null;
  }>,
  query: string,
) {
  const needle = demandQueryKey(query);
  if (!needle) return true;
  return dishes.some((dish) => {
    const fields = [
      dish.name,
      dish.name_en,
      dish.name_ru,
      dish.description,
      dish.description_en,
      dish.description_ru,
      ...(dish.ingredients ?? []),
    ];
    return fields.some((field) => {
      const hay = demandQueryKey(String(field ?? ""));
      if (!hay) return false;
      if (hay.includes(needle)) return true;
      return needle.includes(hay) && hay.length >= 4;
    });
  });
}

export function tbilisiWeekdayIndex(iso: string) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TZ,
    weekday: "short",
  }).format(new Date(iso));
  return WEEKDAY_INDEX[short] ?? 0;
}

export function computeWeekdayAcknowledgedOrders(
  calls: SaleCall[],
  from: Date,
  to: Date,
): WeekdayBucket[] {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const call of confirmedSalesInWindow(calls, from, to)) {
    const stamp = callSaleStamp(call);
    if (!stamp) continue;
    counts[tbilisiWeekdayIndex(stamp)] += 1;
  }
  const peak = Math.max(0, ...counts);
  return WEEKDAY_KEYS.map((key, weekday) => ({
    weekday,
    key,
    orders: counts[weekday] ?? 0,
    isPeak: peak > 0 && counts[weekday] === peak,
  }));
}

export function computeOffMenuDemand(
  rows: Array<{ query_key?: string; query_raw?: string }>,
): OffMenuDemandRow[] {
  const byKey = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const key = demandQueryKey(String(row.query_key ?? row.query_raw ?? ""));
    const name = String(row.query_raw ?? "").trim() || key;
    if (key.length < 3) continue;
    const current = byKey.get(key) ?? { name, count: 0 };
    current.count += 1;
    if (name.length > 0) current.name = name;
    byKey.set(key, current);
  }
  return [...byKey.entries()]
    .filter(([, row]) => row.count >= OFF_MENU_MIN_COUNT)
    .map(([key, row]) => ({ key, name: row.name, count: row.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function computePeakDemandDishes(input: {
  calls: SaleCall[];
  events: IntentEvent[];
  peakHours: number[];
  from: Date;
  to: Date;
}): PeakDemandDish[] {
  const peak = new Set(input.peakHours);
  if (!peak.size) return [];
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const byId = new Map<string, PeakDemandDish>();

  function bump(
    id: string,
    name: string,
    sold: number,
    interest: number,
  ) {
    const key = id || name;
    if (!key) return;
    const current = byId.get(key) ?? { id: key, name, sold: 0, interest: 0 };
    current.sold += sold;
    current.interest += interest;
    if (name) current.name = name;
    byId.set(key, current);
  }

  for (const call of confirmedSalesInWindow(input.calls, input.from, input.to)) {
    const stamp = callSaleStamp(call);
    if (!stamp || !peak.has(tbilisiHour(stamp))) continue;
    for (const item of call.items ?? []) {
      if (!isDishSaleItem(item)) continue;
      bump(item.dish_id, item.name, item.quantity, 0);
    }
  }

  for (const event of input.events) {
    const at = event.created_at ? new Date(event.created_at).getTime() : 0;
    if (!at || at < fromMs || at > toMs || !event.created_at) continue;
    if (!peak.has(tbilisiHour(event.created_at))) continue;
    const qty = Math.max(1, Number(event.quantity) || 1);
    if (event.event_type === "cart_add") {
      bump(event.dish_id, event.dish_name, 0, qty);
    } else if (event.event_type === "dish_dwell" || event.event_type === "view") {
      bump(event.dish_id, event.dish_name, 0, 1);
    }
  }

  return [...byId.values()]
    .filter((row) => row.sold + row.interest > 0)
    .sort(
      (a, b) =>
        b.sold + b.interest - (a.sold + a.interest) ||
        b.sold - a.sold ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 8);
}

function isMissingDemandTable(message: string) {
  return /off_menu_requests|schema cache|does not exist|could not find the/i.test(
    message,
  );
}

export async function insertOffMenuRequest(input: {
  restaurantId: string;
  tableId?: string | null;
  sessionId?: string | null;
  source: OffMenuSource;
  query: string;
}) {
  const query = input.query.trim().slice(0, 80);
  const key = demandQueryKey(query);
  if (key.length < 3) return;
  const supabase = createSupabaseAdminClient();
  const sessionId = String(input.sessionId ?? "").trim().slice(0, 80);
  if (sessionId) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const existing = await supabase
      .from("off_menu_requests")
      .select("id")
      .eq("restaurant_id", input.restaurantId)
      .eq("session_id", sessionId)
      .eq("query_key", key)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (!existing.error && existing.data) return;
  }

  const inserted = await supabase.from("off_menu_requests").insert({
    restaurant_id: input.restaurantId,
    table_id: input.tableId || null,
    session_id: sessionId,
    source: input.source,
    query_raw: query,
    query_key: key,
  });
  if (inserted.error && !isMissingDemandTable(inserted.error.message)) {
    console.error("[demand] insert failed", inserted.error.message);
  }
}

export async function loadOffMenuRequests(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<OffMenuDemandRow[]> {
  const supabase = createSupabaseAdminClient();
  const rows: Array<{ query_key?: string; query_raw?: string }> = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const result = await supabase
      .from("off_menu_requests")
      .select("query_key, query_raw")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .range(offset, offset + page - 1);
    if (result.error) {
      if (isMissingDemandTable(result.error.message)) return [];
      throw new Error(result.error.message);
    }
    const chunk = (result.data ?? []) as Array<{
      query_key?: string;
      query_raw?: string;
    }>;
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return computeOffMenuDemand(rows);
}
