import { isDishSaleItem, isRatingAlertItem } from "@/lib/dish-analytics";

export const WAITER_CALL_TYPES = [
  "call_waiter",
  "clean_table",
  "bill_card",
  "bill_cash",
  "low_rating",
] as const;

export type WaiterCallType = (typeof WAITER_CALL_TYPES)[number];

export const GUEST_WAITER_CALL_TYPES = [
  "call_waiter",
  "clean_table",
  "bill_card",
  "bill_cash",
] as const satisfies readonly WaiterCallType[];

export function isGuestWaiterCallType(
  value: string | null | undefined,
): value is (typeof GUEST_WAITER_CALL_TYPES)[number] {
  return (GUEST_WAITER_CALL_TYPES as readonly string[]).includes(value ?? "");
}

/** Shown in the guest dock — bills use the feedback dialog instead. */
export function isGuestProgressCall(type: string | null | undefined) {
  return type === "call_waiter" || type === "clean_table";
}

/** Hide leftover calls from a previous party on the same table. */
export const GUEST_PROGRESS_TICKET_MAX_AGE_MS = 20 * 60 * 1000;

export function isFreshGuestTicket(createdAt: string | null | undefined) {
  const created = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < GUEST_PROGRESS_TICKET_MAX_AGE_MS;
}

export function isWaiterCallType(
  value: string | null | undefined,
): value is WaiterCallType {
  return (WAITER_CALL_TYPES as readonly string[]).includes(value ?? "");
}

export function parseWaiterCallType(value: unknown): WaiterCallType {
  const raw = String(value ?? "").trim();
  return isWaiterCallType(raw) ? raw : "call_waiter";
}

export function filterLowRatingCalls<T extends { call_type?: string | null }>(
  calls: T[],
  canSee: boolean,
) {
  if (canSee) return calls;
  return calls.filter((call) => call.call_type !== "low_rating");
}

const KITCHEN_ORDER_EXCLUDED_TYPES = new Set([
  "low_rating",
  "bill_card",
  "bill_cash",
  "clean_table",
]);

/** Kitchen KDS tickets: food/bar orders only — never reviews or pure floor service. */
export function isKitchenOrderTicket(call: {
  call_type?: string | null;
  items?: Array<{ dish_id?: string | null; name?: string | null }>;
}) {
  if (KITCHEN_ORDER_EXCLUDED_TYPES.has(String(call.call_type ?? ""))) {
    return false;
  }
  const items = call.items ?? [];
  if (items.some((item) => isRatingAlertItem(item))) return false;
  return items.some((item) => isDishSaleItem(item));
}

/** Floor service: waiter / bill / clean — no food KDS ticket. */
export function isFloorServiceTicket(call: {
  call_type?: string | null;
  items?: Array<{ dish_id?: string | null; name?: string | null }>;
}) {
  const type = String(call.call_type ?? "call_waiter");
  if (type === "low_rating") return false;
  if (type === "bill_card" || type === "bill_cash" || type === "clean_table") {
    return true;
  }
  if (type === "call_waiter") return !isKitchenOrderTicket(call);
  return false;
}

export function filterKitchenOrderTickets<
  T extends {
    call_type?: string | null;
    items?: Array<{ dish_id?: string | null; name?: string | null }>;
  },
>(calls: T[]) {
  return calls.filter((call) => isKitchenOrderTicket(call));
}

export function filterFloorServiceTickets<
  T extends {
    call_type?: string | null;
    items?: Array<{ dish_id?: string | null; name?: string | null }>;
  },
>(calls: T[]) {
  return calls.filter((call) => isFloorServiceTicket(call));
}

/** Orders + floor service for the shared kitchen/waiter board (excludes low_rating). */
export function filterKitchenBoardTickets<
  T extends {
    call_type?: string | null;
    items?: Array<{ dish_id?: string | null; name?: string | null }>;
  },
>(calls: T[]) {
  return calls.filter(
    (call) => isKitchenOrderTicket(call) || isFloorServiceTicket(call),
  );
}

export const WAITER_CALL_LABELS: Record<
  WaiterCallType,
  { ka: string; en: string; ru: string }
> = {
  call_waiter: {
    ka: "მიმტანის გამოძახება",
    en: "Call waiter",
    ru: "Позвать официанта",
  },
  clean_table: {
    ka: "მაგიდის გადაწმენდა",
    en: "Clean table",
    ru: "Убрать стол",
  },
  bill_card: {
    ka: "ანგარიში - ბარათით",
    en: "Bill — card",
    ru: "Счёт — картой",
  },
  bill_cash: {
    ka: "ანგარიში - ნაღდი ფულით",
    en: "Bill — cash",
    ru: "Счёт — наличными",
  },
  low_rating: {
    ka: "დაბალი შეფასება",
    en: "Low rating",
    ru: "Низкая оценка",
  },
};

export const WAITER_CALL_STYLE: Record<
  WaiterCallType,
  { card: string; icon: string }
> = {
  call_waiter: {
    card: "border-amber-500/45 bg-amber-50 dark:bg-amber-950/35",
    icon: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  clean_table: {
    card: "border-sky-500/45 bg-sky-50 dark:bg-sky-950/35",
    icon: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  },
  bill_card: {
    card: "border-emerald-500/45 bg-emerald-50 dark:bg-emerald-950/35",
    icon: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  bill_cash: {
    card: "border-teal-500/45 bg-teal-50 dark:bg-teal-950/35",
    icon: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  },
  low_rating: {
    card: "border-red-500/55 bg-red-50 dark:bg-red-950/40",
    icon: "bg-red-500/15 text-red-800 dark:text-red-200",
  },
};
