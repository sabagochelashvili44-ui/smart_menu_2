import { isDishSaleItem } from "@/lib/dish-analytics";
import {
  SALE_SESSION_MS,
  isConfirmedSale,
  type SaleCall,
} from "@/lib/sales-metrics";

export const MENU_READING_MIN_LOOKS = 10;
const MIN_PATH_SESSIONS = 3;
const MAX_PATH_STEPS = 4;
const MAX_LIST = 8;

export type MenuReadingReason =
  | "price"
  | "substitution"
  | "slow_choice"
  | "low_visibility";

export type MenuReadingEvent = {
  dish_id: string;
  dish_name: string;
  category_id?: string;
  event_type: string;
  quantity: number;
  duration_ms?: number;
  table_id?: string;
  session_id?: string;
  created_at?: string;
};

export type MenuReadingDish = {
  id: string;
  name: string;
  category_id: string;
  price: number;
};

export type MenuReadingCategory = {
  id: string;
  name: string;
};

export type MenuReadingHeatRow = {
  id: string;
  name: string;
  looks: number;
  totalSeconds: number;
  share: number;
};

export type MenuReadingPathStep = {
  id: string;
  name: string;
};

export type MenuReadingDishRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  looks: number;
  avgSeconds: number;
  orderedQty: number;
  lookedElse: number;
  conversion: number;
  reasons: MenuReadingReason[];
};

export type MenuReadingReport = {
  ready: boolean;
  sessionCount: number;
  minLooks: number;
  decisionMedianSeconds: number | null;
  stuckCategory: string | null;
  heat: MenuReadingHeatRow[];
  path: MenuReadingPathStep[];
  lingerSkips: MenuReadingDishRow[];
  skipZones: MenuReadingDishRow[];
};

export function emptyMenuReading(ready = false): MenuReadingReport {
  return {
    ready,
    sessionCount: 0,
    minLooks: MENU_READING_MIN_LOOKS,
    decisionMedianSeconds: null,
    stuckCategory: null,
    heat: [],
    path: [],
    lingerSkips: [],
    skipZones: [],
  };
}

function isLook(event: MenuReadingEvent) {
  return event.event_type === "dish_dwell" || event.event_type === "view";
}

function stampMs(iso?: string | null) {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : 0;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function quartile(values: number[], q: 0.25 | 0.5 | 0.75) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx] ?? 0;
}

type AttentionRow = {
  name: string;
  categoryId: string;
  looks: number;
  sessionLooks: number;
  ms: number;
  lookedElse: number;
  orderedSessions: number;
};

type SessionState = {
  start: number;
  tableId: string;
  looks: Map<string, string>;
  firstCart: number;
  categoryMs: Map<string, number>;
  categoryFirst: Map<string, number>;
};

function conversionOf(row: AttentionRow) {
  return row.sessionLooks > 0 ? row.orderedSessions / row.sessionLooks : 0;
}

export function computeMenuReading(input: {
  events: MenuReadingEvent[];
  sales: SaleCall[];
  dishes: MenuReadingDish[];
  categories: MenuReadingCategory[];
}): MenuReadingReport {
  const categoryById = new Map(input.categories.map((row) => [row.id, row]));
  const dishById = new Map(input.dishes.map((row) => [row.id, row]));
  const sales = input.sales.filter((call) => isConfirmedSale(call));

  const soldQty = new Map<string, number>();
  for (const call of sales) {
    for (const item of call.items ?? []) {
      if (!isDishSaleItem(item)) continue;
      const key = item.dish_id || item.name;
      soldQty.set(key, (soldQty.get(key) ?? 0) + item.quantity);
    }
  }

  const attention = new Map<string, AttentionRow>();
  const heatMs = new Map<string, { looks: number; ms: number }>();
  const categoryDwellIds = new Set<string>();
  const sessions = new Map<string, SessionState>();

  const bumpHeat = (categoryId: string, looks: number, ms: number) => {
    if (!categoryId) return;
    const row = heatMs.get(categoryId) ?? { looks: 0, ms: 0 };
    row.looks += looks;
    row.ms += Math.max(0, ms);
    heatMs.set(categoryId, row);
  };

  const ensureAttention = (
    dishId: string,
    name: string,
    categoryId: string,
  ): AttentionRow => {
    const existing = attention.get(dishId);
    if (existing) {
      if (name) existing.name = name;
      if (categoryId && !existing.categoryId) existing.categoryId = categoryId;
      return existing;
    }
    const dish = dishById.get(dishId);
    const row: AttentionRow = {
      name: name || dish?.name || dishId,
      categoryId: categoryId || dish?.category_id || "",
      looks: 0,
      sessionLooks: 0,
      ms: 0,
      lookedElse: 0,
      orderedSessions: 0,
    };
    attention.set(dishId, row);
    return row;
  };

  for (const event of input.events) {
    const sessionKey = event.session_id || "";
    const at = stampMs(event.created_at);
    const duration = Math.max(0, event.duration_ms ?? 0);
    const dish = event.dish_id ? dishById.get(event.dish_id) : undefined;
    const categoryId = event.category_id || dish?.category_id || "";

    if (sessionKey) {
      const session = sessions.get(sessionKey) ?? {
        start: 0,
        tableId: event.table_id ?? "",
        looks: new Map<string, string>(),
        firstCart: 0,
        categoryMs: new Map<string, number>(),
        categoryFirst: new Map<string, number>(),
      };
      if (event.table_id) session.tableId = event.table_id;
      if (event.event_type === "session_start" && at) session.start = at;
      if (event.event_type === "cart_add" && at) {
        session.firstCart = session.firstCart
          ? Math.min(session.firstCart, at)
          : at;
      }
      if (event.event_type === "category_dwell" && categoryId) {
        session.categoryMs.set(
          categoryId,
          (session.categoryMs.get(categoryId) ?? 0) + duration,
        );
        const prev = session.categoryFirst.get(categoryId);
        if (at && (!prev || at < prev)) session.categoryFirst.set(categoryId, at);
      }
      if (isLook(event) && event.dish_id) {
        session.looks.set(event.dish_id, event.dish_name);
        if (categoryId) {
          const prev = session.categoryFirst.get(categoryId);
          if (at && (!prev || at < prev)) session.categoryFirst.set(categoryId, at);
        }
      }
      sessions.set(sessionKey, session);
    }

    if (event.event_type === "category_dwell" && categoryId) {
      categoryDwellIds.add(categoryId);
      bumpHeat(categoryId, Math.max(1, event.quantity || 1), duration);
    }

    if (!isLook(event) || !event.dish_id) continue;
    const row = ensureAttention(event.dish_id, event.dish_name, categoryId);
    row.looks += Math.max(1, event.quantity || 1);
    row.ms += duration;
  }

  for (const row of attention.values()) {
    if (row.categoryId && !categoryDwellIds.has(row.categoryId)) {
      bumpHeat(row.categoryId, row.looks, row.ms);
    }
  }

  for (const session of sessions.values()) {
    for (const dishId of session.looks.keys()) {
      const dish = dishById.get(dishId);
      const row = ensureAttention(
        dishId,
        session.looks.get(dishId) ?? "",
        dish?.category_id ?? "",
      );
      row.sessionLooks += 1;
    }

    if (!session.tableId || !session.looks.size) continue;
    const start = session.start || 0;
    const ticket = sales.find((call) => {
      if (call.table_id !== session.tableId) return false;
      const at = stampMs(call.acknowledged_at || call.created_at);
      if (!at) return false;
      if (start && (at < start || at > start + SALE_SESSION_MS)) return false;
      return (call.items ?? []).some((item) => isDishSaleItem(item));
    });
    if (!ticket) continue;
    const ordered = new Set(
      (ticket.items ?? [])
        .filter((item) => isDishSaleItem(item))
        .map((item) => item.dish_id)
        .filter(Boolean),
    );
    if (!ordered.size) continue;
    for (const dishId of session.looks.keys()) {
      const row = attention.get(dishId);
      if (!row) continue;
      if (ordered.has(dishId)) row.orderedSessions += 1;
      else row.lookedElse += 1;
    }
  }

  const sessionCount = [...sessions.values()].filter(
    (session) => session.looks.size > 0 || session.categoryMs.size > 0,
  ).length;

  const decisionSamples: number[] = [];
  const categorySamples = new Map<string, number[]>();
  const pathCounts = new Map<string, number>();
  for (const session of sessions.values()) {
    if (session.start && session.firstCart > session.start) {
      decisionSamples.push((session.firstCart - session.start) / 1000);
    }
    for (const [categoryId, ms] of session.categoryMs) {
      const list = categorySamples.get(categoryId) ?? [];
      list.push(ms / 1000);
      categorySamples.set(categoryId, list);
    }
    if (!session.firstCart) continue;
    const cutoff = session.firstCart;
    const steps = [...session.categoryFirst.entries()]
      .filter(([, time]) => time > 0 && time < cutoff)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id)
      .slice(0, MAX_PATH_STEPS);
    if (steps.length < 2) continue;
    const key = steps.join(">");
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1);
  }

  const stuck = [...categorySamples.entries()]
    .map(([id, samples]) => ({
      id,
      name: categoryById.get(id)?.name || id,
      medianSeconds: median(samples) ?? 0,
    }))
    .sort((a, b) => b.medianSeconds - a.medianSeconds)[0];

  const heatTotalMs = [...heatMs.values()].reduce((sum, row) => sum + row.ms, 0);
  const heatTotalLooks = [...heatMs.values()].reduce(
    (sum, row) => sum + row.looks,
    0,
  );
  const heat: MenuReadingHeatRow[] = input.categories
    .map((category) => {
      const row = heatMs.get(category.id) ?? { looks: 0, ms: 0 };
      const share = heatTotalMs
        ? row.ms / heatTotalMs
        : heatTotalLooks
          ? row.looks / heatTotalLooks
          : 0;
      return {
        id: category.id,
        name: category.name,
        looks: row.looks,
        totalSeconds: Math.round(row.ms / 1000),
        share,
      };
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds || b.looks - a.looks);

  const topPath = [...pathCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  const path: MenuReadingPathStep[] =
    topPath && topPath[1] >= MIN_PATH_SESSIONS
      ? topPath[0].split(">").map((id) => ({
          id,
          name: categoryById.get(id)?.name || id,
        }))
      : [];

  const looksByCategory = new Map<string, number[]>();
  for (const dish of input.dishes) {
    const looks = attention.get(dish.id)?.looks ?? 0;
    const list = looksByCategory.get(dish.category_id) ?? [];
    list.push(looks);
    looksByCategory.set(dish.category_id, list);
  }

  const convertingPriceByCategory = new Map<string, number[]>();
  for (const dish of input.dishes) {
    const qty = soldQty.get(dish.id) ?? 0;
    if (qty <= 0 || dish.price <= 0) continue;
    const list = convertingPriceByCategory.get(dish.category_id) ?? [];
    list.push(dish.price);
    convertingPriceByCategory.set(dish.category_id, list);
  }

  const toDishRow = (
    dishId: string,
    row: AttentionRow,
    reasons: MenuReadingReason[],
  ): MenuReadingDishRow => {
    const dish = dishById.get(dishId);
    const categoryId = row.categoryId || dish?.category_id || "";
    return {
      id: dishId,
      name: dish?.name || row.name || dishId,
      categoryId,
      categoryName: categoryById.get(categoryId)?.name || categoryId,
      looks: row.looks,
      avgSeconds: row.looks ? Math.round(row.ms / row.looks / 1000) : 0,
      orderedQty: soldQty.get(dishId) ?? 0,
      lookedElse: row.lookedElse,
      conversion: conversionOf(row),
      reasons,
    };
  };

  const reasonsFor = (dishId: string, row: AttentionRow): MenuReadingReason[] => {
    const dish = dishById.get(dishId);
    const categoryId = row.categoryId || dish?.category_id || "";
    const reasons: MenuReadingReason[] = [];
    const looksInCategory = looksByCategory.get(categoryId) ?? [];
    const q25 = quartile(looksInCategory, 0.25);
    if (looksInCategory.length >= 3 && row.looks <= q25) {
      reasons.push("low_visibility");
    }

    if (row.looks < MENU_READING_MIN_LOOKS) return reasons;

    const converting = convertingPriceByCategory.get(categoryId) ?? [];
    const priceMedian = median(converting);
    if (
      dish &&
      dish.price > 0 &&
      priceMedian !== null &&
      dish.price > priceMedian
    ) {
      reasons.push("price");
    }

    const ownConversion = conversionOf(row);
    const substitute = input.dishes.some((peer) => {
      if (peer.id === dishId || peer.category_id !== categoryId) return false;
      const peerRow = attention.get(peer.id);
      if (!peerRow || peerRow.looks < MENU_READING_MIN_LOOKS) return false;
      if (dish && peer.price > 0 && dish.price > 0 && peer.price > dish.price * 1.05) {
        return false;
      }
      const peerConversion = conversionOf(peerRow);
      return (
        peerConversion >= Math.max(ownConversion * 2, ownConversion + 0.15, 0.2)
      );
    });
    if (substitute) reasons.push("substitution");

    if (stuck && categoryId === stuck.id) reasons.push("slow_choice");
    return reasons;
  };

  const ranked = [...attention.entries()].filter(
    ([, row]) => row.looks >= MENU_READING_MIN_LOOKS,
  );
  const avgSeconds = ranked.map(([, row]) =>
    row.looks ? row.ms / row.looks / 1000 : 0,
  );
  const avgMedian = median(avgSeconds) ?? 0;
  const conversionMedian = median(ranked.map(([, row]) => conversionOf(row))) ?? 0;
  const elseRates = ranked.map(([, row]) =>
    row.sessionLooks > 0 ? row.lookedElse / row.sessionLooks : 0,
  );
  const elseMedian = median(elseRates) ?? 0;

  const lingerSkips = ranked
    .map(([id, row]) => {
      const avg = row.looks ? row.ms / row.looks / 1000 : 0;
      const elseRate = row.sessionLooks > 0 ? row.lookedElse / row.sessionLooks : 0;
      const conversion = conversionOf(row);
      const lingered = avg >= avgMedian && avgMedian > 0;
      const skipped = elseRate >= Math.max(elseMedian, 0.25) && row.lookedElse > 0;
      const lowConv = conversion <= conversionMedian;
      if (!lingered || !skipped || !lowConv) return null;
      const score = (avg * (elseRate + 0.05)) / (conversion + 0.05);
      return { id, row, score };
    })
    .filter((row): row is { id: string; row: AttentionRow; score: number } =>
      Boolean(row),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LIST)
    .map(({ id, row }) => toDishRow(id, row, reasonsFor(id, row)));

  const skipZones = input.dishes
    .map((dish) => {
      const looksList = looksByCategory.get(dish.category_id) ?? [];
      const categoryLooks = looksList.reduce((sum, value) => sum + value, 0);
      if (looksList.length < 3 || categoryLooks < MENU_READING_MIN_LOOKS) {
        return null;
      }
      const row = attention.get(dish.id) ?? {
        name: dish.name,
        categoryId: dish.category_id,
        looks: 0,
        sessionLooks: 0,
        ms: 0,
        lookedElse: 0,
        orderedSessions: 0,
      };
      const medianLooks = quartile(looksList, 0.5);
      const q25 = quartile(looksList, 0.25);
      if (medianLooks <= 0) return null;
      if (row.looks > q25 || row.looks >= medianLooks) return null;
      return toDishRow(dish.id, row, reasonsFor(dish.id, row));
    })
    .filter((row): row is MenuReadingDishRow => Boolean(row))
    .sort(
      (a, b) =>
        a.looks - b.looks || a.conversion - b.conversion || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_LIST);

  return {
    ready: true,
    sessionCount,
    minLooks: MENU_READING_MIN_LOOKS,
    decisionMedianSeconds:
      decisionSamples.length > 0 ? Math.round(median(decisionSamples) ?? 0) : null,
    stuckCategory: stuck && stuck.medianSeconds > 0 ? stuck.name : null,
    heat,
    path,
    lingerSkips,
    skipZones,
  };
}
