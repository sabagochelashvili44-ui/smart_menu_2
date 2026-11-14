"use client";

import type { MenuLocale, ui } from "@/lib/menu-copy";
import {
  GUEST_PROGRESS_TICKET_MAX_AGE_MS,
  isFreshGuestTicket,
  isGuestProgressCall,
  WAITER_CALL_LABELS,
  type WaiterCallType,
} from "@/lib/waiter-call-types";
import { useEffect, useState } from "react";

export type GuestTicket = {
  id: string;
  status: string;
  call_type: WaiterCallType;
  created_at: string;
  ready_at?: string | null;
  stage: "sent" | "seen" | "ready" | "done";
};

const POLL_MS = 2000;
const DONE_HIDE_MS = 8000;

function stageFromStatus(status: string): GuestTicket["stage"] {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "acknowledged" ||
    normalized === "accepted" ||
    normalized === "completed" ||
    normalized === "ready" ||
    normalized === "served"
  ) {
    return "seen";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "done") {
    return "done";
  }
  return "sent";
}

function asTicket(call: {
  id: string;
  status: string;
  call_type: WaiterCallType;
  created_at: string;
  ready_at?: string | null;
}): GuestTicket {
  return {
    id: call.id,
    status: call.status,
    call_type: call.call_type,
    created_at: call.created_at,
    ready_at: call.ready_at ?? null,
    stage: call.ready_at ? "ready" : stageFromStatus(call.status),
  };
}

function newer(a: GuestTicket, b: GuestTicket) {
  return new Date(a.created_at).getTime() >= new Date(b.created_at).getTime()
    ? a
    : b;
}

export function GuestTicketStatus({
  restaurantId,
  tableId,
  locale,
  copy,
  seed,
}: {
  restaurantId: string;
  tableId: string;
  locale: MenuLocale;
  copy: (typeof ui)[MenuLocale];
  seed: GuestTicket | null;
}) {
  const [ticket, setTicket] = useState<GuestTicket | null>(null);

  useEffect(() => {
    if (!seed || !isGuestProgressCall(seed.call_type)) return;
    if (!isFreshGuestTicket(seed.created_at)) return;
    setTicket((current) => {
      if (current?.id === seed.id) return { ...current, ...seed };
      if (current && current.stage !== "done" && newer(current, seed) === current) {
        return current;
      }
      return seed;
    });
  }, [seed]);

  useEffect(() => {
    if (!restaurantId || !tableId) return;
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch(
          `/api/waiter-calls/guest?restaurant_id=${encodeURIComponent(restaurantId)}&table_id=${encodeURIComponent(tableId)}&ts=${Date.now()}`,
          { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          calls?: {
            id: string;
            status: string;
            call_type: WaiterCallType;
            created_at: string;
            ready_at?: string | null;
          }[];
        };
        if (cancelled) return;
        const liveCall = json.calls?.find(
          (call) =>
            isGuestProgressCall(call.call_type) &&
            isFreshGuestTicket(call.created_at),
        );
        const live = liveCall ? asTicket(liveCall) : null;
        setTicket((current) => {
          if (current && !isGuestProgressCall(current.call_type)) return null;
          if (current && !isFreshGuestTicket(current.created_at)) return live;
          if (live) {
            if (
              current &&
              current.id !== live.id &&
              newer(current, live) === current
            ) {
              return current;
            }
            return live;
          }
          if (current && current.stage !== "done") {
            return { ...current, stage: "done", status: "done" };
          }
          return current;
        });
      } catch {
        // Keep last known ticket.
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [restaurantId, tableId]);

  useEffect(() => {
    if (!ticket) return;
    if (!isFreshGuestTicket(ticket.created_at)) {
      setTicket(null);
      return;
    }
    const created = Date.parse(ticket.created_at);
    const remaining = created + GUEST_PROGRESS_TICKET_MAX_AGE_MS - Date.now();
    const timer = window.setTimeout(() => {
      setTicket(null);
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [ticket]);

  useEffect(() => {
    if (ticket?.stage !== "done") return;
    const timer = window.setTimeout(() => {
      setTicket((current) => (current?.stage === "done" ? null : current));
    }, DONE_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [ticket]);

  if (!ticket) return null;

  const label =
    WAITER_CALL_LABELS[ticket.call_type]?.[locale] ?? copy.requestSent;
  const stage =
    ticket.stage === "sent"
      ? copy.ticketSent
      : ticket.stage === "seen"
        ? copy.ticketSeen
        : ticket.stage === "ready"
          ? copy.ticketReady
          : copy.ticketDone;

  return (
    <p className="text-muted-foreground truncate text-xs">
      <span className="text-foreground font-medium">{label}</span>
      {" · "}
      {stage}
    </p>
  );
}
