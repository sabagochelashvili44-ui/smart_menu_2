import "server-only";

import { priceWaiterCallItems } from "@/lib/price-waiter-call-items";
import type { GuestTable } from "@/lib/public-api-guard";
import { ui } from "@/lib/menu-copy";
import { isServiceFeeItem, parseServiceFeePercent, syncServiceFeeLine } from "@/lib/service-fee";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  applyCartMutation,
  markDraftsSent,
  parseCartLines,
  sameCartLines,
  type CartMutation,
  type TableCartLine,
} from "@/lib/table-cart-lines";
import {
  sanitizeWaiterCallItems,
  stampAddedAt,
  type WaiterCallLine,
} from "@/lib/waiter-call-items";
import {
  insertWaiterCall,
  isMissingArchivedAtColumn,
  isMissingCallTypeColumn,
  WAITER_CALL_SELECT,
} from "@/lib/waiter-calls-query";
import { parseWaiterCallType } from "@/lib/waiter-call-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const IDLE_MS = 3 * 60 * 60 * 1000;

export type OpenTableCart = {
  id: string;
  restaurant_id: string;
  table_id: string;
  lines: TableCartLine[];
  version: number;
  waiter_call_id: string | null;
  updated_at: string;
};

export function isMissingTableCarts(
  error: { message?: string } | null | undefined,
) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("table_carts") ||
    (message.includes("relation") && message.includes("table_cart"))
  );
}

function newLineId() {
  return crypto.randomUUID();
}

type FoodCall = {
  id: string;
  items: WaiterCallLine[];
  status: string;
  call_type: string;
  created_at: string;
  table_number: string;
};

function toFoodCall(row: Record<string, unknown>): FoodCall {
  return {
    id: String(row.id),
    items: sanitizeWaiterCallItems(row.items) ?? [],
    status: String(row.status ?? "open"),
    call_type: parseWaiterCallType(row.call_type),
    created_at: String(row.created_at ?? ""),
    table_number: String(row.table_number ?? ""),
  };
}

function rowToCart(row: Record<string, unknown>): OpenTableCart {
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    table_id: String(row.table_id),
    lines: parseCartLines(row.lines),
    version: Number(row.version) || 0,
    waiter_call_id: row.waiter_call_id ? String(row.waiter_call_id) : null,
    updated_at: String(row.updated_at ?? ""),
  };
}

async function loadOpenRow(
  supabase: SupabaseClient,
  restaurantId: string,
  tableId: string,
) {
  const result = await supabase
    .from("table_carts")
    .select("id, restaurant_id, table_id, lines, version, waiter_call_id, updated_at")
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .is("closed_at", null)
    .order("updated_at", { ascending: false });
  if (result.error) return result;
  const rows = result.data ?? [];
  if (rows.length > 1) {
    const extraIds = rows.slice(1).map((row) => String(row.id));
    await supabase
      .from("table_carts")
      .update({ closed_at: new Date().toISOString() })
      .in("id", extraIds);
  }
  return { data: rows[0] ?? null, error: null };
}

export async function closeOpenTableCart(
  supabase: SupabaseClient,
  restaurantId: string,
  tableId: string,
) {
  const result = await supabase
    .from("table_carts")
    .update({ closed_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .is("closed_at", null);
  if (result.error && !isMissingTableCarts(result.error)) {
    console.error("[table-cart] close failed", result.error.message);
  }
}

export async function closeCartsForWaiterCalls(
  supabase: SupabaseClient,
  restaurantId: string,
  waiterCallIds: string[],
) {
  const ids = waiterCallIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return;
  const result = await supabase
    .from("table_carts")
    .update({ closed_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .in("waiter_call_id", ids)
    .is("closed_at", null);
  if (result.error && !isMissingTableCarts(result.error)) {
    console.error("[table-cart] close by call failed", result.error.message);
  }
}

async function ensureOpenCart(
  supabase: SupabaseClient,
  table: GuestTable,
): Promise<
  | { missing: true; cart: null }
  | { missing: false; cart: OpenTableCart }
  | { missing: false; cart: null; error: string }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await loadOpenRow(supabase, table.restaurant_id, table.id);
    if (existing.error) {
      if (isMissingTableCarts(existing.error)) return { missing: true, cart: null };
      return { missing: false, cart: null, error: existing.error.message };
    }
    if (existing.data) {
      const cart = rowToCart(existing.data as Record<string, unknown>);
      const updated = Date.parse(cart.updated_at);
      if (Number.isFinite(updated) && Date.now() - updated > IDLE_MS) {
        await closeOpenTableCart(supabase, table.restaurant_id, table.id);
        continue;
      }
      return { missing: false, cart };
    }

    const inserted = await supabase
      .from("table_carts")
      .insert({
        restaurant_id: table.restaurant_id,
        table_id: table.id,
        lines: [],
        version: 0,
      })
      .select("id, restaurant_id, table_id, lines, version, waiter_call_id, updated_at")
      .maybeSingle();
    if (!inserted.error && inserted.data) {
      return { missing: false, cart: rowToCart(inserted.data as Record<string, unknown>) };
    }
    if (inserted.error && isMissingTableCarts(inserted.error)) {
      return { missing: true, cart: null };
    }
    const message = (inserted.error?.message ?? "").toLowerCase();
    if (message.includes("duplicate") || message.includes("unique")) continue;
    if (inserted.error) {
      return { missing: false, cart: null, error: inserted.error.message };
    }
  }
  return { missing: false, cart: null, error: "Could not open the table cart." };
}

async function writeLines(
  supabase: SupabaseClient,
  cart: OpenTableCart,
  lines: TableCartLine[],
) {
  const result = await supabase
    .from("table_carts")
    .update({
      lines,
      version: cart.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cart.id)
    .eq("version", cart.version)
    .is("closed_at", null)
    .select("id")
    .maybeSingle();
  if (result.error) {
    return {
      ok: false,
      missing: isMissingTableCarts(result.error),
      error: result.error.message,
    };
  }
  return { ok: Boolean(result.data), missing: false, error: null };
}

export async function readTableCart(table: GuestTable) {
  const supabase = createSupabaseAdminClient();
  const opened = await ensureOpenCart(supabase, table);
  if (opened.missing) return { shared: false as const, lines: [] as TableCartLine[], waiter_call_id: null };
  if (!opened.cart) {
    return {
      shared: true as const,
      lines: [] as TableCartLine[],
      waiter_call_id: null,
      error: opened.error,
    };
  }
  return {
    shared: true as const,
    lines: opened.cart.lines,
    waiter_call_id: opened.cart.waiter_call_id,
    error: null,
  };
}

export async function mutateTableCart(table: GuestTable, mutation: CartMutation) {
  const supabase = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const opened = await ensureOpenCart(supabase, table);
    if (opened.missing) {
      return { shared: false as const, lines: [] as TableCartLine[], error: null };
    }
    if (!opened.cart) {
      return { shared: true as const, lines: [] as TableCartLine[], error: opened.error };
    }
    const lines = applyCartMutation(opened.cart.lines, mutation, newLineId);
    if (sameCartLines(lines, opened.cart.lines)) {
      return {
        shared: true as const,
        lines,
        waiter_call_id: opened.cart.waiter_call_id,
        error: null,
      };
    }
    const wrote = await writeLines(supabase, opened.cart, lines);
    if (wrote.missing) {
      return { shared: false as const, lines: [] as TableCartLine[], error: null };
    }
    if (wrote.ok) {
      return {
        shared: true as const,
        lines,
        waiter_call_id: opened.cart.waiter_call_id,
        error: null,
      };
    }
  }
  return {
    shared: true as const,
    lines: [] as TableCartLine[],
    error: "Cart was updated. Try again.",
  };
}

function isAfterBill(createdAt: string, billAt: number | null) {
  if (billAt === null) return true;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return created > billAt;
}

async function latestBillAt(
  supabase: SupabaseClient,
  restaurantId: string,
  tableId: string,
) {
  const result = await supabase
    .from("waiter_calls")
    .select("created_at")
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .in("call_type", ["bill_card", "bill_cash"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (result.error) {
    if (!isMissingCallTypeColumn(result.error)) {
      console.error("[table-cart] bill lookup failed", result.error.message);
    }
    return null;
  }
  const created = Date.parse(String(result.data?.[0]?.created_at ?? ""));
  return Number.isFinite(created) ? created : null;
}

async function loadFoodCalls(
  supabase: SupabaseClient,
  restaurantId: string,
  tableId: string,
) {
  const [withArchive, billAt] = await Promise.all([
    supabase
      .from("waiter_calls")
      .select(`${WAITER_CALL_SELECT}, archived_at`)
      .eq("restaurant_id", restaurantId)
      .eq("table_id", tableId)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(8),
    latestBillAt(supabase, restaurantId, tableId),
  ]);

  let rows = (withArchive.data ?? []) as Record<string, unknown>[];
  let error = withArchive.error;
  if (error && isMissingArchivedAtColumn(error)) {
    const retry = await supabase
      .from("waiter_calls")
      .select(WAITER_CALL_SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("table_id", tableId)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(8);
    rows = (retry.data ?? []) as Record<string, unknown>[];
    error = retry.error;
  }
  if (error) return [] as FoodCall[];
  return rows
    .filter((row) => !row.archived_at)
    .map(toFoodCall)
    .filter(
      (call) =>
        call.call_type === "call_waiter" && isAfterBill(call.created_at, billAt),
    );
}

function pickFoodCall(calls: FoodCall[], preferredId: string | null) {
  if (preferredId) {
    const linked = calls.find((call) => call.id === preferredId);
    if (linked) return linked;
  }
  return calls[0] ?? null;
}

async function loadFeePercent(supabase: SupabaseClient, restaurantId: string) {
  const { data } = await supabase
    .from("restaurants")
    .select("service_fee_percent")
    .eq("id", restaurantId)
    .maybeSingle();
  return parseServiceFeePercent(data?.service_fee_percent);
}

function nextBatch(items: WaiterCallLine[]) {
  const food = items.filter((item) => !isServiceFeeItem(item));
  if (!food.length) return 1;
  const highest = food.reduce(
    (max, item) => Math.max(max, item.batch && item.batch > 0 ? item.batch : 1),
    1,
  );
  return highest + 1;
}

async function publishTicket(
  supabase: SupabaseClient,
  table: GuestTable,
  existing: FoodCall | null,
  additions: WaiterCallLine[],
) {
  const previous = (existing?.items ?? [])
    .filter((item) => !isServiceFeeItem(item))
    .map((item) => ({
      ...item,
      batch: item.batch && item.batch >= 1 ? item.batch : 1,
    }));
  const sentAt = new Date().toISOString();
  const stamped = existing ? stampAddedAt(additions, sentAt) : additions;
  const percent = await loadFeePercent(supabase, table.restaurant_id);
  const items = syncServiceFeeLine(
    [...previous, ...stamped],
    percent,
    ui.ka.serviceFee(percent),
  );
  if (!existing) {
    return insertWaiterCall(supabase, {
      restaurant_id: table.restaurant_id,
      table_id: table.id,
      table_number: table.table_number,
      items,
      status: "open",
      call_type: "call_waiter",
    });
  }
  const patch: Record<string, unknown> = { items };
  if (existing.status === "acknowledged") patch.status = "open";
  return supabase
    .from("waiter_calls")
    .update(patch)
    .eq("id", existing.id)
    .eq("restaurant_id", table.restaurant_id)
    .select(WAITER_CALL_SELECT)
    .single();
}

async function linkCall(supabase: SupabaseClient, cartId: string, callId: string) {
  await supabase
    .from("table_carts")
    .update({
      waiter_call_id: callId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .is("closed_at", null);
}

function ticketHasFood(ticket: FoodCall | null) {
  return Boolean(ticket?.items.some((item) => !isServiceFeeItem(item)));
}

async function foodFromClientItems(restaurantId: string, raw: unknown) {
  const priced = await priceWaiterCallItems(restaurantId, raw, {
    allowUnavailable: false,
  });
  const pricedFood = priced.filter((item) => !isServiceFeeItem(item));
  if (pricedFood.length) return pricedFood;
  return (sanitizeWaiterCallItems(raw) ?? []).filter(
    (item) => !isServiceFeeItem(item),
  );
}

function draftLinesForFood(
  cartLines: TableCartLine[],
  food: WaiterCallLine[],
): TableCartLine[] {
  const next = [...cartLines];
  for (const item of food) {
    const exists = next.some(
      (line) =>
        line.status === "draft" &&
        line.dish_id === item.dish_id &&
        line.quantity === item.quantity &&
        (line.note ?? "") === (item.note ?? "") &&
        (line.pour ?? "") === (item.pour ?? ""),
    );
    if (exists) continue;
    next.push({
      line_id: newLineId(),
      dish_id: item.dish_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      ...(item.note ? { note: item.note } : {}),
      ...(item.pour ? { pour: item.pour } : {}),
      batch: 0,
      status: "draft",
    });
  }
  return next;
}

export async function sendSharedFoodOrder(table: GuestTable, fallbackItems?: unknown) {
  const supabase = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const opened = await ensureOpenCart(supabase, table);
    if (opened.missing) return { missing: true as const, call: null, error: null };
    if (!opened.cart) {
      return { missing: false as const, call: null, error: opened.error };
    }
    const cart = opened.cart;
    const drafts = cart.lines.filter((line) => line.status === "draft");
    const sent = cart.lines.filter((line) => line.status === "sent");
    const calls = await loadFoodCalls(supabase, table.restaurant_id, table.id);
    const ticket = pickFoodCall(calls, cart.waiter_call_id);

    if (drafts.length === 0) {
      const fallbackFood = await foodFromClientItems(
        table.restaurant_id,
        fallbackItems,
      );
      if (fallbackFood.length) {
        const batch = ticket ? nextBatch(ticket.items) : 1;
        const marked = markDraftsSent(
          draftLinesForFood(cart.lines, fallbackFood),
          fallbackFood,
          batch,
        );
        const claimed = await writeLines(supabase, cart, marked);
        if (claimed.missing) return { missing: true as const, call: null, error: null };
        if (!claimed.ok) continue;

        const published = await publishTicket(
          supabase,
          table,
          ticket,
          fallbackFood,
        );
        if (published.error || !published.data) {
          await writeLines(
            supabase,
            { ...cart, version: cart.version + 1 },
            cart.lines,
          );
          return {
            missing: false as const,
            call: null,
            error: published.error?.message ?? "Could not call the waiter",
          };
        }
        await linkCall(
          supabase,
          cart.id,
          String((published.data as { id: string }).id),
        );
        return {
          missing: false as const,
          call: published.data,
          error: null,
          appended: true,
        };
      }
      if (ticket && ticketHasFood(ticket)) {
        if (cart.waiter_call_id !== ticket.id) {
          await linkCall(supabase, cart.id, ticket.id);
        }
        return {
          missing: false as const,
          call: ticket,
          error: null,
          appended: false,
        };
      }
      if (sent.length === 0) {
        return {
          missing: false as const,
          call: null,
          error: "Cart is empty.",
        };
      }
      const pricedSent = await priceWaiterCallItems(
        table.restaurant_id,
        sent.map((line) => ({
          dish_id: line.dish_id,
          name: line.name,
          quantity: line.quantity,
          unit_price: line.unit_price,
          ...(line.note ? { note: line.note } : {}),
          ...(line.pour ? { pour: line.pour } : {}),
          batch: line.batch > 0 ? line.batch : 1,
        })),
        { allowUnavailable: true },
      );
      const published = await publishTicket(
        supabase,
        table,
        null,
        pricedSent.filter((item) => !isServiceFeeItem(item)),
      );
      if (published.error || !published.data) {
        return {
          missing: false as const,
          call: null,
          error: published.error?.message ?? "Could not call the waiter",
        };
      }
      await linkCall(supabase, cart.id, String((published.data as { id: string }).id));
      return { missing: false as const, call: published.data, error: null, appended: true };
    }

    const sentLines = sent.map((line) => ({
      dish_id: line.dish_id,
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      ...(line.note ? { note: line.note } : {}),
      ...(line.pour ? { pour: line.pour } : {}),
      batch: line.batch > 0 ? line.batch : 1,
    }));
    const batch = nextBatch(ticket?.items ?? sentLines);
    const priced = await priceWaiterCallItems(
      table.restaurant_id,
      drafts.map((line) => ({
        dish_id: line.dish_id,
        name: line.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        ...(line.note ? { note: line.note } : {}),
        ...(line.pour ? { pour: line.pour } : {}),
        batch,
      })),
    );
    const additions = priced.filter((item) => !isServiceFeeItem(item));
    if (!additions.length) {
      return {
        missing: false as const,
        call: ticket,
        error: "Those dishes are sold out.",
      };
    }
    const marked = markDraftsSent(cart.lines, additions, batch);
    const claimed = await writeLines(supabase, cart, marked);
    if (claimed.missing) return { missing: true as const, call: null, error: null };
    if (!claimed.ok) continue;

    const published = await publishTicket(
      supabase,
      table,
      ticket,
      ticket ? additions : [...sentLines, ...additions],
    );
    if (published.error || !published.data) {
      await writeLines(
        supabase,
        { ...cart, version: cart.version + 1 },
        cart.lines,
      );
      return {
        missing: false as const,
        call: null,
        error: published.error?.message ?? "Could not call the waiter",
      };
    }
    await linkCall(supabase, cart.id, String((published.data as { id: string }).id));
    return { missing: false as const, call: published.data, error: null, appended: true };
  }
  return {
    missing: false as const,
    call: null,
    error: "Could not call the waiter",
  };
}
