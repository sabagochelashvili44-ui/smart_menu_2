import { isDishSaleItem } from "@/lib/dish-analytics";
import { tbilisiHour } from "@/lib/overview-ops";
import { RESTAURANT_OFFSET, RESTAURANT_TZ, calendarDateInTbilisi } from "@/lib/restaurant-day";
import {
  SALE_SESSION_MS,
  isConfirmedSale,
  splitCallRevenue,
  type SaleCall,
  type SaleLine,
} from "@/lib/sales-metrics";

export type OpsIntentEvent = {
  dish_id: string;
  dish_name: string;
  category_id: string;
  event_type: string;
  quantity: number;
  duration_ms: number;
  table_id?: string;
  session_id: string;
  created_at?: string;
};

export type OpsCall = Omit<SaleCall, "items"> & {
  items: Array<SaleLine & { note?: string }>;
  acknowledged_by?: string | null;
  acknowledged_by_email?: string | null;
  ready_at?: string | null;
};

export type OpsDish = {
  id: string;
  name: string;
  category_id: string;
  prep_minutes: number | null;
};

export type OpsCategory = {
  id: string;
  name: string;
  station: string;
  menu_role: string;
};

export type OpsPriceChange = {
  dish_id: string;
  dish_name: string;
  old_price: number;
  new_price: number;
  changed_at: string;
};

export type OpsWeatherDay = {
  day: string;
  precipitation_mm: number;
  condition: "dry" | "rain";
};

export type OpsAttentionRow = {
  id: string;
  name: string;
  looks: number;
  totalSeconds: number;
  avgSeconds: number;
  orderedQty: number;
  lookedElse: number;
};

export type OpsCategoryDwell = {
  id: string;
  name: string;
  medianSeconds: number;
};

export type OpsWaiterRow = {
  email: string;
  tickets: number;
  avgCheck: number;
  attachRate: number;
  label: "sales" | "operator" | null;
};

export type OpsDelayRow = {
  id: string;
  name: string;
  delayMinutes: number;
  tickets: number;
};

export type OpsNotePhrase = {
  text: string;
  count: number;
  kind: "leave_out" | "extra" | "side" | "other";
};

export type OpsWeatherShift = {
  category: string;
  rainyPercent: number;
  dryPercent: number;
  changePercent: number;
};

export type OpsPriceRow = {
  dishName: string;
  oldPrice: number;
  newPrice: number;
  beforeQty: number;
  afterQty: number;
  increasePercent: number;
  elasticity: number | null;
  held: boolean;
};

export type OpsReport = {
  migrationReady: boolean;
  attention: OpsAttentionRow[];
  decision: {
    medianSeconds: number | null;
    sessions: number;
    categories: OpsCategoryDwell[];
    stuckCategory: string | null;
  };
  waiters: {
    restaurantAvgCheck: number;
    restaurantAttachRate: number;
    rows: OpsWaiterRow[];
  };
  kitchen: {
    rows: OpsDelayRow[];
    categories: OpsDelayRow[];
    stations: OpsDelayRow[];
    readyTickets: number;
  };
  customizations: {
    notedLines: number;
    ticketShare: number;
    extraMinutes: number;
    phrases: OpsNotePhrase[];
    kinds: Record<OpsNotePhrase["kind"], number>;
  };
  weather: {
    status: "needs_location" | "need_history" | "ready" | "unavailable";
    forecastRain: boolean | null;
    sampleDays: number;
    shifts: OpsWeatherShift[];
  };
  prices: {
    status: "empty" | "ready" | "demand_cut";
    rows: OpsPriceRow[];
    redLine: { dishName: string; increasePercent: number } | null;
  };
};

const ATTACH_ROLES = new Set(["drink", "dessert", "sauce"]);
const MIN_WAITER_TICKETS = 8;
const MIN_ELASTICITY_UNITS = 10;
const ELASTICITY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const HOLD_RATIO = 0.85;
const MIN_WEATHER_DAYS = 8;
const MIN_WEATHER_CLASS = 3;

const LEAVE_OUT = [/გარეშე/, /არ მინდა/, /\bwithout\b/i, /\bno\b/i, /hold the/i, /без/i, /убрат/i];
const EXTRA = [/დამატ/, /extra/i, /дополн/i, /побольш/i];
const SIDE = [/ცალკე/, /on the side/i, /отдельн/i, /\bside\b/i];

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function stampMs(iso?: string | null) {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : 0;
}

function tbilisiWeekday(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TZ,
    weekday: "short",
  }).format(new Date(iso));
}

function tbilisiDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function noteKind(text: string): OpsNotePhrase["kind"] {
  if (LEAVE_OUT.some((pattern) => pattern.test(text))) return "leave_out";
  if (EXTRA.some((pattern) => pattern.test(text))) return "extra";
  if (SIDE.some((pattern) => pattern.test(text))) return "side";
  return "other";
}

function isLook(event: OpsIntentEvent) {
  return event.event_type === "dish_dwell" || event.event_type === "view";
}

export function computeOpsAnalytics(input: {
  events: OpsIntentEvent[];
  calls: OpsCall[];
  dishes: OpsDish[];
  categories: OpsCategory[];
  priceChanges: OpsPriceChange[];
  historyCalls?: OpsCall[];
  weatherDays: OpsWeatherDay[];
  forecastRain: boolean | null;
  hasLocation: boolean;
  weatherUnavailable: boolean;
  peakHours: number[];
  extraMinutesEach: number;
  now?: number;
}): OpsReport {
  const now = input.now ?? Date.now();
  const categoryById = new Map(input.categories.map((row) => [row.id, row]));
  const dishById = new Map(input.dishes.map((row) => [row.id, row]));
  const sales = input.calls.filter((call) => isConfirmedSale(call));
  const peak = new Set(input.peakHours);

  const soldQty = new Map<string, number>();
  for (const call of sales) {
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const key = item.dish_id || item.name;
      soldQty.set(key, (soldQty.get(key) ?? 0) + item.quantity);
    }
  }

  const attention = new Map<
    string,
    { name: string; looks: number; ms: number; lookedElse: number }
  >();
  const sessions = new Map<
    string,
    {
      start: number;
      tableId: string;
      looks: Map<string, string>;
      firstCart: number;
      categoryMs: Map<string, number>;
    }
  >();

  for (const event of input.events) {
    const sessionKey = event.session_id || "";
    if (sessionKey) {
      const session = sessions.get(sessionKey) ?? {
        start: 0,
        tableId: event.table_id ?? "",
        looks: new Map<string, string>(),
        firstCart: 0,
        categoryMs: new Map<string, number>(),
      };
      if (event.table_id) session.tableId = event.table_id;
      const at = stampMs(event.created_at);
      if (event.event_type === "session_start" && at) session.start = at;
      if (event.event_type === "cart_add" && at) {
        session.firstCart = session.firstCart
          ? Math.min(session.firstCart, at)
          : at;
      }
      if (event.event_type === "category_dwell" && event.category_id) {
        session.categoryMs.set(
          event.category_id,
          (session.categoryMs.get(event.category_id) ?? 0) + event.duration_ms,
        );
      }
      if (isLook(event) && event.dish_id) {
        session.looks.set(event.dish_id, event.dish_name);
      }
      sessions.set(sessionKey, session);
    }

    if (!isLook(event) || !event.dish_id) continue;
    const key = event.dish_id;
    const row = attention.get(key) ?? {
      name: event.dish_name,
      looks: 0,
      ms: 0,
      lookedElse: 0,
    };
    row.looks += Math.max(1, event.quantity);
    row.ms += Math.max(0, event.duration_ms);
    if (event.dish_name) row.name = event.dish_name;
    attention.set(key, row);
  }

  for (const session of sessions.values()) {
    if (!session.tableId || !session.looks.size) continue;
    const start = session.start || 0;
    const ticket = sales.find((call) => {
      if (call.table_id !== session.tableId) return false;
      const at = stampMs(call.acknowledged_at || call.created_at);
      if (!at) return false;
      if (start && (at < start || at > start + SALE_SESSION_MS)) return false;
      return call.items.some((item) => isDishSaleItem(item));
    });
    if (!ticket) continue;
    const ordered = new Set(
      ticket.items.filter((item) => isDishSaleItem(item)).map((item) => item.dish_id),
    );
    if (!ordered.size) continue;
    for (const dishId of session.looks.keys()) {
      if (ordered.has(dishId)) continue;
      const row = attention.get(dishId);
      if (row) row.lookedElse += 1;
    }
  }

  const attentionRows: OpsAttentionRow[] = [...attention.entries()]
    .map(([id, row]) => ({
      id,
      name: dishById.get(id)?.name || row.name || id,
      looks: row.looks,
      totalSeconds: Math.round(row.ms / 1000),
      avgSeconds: row.looks ? Math.round(row.ms / row.looks / 1000) : 0,
      orderedQty: soldQty.get(id) ?? 0,
      lookedElse: row.lookedElse,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || b.looks - a.looks)
    .slice(0, 20);

  const decisionSamples: number[] = [];
  const categorySamples = new Map<string, number[]>();
  for (const session of sessions.values()) {
    if (session.start && session.firstCart > session.start) {
      decisionSamples.push((session.firstCart - session.start) / 1000);
    }
    for (const [categoryId, ms] of session.categoryMs) {
      const list = categorySamples.get(categoryId) ?? [];
      list.push(ms / 1000);
      categorySamples.set(categoryId, list);
    }
  }
  const decisionCategories: OpsCategoryDwell[] = [...categorySamples.entries()]
    .map(([id, samples]) => ({
      id,
      name: categoryById.get(id)?.name || id,
      medianSeconds: Math.round(median(samples) ?? 0),
    }))
    .sort((a, b) => b.medianSeconds - a.medianSeconds);
  const stuck = decisionCategories[0] ?? null;

  const attributed = sales.filter((call) => call.acknowledged_by_email);
  const restaurantChecks = attributed.map((call) => splitCallRevenue(call.items).total);
  const restaurantAvgCheck = restaurantChecks.length
    ? restaurantChecks.reduce((sum, value) => sum + value, 0) / restaurantChecks.length
    : 0;
  const restaurantAttach =
    attributed.length === 0
      ? 0
      : attributed.filter((call) => ticketHasAttach(call, dishById, categoryById))
          .length / attributed.length;

  const byWaiter = new Map<string, OpsCall[]>();
  for (const call of attributed) {
    const email = call.acknowledged_by_email ?? "";
    const list = byWaiter.get(email) ?? [];
    list.push(call);
    byWaiter.set(email, list);
  }
  const waiterRows: OpsWaiterRow[] = [...byWaiter.entries()]
    .map(([email, tickets]) => {
      const checks = tickets.map((call) => splitCallRevenue(call.items).total);
      const avgCheck = checks.reduce((sum, value) => sum + value, 0) / checks.length;
      const attachRate =
        tickets.filter((call) => ticketHasAttach(call, dishById, categoryById)).length /
        tickets.length;
      let label: OpsWaiterRow["label"] = null;
      if (tickets.length >= MIN_WAITER_TICKETS) {
        const aboveCheck = avgCheck > restaurantAvgCheck;
        const aboveAttach = attachRate > restaurantAttach;
        if (aboveCheck && aboveAttach) label = "sales";
        else if (!aboveCheck && !aboveAttach) label = "operator";
      }
      return {
        email,
        tickets: tickets.length,
        avgCheck,
        attachRate,
        label,
      };
    })
    .sort((a, b) => b.avgCheck - a.avgCheck);

  const readySales = sales.filter((call) => call.ready_at && call.created_at);
  const peakReady = readySales.filter((call) =>
    peak.has(tbilisiHour(call.created_at ?? "")),
  );
  const delaySource = peakReady.length ? peakReady : readySales;
  const dishDelay = new Map<string, { name: string; minutes: number; tickets: number }>();
  const categoryDelay = new Map<string, { name: string; minutes: number; tickets: number }>();
  const stationDelay = new Map<string, { name: string; minutes: number; tickets: number }>();

  for (const call of delaySource) {
    const actual = (stampMs(call.ready_at) - stampMs(call.created_at)) / 60000;
    if (actual <= 0) continue;
    const expected = call.items.reduce((max, item) => {
      const prep = dishById.get(item.dish_id)?.prep_minutes ?? 0;
      return Math.max(max, prep);
    }, 0);
    const delay = Math.max(0, actual - expected);
    if (delay <= 0) continue;
    const seenCategory = new Set<string>();
    const seenStation = new Set<string>();
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const dish = dishById.get(item.dish_id);
      const category = dish ? categoryById.get(dish.category_id) : undefined;
      addDelay(dishDelay, item.dish_id || item.name, dish?.name || item.name, delay);
      if (category && !seenCategory.has(category.id)) {
        seenCategory.add(category.id);
        addDelay(categoryDelay, category.id, category.name, delay);
      }
      const station = category?.station || "other";
      if (!seenStation.has(station)) {
        seenStation.add(station);
        addDelay(stationDelay, station, station, delay);
      }
    }
  }

  const notedLines: string[] = [];
  let notedTickets = 0;
  const kinds: Record<OpsNotePhrase["kind"], number> = {
    leave_out: 0,
    extra: 0,
    side: 0,
    other: 0,
  };
  const phrases = new Map<string, { count: number; kind: OpsNotePhrase["kind"] }>();
  for (const call of sales) {
    const notes = call.items
      .map((item) => (item.note ?? "").trim())
      .filter((note) => note.length > 0);
    if (!notes.length) continue;
    notedTickets += 1;
    for (const note of notes) {
      notedLines.push(note);
      const kind = noteKind(note);
      kinds[kind] += 1;
      const key = note.toLowerCase();
      const current = phrases.get(key) ?? { count: 0, kind };
      current.count += 1;
      phrases.set(key, current);
    }
  }

  const weather = buildWeather({
    calls: sales,
    categories: categoryById,
    dishes: dishById,
    days: input.weatherDays,
    forecastRain: input.forecastRain,
    hasLocation: input.hasLocation,
    unavailable: input.weatherUnavailable,
    now,
  });

  const priceRows = buildPrices(
    input.priceChanges,
    input.historyCalls ?? input.calls,
    now,
  );
  const held = priceRows.filter((row) => row.held && row.increasePercent > 0);
  const redLine = held.sort((a, b) => b.increasePercent - a.increasePercent)[0];
  const completedIncreases = priceRows.filter((row) => row.increasePercent > 0);

  return {
    migrationReady: true,
    attention: attentionRows,
    decision: {
      medianSeconds: median(decisionSamples),
      sessions: decisionSamples.length,
      categories: decisionCategories.slice(0, 8),
      stuckCategory: stuck && stuck.medianSeconds > 0 ? stuck.name : null,
    },
    waiters: {
      restaurantAvgCheck,
      restaurantAttachRate: restaurantAttach,
      rows: waiterRows,
    },
    kitchen: {
      rows: topDelay(dishDelay),
      categories: topDelay(categoryDelay),
      stations: topDelay(stationDelay),
      readyTickets: readySales.length,
    },
    customizations: {
      notedLines: notedLines.length,
      ticketShare: sales.length ? notedTickets / sales.length : 0,
      extraMinutes: notedLines.length * Math.max(0, input.extraMinutesEach),
      phrases: [...phrases.entries()]
        .map(([text, row]) => ({ text, count: row.count, kind: row.kind }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      kinds,
    },
    weather,
    prices: {
      status: !completedIncreases.length
        ? "empty"
        : held.length
          ? "ready"
          : "demand_cut",
      rows: priceRows.slice(0, 12),
      redLine: redLine
        ? { dishName: redLine.dishName, increasePercent: redLine.increasePercent }
        : null,
    },
  };
}

function ticketHasAttach(
  call: OpsCall,
  dishes: Map<string, OpsDish>,
  categories: Map<string, OpsCategory>,
) {
  return call.items.some((item) => {
    const dish = dishes.get(item.dish_id);
    const role = dish ? categories.get(dish.category_id)?.menu_role : "";
    return role ? ATTACH_ROLES.has(role) : false;
  });
}

function addDelay(
  bucket: Map<string, { name: string; minutes: number; tickets: number }>,
  id: string,
  name: string,
  minutes: number,
) {
  const current = bucket.get(id) ?? { name, minutes: 0, tickets: 0 };
  current.minutes += minutes;
  current.tickets += 1;
  current.name = name || current.name;
  bucket.set(id, current);
}

function topDelay(
  bucket: Map<string, { name: string; minutes: number; tickets: number }>,
): OpsDelayRow[] {
  return [...bucket.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      delayMinutes: Math.round(row.minutes),
      tickets: row.tickets,
    }))
    .sort((a, b) => b.delayMinutes - a.delayMinutes)
    .slice(0, 8);
}

function buildPrices(changes: OpsPriceChange[], calls: OpsCall[], now: number) {
  const rows: OpsPriceRow[] = [];
  for (const change of changes) {
    const at = stampMs(change.changed_at);
    if (!at || now < at + ELASTICITY_WINDOW_MS) continue;
    const before = unitsBetween(
      calls,
      change.dish_id,
      at - ELASTICITY_WINDOW_MS,
      at,
    );
    const after = unitsBetween(calls, change.dish_id, at, at + ELASTICITY_WINDOW_MS);
    if (before < MIN_ELASTICITY_UNITS) continue;
    const increasePercent =
      change.old_price > 0
        ? ((change.new_price - change.old_price) / change.old_price) * 100
        : 0;
    const qtyChange = (after - before) / before;
    const priceChange = increasePercent / 100;
    const elasticity =
      Math.abs(priceChange) > 0.001 ? qtyChange / priceChange : null;
    const held = increasePercent > 0 && after / before >= HOLD_RATIO;
    rows.push({
      dishName: change.dish_name,
      oldPrice: change.old_price,
      newPrice: change.new_price,
      beforeQty: before,
      afterQty: after,
      increasePercent: Math.round(increasePercent),
      elasticity: elasticity === null ? null : Number(elasticity.toFixed(2)),
      held,
    });
  }
  return rows.sort((a, b) => b.increasePercent - a.increasePercent);
}

function unitsBetween(calls: OpsCall[], dishId: string, from: number, to: number) {
  let qty = 0;
  for (const call of calls) {
    if (!isConfirmedSale(call)) continue;
    const at = stampMs(call.acknowledged_at || call.created_at);
    if (at < from || at >= to) continue;
    for (const item of call.items) {
      if (item.dish_id === dishId && isDishSaleItem(item)) qty += item.quantity;
    }
  }
  return qty;
}

function buildWeather(input: {
  calls: OpsCall[];
  categories: Map<string, OpsCategory>;
  dishes: Map<string, OpsDish>;
  days: OpsWeatherDay[];
  forecastRain: boolean | null;
  hasLocation: boolean;
  unavailable: boolean;
  now: number;
}): OpsReport["weather"] {
  if (!input.hasLocation) {
    return { status: "needs_location", forecastRain: null, sampleDays: 0, shifts: [] };
  }
  if (input.unavailable || input.forecastRain === null) {
    return { status: "unavailable", forecastRain: null, sampleDays: 0, shifts: [] };
  }
  const weatherByDay = new Map(input.days.map((day) => [day.day, day.condition]));
  const tomorrow = new Date(
    `${calendarDateInTbilisi(new Date(input.now))}T12:00:00${RESTAURANT_OFFSET}`,
  );
  tomorrow.setTime(tomorrow.getTime() + 24 * 60 * 60 * 1000);
  const weekday = tbilisiWeekday(tomorrow.toISOString());
  const buckets = new Map<
    string,
    { condition: "dry" | "rain"; counts: Map<string, number> }
  >();

  for (const call of input.calls) {
    if (!call.created_at) continue;
    if (tbilisiHour(call.created_at) < 17) continue;
    if (tbilisiWeekday(call.created_at) !== weekday) continue;
    const day = tbilisiDay(call.created_at);
    const condition = weatherByDay.get(day);
    if (!condition) continue;
    const bucket = buckets.get(day) ?? { condition, counts: new Map<string, number>() };
    for (const item of call.items) {
      if (!isDishSaleItem(item)) continue;
      const dish = input.dishes.get(item.dish_id);
      const name = dish
        ? input.categories.get(dish.category_id)?.name
        : "";
      if (!name) continue;
      bucket.counts.set(name, (bucket.counts.get(name) ?? 0) + item.quantity);
    }
    buckets.set(day, bucket);
  }

  const rainyDays = [...buckets.values()].filter((row) => row.condition === "rain");
  const dryDays = [...buckets.values()].filter((row) => row.condition === "dry");
  const sampleDays = rainyDays.length + dryDays.length;
  const forecastClass = input.forecastRain ? rainyDays : dryDays;
  const otherClass = input.forecastRain ? dryDays : rainyDays;
  if (
    sampleDays < MIN_WEATHER_DAYS ||
    forecastClass.length < MIN_WEATHER_CLASS ||
    otherClass.length < MIN_WEATHER_CLASS
  ) {
    return {
      status: "need_history",
      forecastRain: input.forecastRain,
      sampleDays,
      shifts: [],
    };
  }

  const rainyShare = shareByCategory(rainyDays);
  const dryShare = shareByCategory(dryDays);
  const names = new Set([...rainyShare.keys(), ...dryShare.keys()]);
  const shifts: OpsWeatherShift[] = [];
  for (const name of names) {
    const rainyPercent = rainyShare.get(name) ?? 0;
    const dryPercent = dryShare.get(name) ?? 0;
    if (dryPercent <= 0) continue;
    shifts.push({
      category: name,
      rainyPercent: Math.round(rainyPercent),
      dryPercent: Math.round(dryPercent),
      changePercent: Math.round(((rainyPercent - dryPercent) / dryPercent) * 100),
    });
  }
  shifts.sort(
    (a, b) =>
      Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );

  return {
    status: "ready",
    forecastRain: input.forecastRain,
    sampleDays,
    shifts: shifts.slice(0, 6),
  };
}

function shareByCategory(
  days: Array<{ counts: Map<string, number> }>,
) {
  const totals = new Map<string, number>();
  let all = 0;
  for (const day of days) {
    for (const [name, qty] of day.counts) {
      totals.set(name, (totals.get(name) ?? 0) + qty);
      all += qty;
    }
  }
  const share = new Map<string, number>();
  if (!all) return share;
  for (const [name, qty] of totals) share.set(name, (qty / all) * 100);
  return share;
}
