"use client";

import type { CartLine } from "@/components/menu/cart-drawer";
import { applyQuantityDelta, setCartLineNote } from "@/components/menu/guest-cart";
import type { DrinkPour } from "@/lib/menu-lane";
import {
  applyCartMutation,
  parseCartLines,
  type CartMutation,
  type TableCartLine,
} from "@/lib/table-cart-lines";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 2000;
const NOTE_DEBOUNCE_MS = 450;

function overlayPendingNotes(
  lines: CartLine[],
  pending: Map<string, string>,
): CartLine[] {
  if (pending.size === 0) return lines;
  return lines.map((line) => {
    if (!pending.has(line.id)) return line;
    return { ...line, note: pending.get(line.id) };
  });
}

function toCartLine(line: TableCartLine): CartLine {
  return {
    id: line.line_id,
    dishId: line.dish_id,
    name: line.name,
    price: line.unit_price,
    quantity: line.quantity,
    note: line.note,
    status: line.status,
    batch: line.batch,
    pour: line.pour,
  };
}

function fromCartLine(line: CartLine): TableCartLine {
  return {
    line_id: line.id,
    dish_id: line.dishId ?? line.id,
    name: line.name,
    quantity: line.quantity,
    unit_price: line.price,
    ...(line.note ? { note: line.note } : {}),
    batch: line.batch ?? 0,
    status: line.status === "sent" ? "sent" : "draft",
    ...(line.pour ? { pour: line.pour } : {}),
  };
}

export function useSharedTableCart(
  restaurantId: string,
  tableId: string | null,
) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [shared, setShared] = useState(Boolean(tableId));
  const sharedRef = useRef(shared);
  const linesRef = useRef<CartLine[]>([]);
  const busyRef = useRef(0);
  const chainRef = useRef(Promise.resolve());
  const pendingNotesRef = useRef(new Map<string, string>());
  const noteTimerRef = useRef<number | null>(null);
  sharedRef.current = shared;

  const replaceLines = useCallback((incoming: CartLine[]) => {
    const pending = pendingNotesRef.current;
    for (const [id, note] of pending) {
      const remote = incoming.find((line) => line.id === id);
      if (remote && (remote.note ?? "") === note) pending.delete(id);
    }
    const next = overlayPendingNotes(incoming, pending);
    linesRef.current = next;
    setLines(next);
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!tableId || !sharedRef.current || (!force && busyRef.current > 0)) return;
    try {
      const res = await fetch(
        `/api/table-cart?restaurant_id=${encodeURIComponent(restaurantId)}&table_id=${encodeURIComponent(tableId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { lines?: unknown; shared?: boolean };
      if (json.shared === false) {
        setShared(false);
        return;
      }
      setShared(true);
      replaceLines(parseCartLines(json.lines).map(toCartLine));
    } catch {
      // Keep the last cart.
    }
  }, [replaceLines, restaurantId, tableId]);

  useEffect(() => {
    pendingNotesRef.current.clear();
    if (noteTimerRef.current != null) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    replaceLines([]);
    setShared(Boolean(tableId));
  }, [replaceLines, restaurantId, tableId]);

  useEffect(() => {
    return () => {
      if (noteTimerRef.current != null) {
        window.clearTimeout(noteTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tableId || !shared) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, shared, tableId]);

  const commit = useCallback(
    (mutation: CartMutation) => {
      if (!tableId || !sharedRef.current) return;
      if (mutation.op !== "set_note") {
        setLines((current) => {
          const next = applyCartMutation(
            current.map(fromCartLine),
            mutation,
            () => crypto.randomUUID(),
          ).map(toCartLine);
          linesRef.current = overlayPendingNotes(
            next,
            pendingNotesRef.current,
          );
          return linesRef.current;
        });
      }
      busyRef.current += 1;
      const run = chainRef.current.then(async () => {
        try {
          const res = await fetch("/api/table-cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              restaurant_id: restaurantId,
              table_id: tableId,
              ...mutation,
            }),
          });
          const json = (await res.json().catch(() => null)) as {
            lines?: unknown;
            shared?: boolean;
          } | null;
          if (json?.shared === false) {
            setShared(false);
            return;
          }
          if (!res.ok || !json) {
            await refresh(true);
            return;
          }
          replaceLines(parseCartLines(json.lines).map(toCartLine));
        } catch {
          await refresh(true);
        } finally {
          busyRef.current = Math.max(0, busyRef.current - 1);
        }
      });
      chainRef.current = run.then(
        () => undefined,
        () => undefined,
      );
    },
    [refresh, replaceLines, restaurantId, tableId],
  );

  const flushPendingNotes = useCallback(() => {
    if (noteTimerRef.current != null) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    const pending = [...pendingNotesRef.current.entries()];
    for (const [lineId, note] of pending) {
      commit({ op: "set_note", line_id: lineId, note });
    }
  }, [commit]);

  const flush = useCallback(async () => {
    flushPendingNotes();
    await chainRef.current;
    await chainRef.current;
    return overlayPendingNotes(linesRef.current, pendingNotesRef.current);
  }, [flushPendingNotes]);

  const addDish = useCallback(
    (dish: { id: string; name: string; price: number; pour?: DrinkPour }) => {
      if (!sharedRef.current) {
        setLines((current) => {
          const next = applyQuantityDelta(current, dish.id, 1, {
            id: dish.id,
            name: dish.name,
            price: dish.price,
            pour: dish.pour,
          }).map((line) => ({
            ...line,
            dishId: line.dishId ?? line.id,
            status: line.status ?? "draft",
            pour: line.pour ?? dish.pour,
          }));
          linesRef.current = next;
          return next;
        });
        return;
      }
      commit({
        op: "add",
        dish_id: dish.id,
        name: dish.name,
        unit_price: dish.price,
        ...(dish.pour ? { pour: dish.pour } : {}),
      });
    },
    [commit],
  );

  const decreaseDish = useCallback(
    (dishId: string, pour?: DrinkPour) => {
      if (!sharedRef.current) {
        setLines((current) => {
          const match = current.find(
            (line) =>
              (line.dishId ?? line.id) === dishId &&
              (pour ? line.pour === pour : true),
          );
          const next = match
            ? current.flatMap((line) => {
                if (line.id !== match.id) return [line];
                if (line.quantity <= 1) return [];
                return [{ ...line, quantity: line.quantity - 1 }];
              })
            : applyQuantityDelta(current, dishId, -1);
          linesRef.current = next;
          return next;
        });
        return;
      }
      commit({
        op: "decrease_dish",
        dish_id: dishId,
        ...(pour ? { pour } : {}),
      });
    },
    [commit],
  );

  const setLineQuantity = useCallback(
    (lineId: string, quantity: number) => {
      if (!sharedRef.current) {
        setLines((current) => {
          const next = current.flatMap((line) => {
            if (line.id !== lineId) return [line];
            if (quantity < 1) return [];
            return [{ ...line, quantity }];
          });
          linesRef.current = next;
          return next;
        });
        return;
      }
      commit({ op: "set_qty", line_id: lineId, quantity });
    },
    [commit],
  );

  const setLineNote = useCallback(
    (lineId: string, note: string) => {
      const clipped = note.slice(0, 200);
      pendingNotesRef.current.set(lineId, clipped);
      setLines((current) => {
        const next = setCartLineNote(current, lineId, clipped);
        linesRef.current = next;
        return next;
      });
      if (!sharedRef.current) return;
      if (noteTimerRef.current != null) {
        window.clearTimeout(noteTimerRef.current);
      }
      noteTimerRef.current = window.setTimeout(() => {
        noteTimerRef.current = null;
        const pending = pendingNotesRef.current.get(lineId);
        if (pending === undefined) return;
        commit({ op: "set_note", line_id: lineId, note: pending });
      }, NOTE_DEBOUNCE_MS);
    },
    [commit],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      if (!sharedRef.current) {
        setLines((current) => {
          const next = current.filter((line) => line.id !== lineId);
          linesRef.current = next;
          return next;
        });
        return;
      }
      commit({ op: "remove", line_id: lineId });
    },
    [commit],
  );

  return {
    lines,
    shared,
    refresh,
    flush,
    addDish,
    decreaseDish,
    setLineQuantity,
    setLineNote,
    removeLine,
  };
}
