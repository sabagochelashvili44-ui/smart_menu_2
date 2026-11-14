"use client";

import type { WaiterCallAlert } from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import {
  OrderEditDialog,
  type KitchenMenuDish,
} from "@/components/admin/order-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dishLabel, formatGel } from "@/lib/menu-copy";
import {
  isServiceFeeItem,
  syncServiceFeeLine,
  ticketPriceBreakdown,
} from "@/lib/service-fee";
import { parseDrinkPour } from "@/lib/menu-lane";
import {
  foodBatch,
  kitchenTimerAt,
  waiterCallItemsTotal,
} from "@/lib/waiter-call-items";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  filterFloorServiceTickets,
  filterKitchenBoardTickets,
  filterKitchenOrderTickets,
  isFloorServiceTicket,
  isKitchenOrderTicket,
  parseWaiterCallType,
  WAITER_CALL_LABELS,
  WAITER_CALL_STYLE,
  type WaiterCallType,
} from "@/lib/waiter-call-types";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  BellIcon,
  BrushCleaningIcon,
  CreditCardIcon,
} from "lucide-react";
import type { WaiterCallLine } from "@/lib/waiter-call-items";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CHIME_URL =
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
/** Realtime is primary; poll is a slow safety net. */
const KITCHEN_POLL_MS = 15_000;
const POLL_KEEP_MS = 20000;

type KitchenAudioContext = AudioContext;

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function playSynthesizedChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  master.connect(ctx.destination);

  const tones = [880, 1174, 988];
  tones.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + index * 0.12;
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function normalizeKitchenStatus(raw: string | null | undefined) {
  const status = String(raw ?? "").trim().toLowerCase();
  if (
    status === "acknowledged" ||
    status === "accepted" ||
    status === "completed" ||
    status === "ready" ||
    status === "served"
  ) {
    return "acknowledged";
  }
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "preparing" || status === "pending") return status;
  if (!status) return "";
  return "open";
}

function isIncomingCallStatus(status: string) {
  return status === "open" || status === "pending";
}

function isAcknowledgedKitchenStatus(status: string) {
  return normalizeKitchenStatus(status) === "acknowledged";
}

function isKitchenReceived(call: WaiterCallAlert) {
  if (call.ready_at) return false;
  const status = normalizeKitchenStatus(call.status) || call.status;
  return status === "open" || status === "pending";
}

function isKitchenInProgress(call: WaiterCallAlert) {
  if (call.ready_at) return false;
  const status = normalizeKitchenStatus(call.status) || call.status;
  return status === "preparing" || isAcknowledgedKitchenStatus(status);
}

function isKitchenIncoming(call: WaiterCallAlert) {
  return isKitchenReceived(call) || isKitchenInProgress(call);
}

function isKitchenReady(call: WaiterCallAlert) {
  return Boolean(call.ready_at) || (
    isAcknowledgedKitchenStatus(call.status) &&
    !isKitchenInProgress(call) &&
    !isKitchenReceived(call)
  );
}

function shouldShowOrderTotal(call: WaiterCallAlert) {
  if (call.call_type === "low_rating") return false;
  if (!call.items.length) return false;
  return waiterCallItemsTotal(call.items) > 0;
}

function KitchenTicketTotals({
  items,
  fallbackPercent,
  dishesLabel,
  serviceLabel,
  dueLabel,
  totalLabel,
}: {
  items: WaiterCallAlert["items"];
  fallbackPercent: number;
  dishesLabel: string;
  serviceLabel: string;
  dueLabel: string;
  totalLabel: string;
}) {
  const breakdown = ticketPriceBreakdown(items, fallbackPercent);
  if (breakdown.percent > 0 && breakdown.serviceFee > 0) {
    return (
      <div className="mt-2 space-y-1 border-t pt-2 text-sm text-[#5A121A]">
        <p className="flex items-center justify-between">
          <span>{dishesLabel}:</span>
          <span className="tabular-nums">{formatGel(breakdown.subtotal)}</span>
        </p>
        <p className="flex items-center justify-between">
          <span>
            {serviceLabel} ({breakdown.percent}%):
          </span>
          <span className="tabular-nums">{formatGel(breakdown.serviceFee)}</span>
        </p>
        <p className="flex items-center justify-between font-bold">
          <span>{dueLabel}:</span>
          <span className="tabular-nums">{formatGel(breakdown.grandTotal)}</span>
        </p>
      </div>
    );
  }
  return (
    <p className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold text-[#5A121A]">
      <span>{totalLabel}:</span>
      <span className="tabular-nums">{formatGel(breakdown.grandTotal)}</span>
    </p>
  );
}

const SLA_WARN_MS = 2 * 60 * 1000;
const SLA_OVERDUE_MS = 3 * 60 * 1000;

function ageMs(iso: string, now: number) {
  const stamp = new Date(iso).getTime();
  if (!Number.isFinite(stamp)) return 0;
  return Math.max(0, now - stamp);
}

function elapsed(iso: string, unit: string, now = Date.now()) {
  const mins = Math.floor(ageMs(iso, now) / 60000);
  return `${mins}${unit}`;
}

function slaLevel(
  call: WaiterCallAlert,
  now: number,
): "ok" | "warn" | "overdue" {
  if (!isKitchenIncoming(call)) return "ok";
  const age = ageMs(callTimerAt(call), now);
  if (age >= SLA_OVERDUE_MS) return "overdue";
  if (age >= SLA_WARN_MS) return "warn";
  return "ok";
}

function callTimerAt(call: WaiterCallAlert) {
  return kitchenTimerAt(call.created_at, call.items);
}

function pendingTicketClass(call: WaiterCallAlert, now: number) {
  const sla = slaLevel(call, now);
  if (sla === "overdue") {
    return "rounded-lg border-2 border-red-600 bg-red-50 p-3 dark:bg-red-950/50";
  }
  if (sla === "warn") {
    return "rounded-lg border-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/40";
  }
  return `rounded-lg border p-3 ${
    call.call_type
      ? WAITER_CALL_STYLE[call.call_type].card
      : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
  }`;
}

function splitFoodLines<T extends { batch?: number; dish_id: string }>(items: T[]) {
  const food = items.filter((item) => !isServiceFeeItem(item));
  const newest = food.reduce((max, item) => Math.max(max, foodBatch(item)), 1);
  if (newest <= 1) {
    return { previous: food, added: [] as T[] };
  }
  return {
    previous: food.filter((item) => foodBatch(item) < newest),
    added: food.filter((item) => foodBatch(item) === newest),
  };
}

function KitchenFoodList({
  callId,
  callType,
  items,
  locale,
  newLabel,
  showNewBadge = false,
}: {
  callId: string;
  callType: WaiterCallType | null;
  items: WaiterCallAlert["items"];
  locale: "ka" | "en" | "ru";
  newLabel: string;
  showNewBadge?: boolean;
}) {
  const { t } = useAdminLocale();
  return (
    <ul className="text-sm">
      {items.map((item, index) => (
        <li key={`${callId}-${item.dish_id}-${item.batch ?? 1}-${index}`}>
          {callType === "low_rating"
            ? item.name
            : `${item.quantity}× ${dishLabel(item.name, locale)}${
                item.pour === "glass"
                  ? ` · ${t.priceGlass}`
                  : item.pour === "bottle"
                    ? ` · ${t.priceBottle}`
                    : ""
              }`}
          {showNewBadge ? (
            <Badge className="ml-1.5 align-middle">{newLabel}</Badge>
          ) : null}
          {item.note ? (
            <p className="mt-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-900/70 dark:text-amber-50">
              {t.itemNote}: {item.note}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function parseItems(raw: unknown): WaiterCallAlert["items"] {
  if (typeof raw === "string") {
    try {
      return parseItems(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const note = String(row.note ?? "").trim().slice(0, 200);
      const batch = Math.floor(Number(row.batch) || 0);
      const addedAt = String(row.added_at ?? "").trim();
      const addedMs = Date.parse(addedAt);
      const pour = parseDrinkPour(row.pour);
      return {
        dish_id: String(row.dish_id ?? ""),
        name: String(row.name ?? "Item"),
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        ...(note ? { note } : {}),
        ...(batch >= 1 ? { batch } : {}),
        ...(Number.isFinite(addedMs)
          ? { added_at: new Date(addedMs).toISOString() }
          : {}),
        ...(pour ? { pour } : {}),
      };
    })
    .filter((item) => item.quantity > 0);
}

function toWaiterCall(
  row: Record<string, unknown>,
  existing?: WaiterCallAlert,
): WaiterCallAlert {
  const statusRaw = row.status;
  const status =
    statusRaw === undefined || statusRaw === null || statusRaw === ""
      ? existing?.status ?? "open"
      : normalizeKitchenStatus(String(statusRaw)) ||
        existing?.status ||
        "open";

  return {
    id: String(row.id ?? existing?.id ?? ""),
    restaurant_id: String(row.restaurant_id ?? existing?.restaurant_id ?? ""),
    table_id: String(row.table_id ?? existing?.table_id ?? ""),
    table_number: String(row.table_number ?? existing?.table_number ?? ""),
    items:
      row.items === undefined
        ? existing?.items ?? []
        : preferItems(existing?.items, parseItems(row.items)),
    status,
    call_type:
      row.call_type === undefined
        ? (existing?.call_type ?? parseWaiterCallType(undefined))
        : parseWaiterCallType(row.call_type),
    created_at: String(row.created_at ?? existing?.created_at ?? ""),
    ready_at:
      row.ready_at === undefined
        ? existing?.ready_at
        : row.ready_at
          ? String(row.ready_at)
          : existing?.ready_at ?? null,
  };
}

function kitchenStatusFromOrder(status: string) {
  const normalized = normalizeKitchenStatus(status);
  if (normalized === "cancelled" || normalized === "acknowledged") {
    return normalized;
  }
  if (status === "pending" || status === "preparing") return status;
  return "open";
}

function toKitchenCallFromOrder(
  row: Record<string, unknown>,
  existing?: WaiterCallAlert,
): WaiterCallAlert {
  const statusRaw = row.status;
  const status =
    statusRaw === undefined || statusRaw === null || statusRaw === ""
      ? existing?.status ?? "open"
      : kitchenStatusFromOrder(String(statusRaw));

  return {
    id: String(row.id ?? existing?.id ?? ""),
    restaurant_id: String(row.restaurant_id ?? existing?.restaurant_id ?? ""),
    table_id: String(row.table_id ?? existing?.table_id ?? ""),
    table_number: String(row.table_number ?? existing?.table_number ?? ""),
    items:
      row.items === undefined
        ? existing?.items ?? []
        : preferItems(existing?.items, parseItems(row.items)),
    status,
    call_type: existing?.call_type ?? null,
    created_at: String(row.created_at ?? existing?.created_at ?? ""),
    ready_at: existing?.ready_at ?? null,
  };
}

const CALL_ICONS: Record<
  WaiterCallType,
  ComponentType<{ className?: string }>
> = {
  call_waiter: BellIcon,
  clean_table: BrushCleaningIcon,
  bill_card: CreditCardIcon,
  bill_cash: BanknoteIcon,
  low_rating: AlertTriangleIcon,
};

function CallTypeRow({
  type,
  locale,
}: {
  type: WaiterCallType;
  locale: "ka" | "en" | "ru";
}) {
  const Icon = CALL_ICONS[type];
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${WAITER_CALL_STYLE[type].icon}`}
      >
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-semibold leading-snug">
        {WAITER_CALL_LABELS[type][locale]}
      </p>
    </div>
  );
}

function foodLineCount(items: WaiterCallAlert["items"] | undefined) {
  return (items ?? []).filter((item) => !isServiceFeeItem(item)).length;
}

function maxFoodBatch(items: WaiterCallAlert["items"] | undefined) {
  return (items ?? []).reduce(
    (max, item) => Math.max(max, foodBatch(item)),
    1,
  );
}

/** Keep the richer ticket body so a status-only patch cannot wipe dishes. */
function preferItems(
  local: WaiterCallAlert["items"] | undefined,
  remote: WaiterCallAlert["items"] | undefined,
): WaiterCallAlert["items"] {
  const fromLocal = local ?? [];
  const fromRemote = remote ?? [];
  if (!fromRemote.length && fromLocal.length) return fromLocal;
  if (!fromLocal.length) return fromRemote;
  const localFood = foodLineCount(fromLocal);
  const remoteFood = foodLineCount(fromRemote);
  if (remoteFood > localFood) return fromRemote;
  if (localFood > remoteFood) return fromLocal;
  if (maxFoodBatch(fromRemote) > maxFoodBatch(fromLocal)) return fromRemote;
  return fromLocal;
}

function mergeKitchenCall(
  local: WaiterCallAlert | undefined,
  remote: WaiterCallAlert,
): WaiterCallAlert {
  if (!local) return remote;
  const remoteIncoming = isIncomingCallStatus(
    normalizeKitchenStatus(remote.status) || remote.status,
  );
  const keepAck =
    isAcknowledgedKitchenStatus(local.status) && remoteIncoming;
  return {
    ...local,
    ...remote,
    items: preferItems(local.items, remote.items),
    status: keepAck ? local.status : remote.status || local.status,
    ready_at: remote.ready_at || local.ready_at || null,
    call_type: remote.call_type ?? local.call_type,
    table_number: remote.table_number || local.table_number,
  };
}

function upsertCall(current: WaiterCallAlert[], call: WaiterCallAlert) {
  if (call.status === "cancelled") {
    return current.filter((row) => row.id !== call.id);
  }
  const existing = current.find((row) => row.id === call.id);
  if (existing) {
    const merged = mergeKitchenCall(existing, call);
    return current.map((row) => (row.id === call.id ? merged : row));
  }
  return [call, ...current];
}

function applyKitchenRow(
  current: WaiterCallAlert[],
  table: "waiter_calls" | "orders",
  row: Record<string, unknown> | undefined,
) {
  if (!row?.id) return current;
  const existing = current.find((item) => item.id === String(row.id));
  const call =
    table === "orders"
      ? toKitchenCallFromOrder(row, existing)
      : toWaiterCall(row, existing);
  return upsertCall(current, call);
}

function mergePolledCalls(
  previous: WaiterCallAlert[],
  incoming: WaiterCallAlert[],
  missingSince: Map<string, number>,
  now = Date.now(),
) {
  const previousById = new Map(previous.map((call) => [call.id, call]));
  const incomingIds = new Set(incoming.map((call) => call.id));
  const merged = incoming.map((call) => {
    missingSince.delete(call.id);
    return mergeKitchenCall(previousById.get(call.id), call);
  });
  for (const call of previous) {
    if (incomingIds.has(call.id)) continue;
    const firstMissing = missingSince.get(call.id) ?? now;
    missingSince.set(call.id, firstMissing);
    if (now - firstMissing <= POLL_KEEP_MS && isKitchenOrderTicket(call)) {
      merged.push(call);
    }
  }
  return merged;
}

export function KitchenBoard({
  restaurantId,
  initialCalls,
  dishes = [],
  serviceFeePercent = 0,
}: {
  restaurantId: string;
  initialCalls: WaiterCallAlert[];
  dishes?: KitchenMenuDish[];
  serviceFeePercent?: number;
}) {
  const { locale, t } = useAdminLocale();
  const [calls, setCalls] = useState<WaiterCallAlert[]>(initialCalls);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<"pending" | "acknowledged">("pending");
  const [editingCall, setEditingCall] = useState<WaiterCallAlert | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  const chimeRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<KitchenAudioContext | null>(null);
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const seededPollRef = useRef(false);
  const dismissedIdsRef = useRef(new Set<string>());
  const missingPollIdsRef = useRef(new Map<string, number>());

  function withoutDismissed(list: WaiterCallAlert[]) {
    const hidden = dismissedIdsRef.current;
    if (hidden.size === 0) return list;
    return list.filter((call) => !hidden.has(call.id));
  }

  useEffect(() => {
    dismissedIdsRef.current.clear();
    setCalls(initialCalls);
    // Only reset when switching restaurants so Realtime patches are not wiped
    // by a stale Server Component snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restaurant-scoped seed
  }, [restaurantId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const ensureAudioContext = useCallback(async () => {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }, []);

  const playChime = useCallback(async () => {
    if (!soundOnRef.current) return;

    const ctx = await ensureAudioContext();
    const audio = chimeRef.current;
    let htmlPlayed = false;

    if (audio && !audio.error) {
      audio.volume = 1.0;
      try {
        audio.pause();
        audio.currentTime = 0;
        await audio.play();
        htmlPlayed = true;
      } catch (err) {
        console.error(err);
      }
    }

    if (!htmlPlayed && ctx) {
      playSynthesizedChime(ctx);
    }
  }, [ensureAudioContext]);
  const playChimeRef = useRef(playChime);
  playChimeRef.current = playChime;

  async function toggleSound() {
    if (soundOn) {
      soundOnRef.current = false;
      setSoundOn(false);
      const audio = chimeRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }

    const ctx = await ensureAudioContext();
    const audio = chimeRef.current;
    if (audio) {
      audio.volume = 1.0;
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } catch (err) {
        console.error(err);
      }
    }

    if (ctx) {
      playSynthesizedChime(ctx);
    }

    soundOnRef.current = true;
    setSoundOn(true);
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const tenantFilter = `restaurant_id=eq.${restaurantId}`;
    let cancelled = false;
    let inFlight = false;
    let debounce: number | null = null;
    seededPollRef.current = false;

    async function refreshCalls() {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/waiter-calls?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const json = (await response.json().catch(() => null)) as {
          calls?: Record<string, unknown>[];
        } | null;
        if (!response.ok || !Array.isArray(json?.calls) || cancelled) return;

        const next = filterKitchenBoardTickets(
          json.calls.map((row) => {
            const local = callsRef.current.find(
              (call) => call.id === String(row.id ?? ""),
            );
            return toWaiterCall(row, local);
          }),
        );

        const merged = withoutDismissed(
          mergePolledCalls(
            callsRef.current,
            next,
            missingPollIdsRef.current,
          ),
        );
        if (!seededPollRef.current) {
          seededPollRef.current = true;
          setCalls(merged);
          return;
        }

        const prevIds = new Set(callsRef.current.map((call) => call.id));
        const newcomers = merged.filter(
          (call) => !prevIds.has(call.id) && isKitchenReceived(call),
        );
        if (soundOnRef.current && newcomers.length > 0) {
          void playChimeRef.current();
        }
        setCalls(merged);
      } catch {
        // Keep the last live snapshot if polling fails.
      } finally {
        inFlight = false;
      }
    }

    function scheduleRefresh() {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refreshCalls();
      }, 250);
    }

    const onWaiterChange = (payload: {
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (payload.eventType === "DELETE") {
        const id = String(payload.old?.id ?? "");
        if (!id) return;
        dismissedIdsRef.current.add(id);
        setCalls((current) => current.filter((row) => row.id !== id));
        return;
      }
      const row = payload.new;
      if (!row) {
        scheduleRefresh();
        return;
      }
      const rowId = String(row.id ?? "");
      if (row.archived_at) {
        if (rowId) {
          dismissedIdsRef.current.add(rowId);
          setCalls((current) => current.filter((item) => item.id !== rowId));
        }
        return;
      }
      if (rowId && dismissedIdsRef.current.has(rowId)) return;
      const incoming = toWaiterCall(row);
      if (incoming.call_type === "low_rating") {
        if (rowId) {
          setCalls((current) => current.filter((item) => item.id !== rowId));
        }
        return;
      }
      setCalls((current) => {
        const existing = current.find((item) => item.id === rowId);
        if (
          !existing &&
          !isKitchenOrderTicket(incoming) &&
          !isFloorServiceTicket(incoming)
        ) {
          return current;
        }
        return withoutDismissed(applyKitchenRow(current, "waiter_calls", row));
      });
      if (
        (payload.eventType === "INSERT" &&
          isKitchenIncoming(incoming) &&
          soundOnRef.current) ||
        (payload.eventType === "UPDATE" &&
          String(payload.old?.status ?? "") === "acknowledged" &&
          isIncomingCallStatus(incoming.status) &&
          soundOnRef.current)
      ) {
        void playChimeRef.current();
      }
      scheduleRefresh();
    };

    const onOrderChange = (payload: {
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (payload.eventType === "DELETE") {
        const id = String(payload.old?.id ?? "");
        if (!id) return;
        dismissedIdsRef.current.add(id);
        setCalls((current) => current.filter((row) => row.id !== id));
        return;
      }
      const row = payload.new;
      if (!row) {
        scheduleRefresh();
        return;
      }
      const rowId = String(row.id ?? "");
      if (rowId && dismissedIdsRef.current.has(rowId)) return;
      const incoming = toKitchenCallFromOrder(row);
      setCalls((current) => {
        const existing = current.find((item) => item.id === rowId);
        if (!existing && !isKitchenOrderTicket(incoming)) return current;
        return withoutDismissed(applyKitchenRow(current, "orders", row));
      });
      if (
        payload.eventType === "INSERT" &&
        isKitchenIncoming(incoming) &&
        soundOnRef.current
      ) {
        void playChimeRef.current();
      }
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`kitchen-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiter_calls",
          filter: tenantFilter,
        },
        onWaiterChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: tenantFilter,
        },
        onOrderChange,
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void refreshCalls();
      });

    void refreshCalls();
    const timer = window.setInterval(() => {
      void refreshCalls();
    }, KITCHEN_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCalls();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (debounce != null) window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  async function acknowledgeCall(id: string) {
    const previous = calls.find((call) => call.id === id);
    setCalls((current) =>
      current.map((call) =>
        call.id === id ? { ...call, status: "acknowledged" } : call,
      ),
    );
    setTab("acknowledged");
    try {
      const response = await fetch(`/api/waiter-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      const json = (await response.json().catch(() => null)) as {
        call?: Record<string, unknown>;
        error?: string;
      } | null;
      if (!response.ok) {
        if (previous) {
          setCalls((current) =>
            current.map((call) => (call.id === id ? previous : call)),
          );
        }
        return;
      }
      const updatedCall = json?.call;
      if (updatedCall) {
        setCalls((current) =>
          applyKitchenRow(current, "waiter_calls", {
            ...updatedCall,
            status: updatedCall.status ?? "acknowledged",
            items:
              updatedCall.items === undefined
                ? previous?.items
                : updatedCall.items,
          }),
        );
      }
    } catch {
      if (previous) {
        setCalls((current) =>
          current.map((call) => (call.id === id ? previous : call)),
        );
      }
    }
  }

  async function markReady(id: string) {
    const previous = calls.find((call) => call.id === id);
    const readyAt = new Date().toISOString();
    setCalls((current) =>
      current.map((call) =>
        call.id === id ? { ...call, ready_at: readyAt } : call,
      ),
    );
    try {
      const response = await fetch(`/api/waiter-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ready: true }),
      });
      if (!response.ok && previous) {
        setCalls((current) =>
          current.map((call) => (call.id === id ? previous : call)),
        );
      }
    } catch {
      if (previous) {
        setCalls((current) =>
          current.map((call) => (call.id === id ? previous : call)),
        );
      }
    }
  }

  async function cancelCall(id: string) {
    const previous = calls;
    dismissedIdsRef.current.add(id);
    setCalls((current) => current.filter((call) => call.id !== id));
    if (editingCall?.id === id) setEditingCall(null);
    try {
      const response = await fetch(`/api/waiter-calls/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        dismissedIdsRef.current.delete(id);
        setCalls(previous);
      }
    } catch {
      dismissedIdsRef.current.delete(id);
      setCalls(previous);
    }
  }

  async function saveEditedItems(items: WaiterCallLine[]) {
    if (!editingCall) return t.orderUpdateFailed;
    const id = editingCall.id;
    const previous = editingCall.items;
    const nextItems = syncServiceFeeLine(
      items,
      serviceFeePercent,
      `${t.serviceFee} (${serviceFeePercent}%)`,
    );
    setCalls((current) =>
      current.map((call) =>
        call.id === id ? { ...call, items: nextItems } : call,
      ),
    );
    const response = await fetch(`/api/waiter-calls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: nextItems }),
    });
    if (!response.ok) {
      setCalls((current) =>
        current.map((call) =>
          call.id === id ? { ...call, items: previous } : call,
        ),
      );
      return t.orderUpdateFailed;
    }
    return null;
  }

  async function clearAcknowledgedHistory() {
    const previous = calls;
    const ids = calls
      .filter((call) => isKitchenOrderTicket(call) && isKitchenReady(call))
      .map((call) => call.id);
    for (const id of ids) dismissedIdsRef.current.add(id);
    setCalls((current) =>
      current.filter(
        (call) => !(isKitchenOrderTicket(call) && isKitchenReady(call)),
      ),
    );
    try {
      const response = await fetch("/api/waiter-calls", { method: "DELETE" });
      if (!response.ok) {
        for (const id of ids) dismissedIdsRef.current.delete(id);
        setCalls(previous);
        return;
      }
      const refresh = await fetch("/api/waiter-calls", { cache: "no-store" });
      const json = (await refresh.json().catch(() => null)) as {
        calls?: Record<string, unknown>[];
      } | null;
      if (!refresh.ok || !Array.isArray(json?.calls)) return;
      setCalls(
        withoutDismissed(
          filterKitchenBoardTickets(json.calls.map((row) => toWaiterCall(row))),
        ),
      );
    } catch {
      for (const id of ids) dismissedIdsRef.current.delete(id);
      setCalls(previous);
    }
  }

  async function completeFloorCall(id: string) {
    const previous = calls;
    dismissedIdsRef.current.add(id);
    setCalls((current) => current.filter((call) => call.id !== id));
    try {
      const ack = await fetch(`/api/waiter-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      if (!ack.ok) {
        dismissedIdsRef.current.delete(id);
        setCalls(previous);
        return;
      }
      const done = await fetch(`/api/waiter-calls/${id}`, { method: "DELETE" });
      if (!done.ok) {
        dismissedIdsRef.current.delete(id);
        setCalls(previous);
      }
    } catch {
      dismissedIdsRef.current.delete(id);
      setCalls(previous);
    }
  }

  const orderCalls = useMemo(
    () => filterKitchenOrderTickets(calls),
    [calls],
  );
  const floorCalls = useMemo(
    () =>
      filterFloorServiceTickets(calls).filter(
        (call) => isKitchenReceived(call) || isKitchenInProgress(call),
      ),
    [calls],
  );
  const pending = useMemo(
    () => orderCalls.filter((call) => isKitchenReceived(call)),
    [orderCalls],
  );
  const acknowledged = useMemo(
    () =>
      orderCalls.filter(
        (call) => isKitchenInProgress(call) || isKitchenReady(call),
      ),
    [orderCalls],
  );
  const visible = tab === "pending" ? pending : acknowledged;

  return (
    <div className="space-y-3">
      <audio ref={chimeRef} src={CHIME_URL} preload="auto" className="hidden">
        <track
          kind="captions"
          src="/chime-captions.vtt"
          srcLang="en"
          label="English"
        />
      </audio>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={soundOn ? "default" : "outline"}
          className="gap-1.5"
          aria-pressed={soundOn}
          onClick={() => void toggleSound()}
        >
          {soundOn ? t.soundActive : t.enableSound}
        </Button>
      </div>

      <section className="rounded-xl border border-amber-500/35 bg-amber-50/40 p-3 dark:bg-amber-950/20">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <BellIcon className="size-4" />
          {t.floorService}
          {floorCalls.length ? ` (${floorCalls.length})` : ""}
        </h3>
        {floorCalls.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.noFloorCalls}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {floorCalls.map((call) => {
              const type = parseWaiterCallType(call.call_type);
              const style = WAITER_CALL_STYLE[type];
              return (
                <article
                  key={call.id}
                  className={`rounded-lg border p-3 ${style.card}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge>
                      {call.table_number || call.table_id.slice(0, 8)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {elapsed(callTimerAt(call), t.minutes, now)}
                    </span>
                  </div>
                  <CallTypeRow type={type} locale={locale} />
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => void completeFloorCall(call.id)}
                  >
                    {t.markFloorDone}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border p-3">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <BellIcon className="size-4" />
          {t.kitchenIncomingOrders}
        </h3>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "pending" ? "default" : "outline"}
            onClick={() => setTab("pending")}
          >
            {t.kitchenActiveOrders}
            {pending.length ? ` (${pending.length})` : ""}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "acknowledged" ? "default" : "outline"}
            onClick={() => setTab("acknowledged")}
          >
            {t.acknowledgedOrders}
            {acknowledged.length ? ` (${acknowledged.length})` : ""}
          </Button>
        </div>

        {tab === "acknowledged" ? (
          <div className="mb-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={acknowledged.length === 0}
              onClick={() => void clearAcknowledgedHistory()}
            >
              {t.clearCallHistory}
            </Button>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {tab === "pending" ? t.noKitchenOrders : t.noAcknowledgedOrders}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((call) => {
              const incoming = isKitchenIncoming(call);
              const timerAt = callTimerAt(call);
              const sla = slaLevel(call, now);
              return (
              <article
                key={call.id}
                className={
                  incoming
                    ? pendingTicketClass(call, now)
                    : "bg-muted/40 rounded-lg border p-3"
                }
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge>{call.table_number || call.table_id.slice(0, 8)}</Badge>
                  <span
                    className={
                      sla === "overdue"
                        ? "text-xs font-bold text-red-700 dark:text-red-400"
                        : sla === "warn"
                          ? "text-xs font-semibold text-amber-800 dark:text-amber-300"
                          : "text-muted-foreground text-xs"
                    }
                  >
                    {elapsed(timerAt, t.minutes, now)}
                    {sla === "overdue" ? ` · ${t.slaOverdue}` : ""}
                  </span>
                </div>
                {call.call_type && call.call_type !== "call_waiter" ? (
                  <CallTypeRow type={call.call_type} locale={locale} />
                ) : null}
                {call.items.length ? (
                  (() => {
                    const split = splitFoodLines(call.items);
                    if (!split.added.length) {
                      return (
                        <div className="mb-2">
                          <KitchenFoodList
                            callId={call.id}
                            callType={call.call_type}
                            items={split.previous}
                            locale={locale}
                            newLabel={t.newAddition}
                          />
                        </div>
                      );
                    }
                    return (
                      <div className="mb-2 space-y-2">
                        {split.previous.length ? (
                          <div>
                            <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                              {t.alreadyOrdered}
                            </p>
                            <KitchenFoodList
                              callId={call.id}
                              callType={call.call_type}
                              items={split.previous}
                              locale={locale}
                              newLabel={t.newAddition}
                            />
                          </div>
                        ) : null}
                        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-2 dark:bg-amber-950/50">
                          <p className="mb-1 text-xs font-bold tracking-wide text-amber-950 uppercase dark:text-amber-100">
                            {t.justAdded}
                          </p>
                          <KitchenFoodList
                            callId={`${call.id}-new`}
                            callType={call.call_type}
                            items={split.added}
                            locale={locale}
                            newLabel={t.newAddition}
                            showNewBadge
                          />
                        </div>
                      </div>
                    );
                  })()
                ) : call.call_type ? null : (
                  <Badge variant="secondary" className="mb-2">
                    {t.emptyWaiterCall}
                  </Badge>
                )}
                {shouldShowOrderTotal(call) ? (
                  <KitchenTicketTotals
                    items={call.items}
                    fallbackPercent={serviceFeePercent}
                    dishesLabel={t.dishesSubtotal}
                    serviceLabel={t.serviceFee}
                    dueLabel={t.grandTotalDue}
                    totalLabel={t.kitchenOrderTotal}
                  />
                ) : null}
                {isKitchenReceived(call) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="min-w-0 flex-1"
                      onClick={() => void acknowledgeCall(call.id)}
                    >
                      {t.acknowledge}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-w-0 flex-1"
                      onClick={() => setEditingCall(call)}
                    >
                      {t.editOrder}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10 min-w-0 flex-1"
                      onClick={() => void cancelCall(call.id)}
                    >
                      {t.cancel}
                    </Button>
                  </div>
                ) : isKitchenInProgress(call) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{t.acknowledge}</Badge>
                    <Button
                      size="sm"
                      className="min-w-0 flex-1"
                      onClick={() => void markReady(call.id)}
                    >
                      {t.markReady}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCall(call)}
                    >
                      {t.editOrder}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{t.kitchenOrderReady}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCall(call)}
                    >
                      {t.editOrder}
                    </Button>
                  </div>
                )}
              </article>
              );
            })}
          </div>
        )}
      </section>
      <OrderEditDialog
        call={editingCall}
        dishes={dishes}
        serviceFeePercent={serviceFeePercent}
        onClose={() => setEditingCall(null)}
        onSave={saveEditedItems}
      />
    </div>
  );
}
