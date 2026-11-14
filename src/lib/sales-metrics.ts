import {
  isDishSaleItem,
  isRatingAlertCall,
  isRatingAlertItem,
} from "@/lib/dish-analytics";
import { isTimestampInRange } from "@/lib/restaurant-day";

/** One dining check: ignore later bills on the same table for this long. */
export const SALE_SESSION_MS = 4 * 60 * 60 * 1000;

export type SaleLine = {
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

export type SaleCall = {
  id?: string;
  table_id?: string;
  table_number?: string;
  call_type?: string | null;
  items: SaleLine[];
  status: string;
  created_at?: string;
  acknowledged_at?: string | null;
};

export function isAcknowledgedCall(status: string) {
  return status === "acknowledged" || status === "completed";
}

export function isCancelledCall(status: string) {
  return status === "cancelled";
}

export function isPendingCall(status: string) {
  return status === "open" || status === "pending";
}

export function callSaleStamp(call: {
  acknowledged_at?: string | null;
  created_at?: string;
}) {
  return call.acknowledged_at || call.created_at || undefined;
}

export function isBillCall(call: { call_type?: string | null }) {
  return call.call_type === "bill_card" || call.call_type === "bill_cash";
}

export function isCleanTableCall(call: { call_type?: string | null }) {
  return call.call_type === "clean_table";
}

export function isSaleCandidate(call: SaleCall) {
  if (isRatingAlertCall(call) || isCleanTableCall(call)) return false;
  return (call.items ?? []).some((item) => isDishSaleItem(item));
}

export function isConfirmedSale(call: SaleCall) {
  return isAcknowledgedCall(call.status) && isSaleCandidate(call);
}

export function isOpenSaleTicket(call: SaleCall) {
  return isPendingCall(call.status) && isSaleCandidate(call);
}

export function splitCallRevenue(items: SaleLine[]) {
  let dishes = 0;
  let fee = 0;
  for (const item of items ?? []) {
    const amount = item.quantity * item.unit_price;
    if (amount <= 0 || isRatingAlertItem(item)) continue;
    if (isDishSaleItem(item)) dishes += amount;
    else fee += amount;
  }
  return { dishes, fee, total: dishes + fee };
}

function saleItemFingerprint(items: SaleLine[]) {
  return items
    .filter((item) => isDishSaleItem(item))
    .map((item) => `${item.dish_id || item.name}:${item.quantity}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function sessionTableKey(call: SaleCall) {
  if (call.table_id) return `id:${call.table_id}`;
  if (call.table_number) return `num:${call.table_number}`;
  return `call:${call.id ?? "unknown"}`;
}

function stampTime(call: SaleCall) {
  const time = new Date(callSaleStamp(call) ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * One dining check = one sale. After the first confirmed sale on a table,
 * later bill_card / bill_cash tickets are ignored for 4 hours (or until the
 * next call_waiter with a different dish set). The first dish ticket still
 * counts if the guest only asked for the bill.
 */
export function filterConfirmedSales<T extends SaleCall>(calls: T[]): T[] {
  const confirmed = calls
    .filter((call) => isConfirmedSale(call))
    .sort((a, b) => stampTime(a) - stampTime(b));

  const lastByTable = new Map<string, { time: number; fingerprint: string }>();
  const kept: T[] = [];

  for (const call of confirmed) {
    const table = sessionTableKey(call);
    const time = stampTime(call);
    const fingerprint = saleItemFingerprint(call.items);
    const previous = lastByTable.get(table);

    if (!previous || time - previous.time > SALE_SESSION_MS) {
      kept.push(call);
      lastByTable.set(table, { time, fingerprint });
      continue;
    }

    if (isBillCall(call)) continue;

    if (fingerprint && fingerprint !== previous.fingerprint) {
      kept.push(call);
      lastByTable.set(table, { time, fingerprint });
    }
  }

  return kept;
}

export function confirmedSalesInWindow<T extends SaleCall>(
  calls: T[],
  from: Date,
  to: Date,
) {
  return filterConfirmedSales(calls).filter((call) =>
    isTimestampInRange(callSaleStamp(call), from, to),
  );
}

/** Confirmed sales after session dedupe, plus non-sale tickets in the window. */
export function snapshotCalls<T extends SaleCall>(
  calls: T[],
  from: Date,
  to: Date,
) {
  const saleIds = new Set(
    confirmedSalesInWindow(calls, from, to)
      .map((call) => call.id)
      .filter((id): id is string => Boolean(id)),
  );

  return calls.filter((call) => {
    if (isConfirmedSale(call)) {
      return Boolean(call.id) && saleIds.has(call.id ?? "");
    }
    return (
      isTimestampInRange(call.created_at, from, to) ||
      isTimestampInRange(call.acknowledged_at, from, to)
    );
  });
}
