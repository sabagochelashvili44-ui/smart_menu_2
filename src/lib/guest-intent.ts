type IntentEventType =
  | "view"
  | "cart_add"
  | "cart_remove"
  | "session_start"
  | "dish_dwell"
  | "category_dwell";

type QueuedEvent = {
  event_type: IntentEventType;
  dish_id: string;
  dish_name: string;
  category_id: string;
  quantity: number;
  unit_price: number;
  duration_ms: number;
};

type DishSpell = {
  dishId: string;
  dishName: string;
  categoryId: string;
  unitPrice: number;
  visible: boolean;
  accumulated: number;
  capped: boolean;
};

const FLUSH_MS = 15_000;
const MIN_LOOK_MS = 1_000;
const MAX_SPELL_MS = 120_000;
const MAX_SAMPLE_MS = 20_000;

let restaurantId = "";
let tableId: string | null = null;
let sessionId = "";
let queue: QueuedEvent[] = [];
let flushTimer: number | null = null;
let lastSample = 0;
let listening = false;

const dishes = new Map<string, DishSpell>();
const categoryVisible = new Map<string, number>();
const categoryPending = new Map<string, number>();

function storageKey() {
  return `smart-menu-intent:${restaurantId}:${tableId ?? "none"}`;
}

function readSession() {
  const key = storageKey();
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

function queueEvent(event: QueuedEvent) {
  queue.push(event);
  if (queue.length > 80) queue = queue.slice(-80);
}

let paused = false;

function sample(now = Date.now()) {
  if (!lastSample) {
    lastSample = now;
    return;
  }
  if (paused || document.visibilityState === "hidden") {
    lastSample = now;
    return;
  }
  const delta = Math.min(MAX_SAMPLE_MS, Math.max(0, now - lastSample));
  lastSample = now;
  if (delta <= 0) return;

  for (const spell of dishes.values()) {
    if (!spell.visible || spell.capped) continue;
    const room = MAX_SPELL_MS - spell.accumulated;
    spell.accumulated += Math.min(room, delta);
    if (spell.accumulated >= MAX_SPELL_MS) spell.capped = true;
  }

  for (const [categoryId, count] of categoryVisible) {
    if (count <= 0) continue;
    categoryPending.set(
      categoryId,
      Math.min(MAX_SPELL_MS, (categoryPending.get(categoryId) ?? 0) + delta),
    );
  }
}

function finishSpell(spell: DishSpell) {
  if (spell.accumulated >= MIN_LOOK_MS) {
    queueEvent({
      event_type: "dish_dwell",
      dish_id: spell.dishId,
      dish_name: spell.dishName,
      category_id: spell.categoryId,
      quantity: 1,
      unit_price: spell.unitPrice,
      duration_ms: Math.min(MAX_SPELL_MS, Math.round(spell.accumulated)),
    });
  }
  spell.accumulated = 0;
  spell.capped = false;
}

function flushCategories() {
  for (const [categoryId, duration] of categoryPending) {
    if (duration < MIN_LOOK_MS) continue;
    queueEvent({
      event_type: "category_dwell",
      dish_id: "",
      dish_name: "",
      category_id: categoryId,
      quantity: 1,
      unit_price: 0,
      duration_ms: Math.min(MAX_SPELL_MS, Math.round(duration)),
    });
  }
  categoryPending.clear();
}

async function flush() {
  sample();
  flushCategories();
  if (!queue.length || !restaurantId) return;
  const events = queue.splice(0, 50);
  try {
    await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        table_id: tableId,
        session_id: sessionId,
        events,
      }),
      keepalive: true,
    });
  } catch {
    queue = [...events, ...queue].slice(-80);
  }
}

function onHide() {
  sample();
  for (const spell of dishes.values()) {
    if (!spell.visible) continue;
    spell.visible = false;
    finishSpell(spell);
  }
  categoryVisible.clear();
  void flush();
}

function onVisibility() {
  if (document.visibilityState === "hidden") {
    paused = true;
    void flush();
    return;
  }
  paused = false;
  lastSample = Date.now();
}

export function currentGuestSessionId() {
  return sessionId;
}

export function trackOffMenuRequest(input: {
  restaurantId: string;
  tableId?: string | null;
  source: "search" | "chat";
  query: string;
  dishes?: Array<{
    name?: string | null;
    name_en?: string | null;
    name_ru?: string | null;
    description?: string | null;
    ingredients?: string[] | null;
  }>;
}) {
  if (typeof window === "undefined") return;
  const query = input.query.trim();
  if (query.length < 3) return;
  if (!sessionId || restaurantId !== input.restaurantId) {
    restaurantId = input.restaurantId;
    tableId = input.tableId ?? null;
    sessionId = readSession();
  }
  const key = `off-menu:${restaurantId}:${input.source}:${query.toLocaleLowerCase()}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  void fetch("/api/demand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      table_id: tableId,
      session_id: sessionId,
      source: input.source,
      query,
      dishes: input.dishes,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function bindGuestIntentSession(
  nextRestaurantId: string,
  nextTableId?: string | null,
) {
  if (typeof window === "undefined") return () => undefined;
  restaurantId = nextRestaurantId;
  tableId = nextTableId ?? null;
  sessionId = readSession();
  const startedKey = `${storageKey()}:started`;
  if (!window.sessionStorage.getItem(startedKey)) {
    window.sessionStorage.setItem(startedKey, "1");
    queueEvent({
      event_type: "session_start",
      dish_id: "",
      dish_name: "",
      category_id: "",
      quantity: 1,
      unit_price: 0,
      duration_ms: 0,
    });
    void flush();
  }
  if (!listening) {
    listening = true;
    lastSample = Date.now();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    flushTimer = window.setInterval(() => {
      void flush();
    }, FLUSH_MS);
  }
  return () => {
    onHide();
  };
}

export function setDishAttention(input: {
  dishId: string;
  dishName: string;
  categoryId?: string | null;
  unitPrice?: number;
  visible: boolean;
}) {
  if (typeof window === "undefined" || !input.dishId) return;
  sample();
  const categoryId = input.categoryId ?? "";
  const visible = input.visible && document.visibilityState !== "hidden";
  const current = dishes.get(input.dishId) ?? {
    dishId: input.dishId,
    dishName: input.dishName,
    categoryId,
    unitPrice: input.unitPrice ?? 0,
    visible: false,
    accumulated: 0,
    capped: false,
  };
  current.dishName = input.dishName;
  current.categoryId = categoryId;
  current.unitPrice = input.unitPrice ?? current.unitPrice;
  if (current.visible && !visible) {
    current.visible = false;
    finishSpell(current);
    const count = (categoryVisible.get(categoryId) ?? 1) - 1;
    if (count <= 0) categoryVisible.delete(categoryId);
    else categoryVisible.set(categoryId, count);
  } else if (!current.visible && visible) {
    current.visible = true;
    current.accumulated = 0;
    current.capped = false;
    if (categoryId) {
      categoryVisible.set(categoryId, (categoryVisible.get(categoryId) ?? 0) + 1);
    }
  }
  dishes.set(input.dishId, current);
}

export function trackGuestIntent(input: {
  restaurantId: string;
  tableId?: string | null;
  eventType: "view" | "cart_add" | "cart_remove";
  dishId: string;
  dishName: string;
  categoryId?: string | null;
  quantity?: number;
  unitPrice?: number;
}) {
  if (typeof window === "undefined") return;
  if (!sessionId || restaurantId !== input.restaurantId) {
    restaurantId = input.restaurantId;
    tableId = input.tableId ?? null;
    sessionId = readSession();
  }
  if (input.eventType === "view") return;
  queueEvent({
    event_type: input.eventType,
    dish_id: input.dishId,
    dish_name: input.dishName,
    category_id: input.categoryId ?? "",
    quantity: input.quantity ?? 1,
    unit_price: input.unitPrice ?? 0,
    duration_ms: 0,
  });
  void flush();
}
