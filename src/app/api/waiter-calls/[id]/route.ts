import { priceWaiterCallItems } from "@/lib/price-waiter-call-items";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { closeCartsForWaiterCalls, closeOpenTableCart } from "@/lib/table-cart";
import { deductInventoryForCall } from "@/lib/inventory";
import { requireTenantApi } from "@/lib/tenant";
import {
  waiterCallItemsTotal,
  type WaiterCallLine,
} from "@/lib/waiter-call-items";
import { isAcknowledgedCall } from "@/lib/sales-metrics";
import {
  archiveAcknowledgedWaiterCalls,
  isMissingArchivedAtColumn,
} from "@/lib/waiter-calls-query";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseWaiterPatch(body: { status?: string; items?: unknown; ready?: boolean }) {
  const acknowledge = body.status === "acknowledged";
  const ready = body.ready === true;
  if (body.items === undefined) {
    return { acknowledge, ready, rawItems: undefined as unknown, error: null };
  }
  if (!Array.isArray(body.items)) {
    return { acknowledge, ready, rawItems: undefined, error: "Invalid items" };
  }
  return { acknowledge, ready, rawItems: body.items, error: null };
}

function waiterPatch(
  acknowledge: boolean,
  items: WaiterCallLine[] | undefined,
  withTimestamp: boolean,
  staff?: { id: string; email: string },
) {
  const patch: Record<string, unknown> = {};
  if (acknowledge) {
    patch.status = "acknowledged";
    if (withTimestamp) patch.acknowledged_at = new Date().toISOString();
    if (staff && withTimestamp) {
      patch.acknowledged_by = staff.id;
      patch.acknowledged_by_email = staff.email || null;
    }
  }
  if (items !== undefined) patch.items = items;
  return patch;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const parsed = parseWaiterPatch(
    ((await request.json().catch(() => null)) ?? {}) as {
      status?: string;
      items?: unknown;
    },
  );
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { acknowledge, ready, rawItems } = parsed;
  if (!acknowledge && !ready && rawItems === undefined) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const restaurantId = tenant.restaurant.id;
  const existingCall = await supabase
    .from("waiter_calls")
    .select("id, table_id, call_type, status, items")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const items: WaiterCallLine[] | undefined =
    rawItems === undefined
      ? undefined
      : await priceWaiterCallItems(restaurantId, rawItems, {
          allowUnavailable: true,
        });

  const staff = {
    id: tenant.user.id,
    email: tenant.user.email ?? "",
  };

  if (ready && !acknowledge && rawItems === undefined) {
    const marked = await supabase
      .from("waiter_calls")
      .update({ ready_at: new Date().toISOString() })
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .is("ready_at", null)
      .select("id, status, ready_at")
      .maybeSingle();
    if (marked.error) {
      return NextResponse.json({ error: marked.error.message }, { status: 500 });
    }
    if (!marked.data) {
      const existingReady = await supabase
        .from("waiter_calls")
        .select("id, status, ready_at")
        .eq("id", id)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (existingReady.error || !existingReady.data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, call: existingReady.data });
    }
    return NextResponse.json({ ok: true, call: marked.data });
  }

  let { data, error } = await supabase
    .from("waiter_calls")
    .update(waiterPatch(acknowledge, items, true, staff))
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select("id, items, status")
    .maybeSingle();

  if (error && acknowledge && /acknowledged_by/i.test(error.message)) {
    const retry = await supabase
      .from("waiter_calls")
      .update(waiterPatch(true, items, true))
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .select("id, items, status")
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error && acknowledge) {
    const retry = await supabase
      .from("waiter_calls")
      .update(waiterPatch(true, items, false))
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .select("id, items, status")
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (!error && data) {
    if (acknowledge) {
      const callType = String(existingCall.data?.call_type ?? "");
      const tableId = String(existingCall.data?.table_id ?? "");
      if (
        tableId &&
        (callType === "bill_card" || callType === "bill_cash")
      ) {
        await closeOpenTableCart(supabase, restaurantId, tableId);
      }
    }
    if (
      acknowledge ||
      (items !== undefined &&
        isAcknowledgedCall(String(existingCall.data?.status ?? "")))
    ) {
      try {
        await deductInventoryForCall(supabase, restaurantId, {
          id,
          items: data.items ?? existingCall.data?.items,
          soldAt: new Date().toISOString(),
        });
      } catch (inventoryError) {
        console.error(
          "[inventory] deduct failed",
          inventoryError instanceof Error
            ? inventoryError.message
            : inventoryError,
        );
      }
    }
    return NextResponse.json({ ok: true, call: data });
  }

  if (acknowledge || items !== undefined) {
    const orderPatch: Record<string, unknown> = {};
    if (items !== undefined) {
      orderPatch.items = items;
      orderPatch.total_amount = waiterCallItemsTotal(items);
    }
    if (acknowledge) orderPatch.status = "served";
    const order = await supabase
      .from("orders")
      .update(orderPatch)
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .select("id, items, status")
      .maybeSingle();
    if (!order.error && order.data) {
      if (
        acknowledge ||
        (items !== undefined &&
          isAcknowledgedCall(String(existingCall.data?.status ?? "")))
      ) {
        try {
          await deductInventoryForCall(supabase, restaurantId, {
            id,
            items: order.data.items ?? existingCall.data?.items,
            soldAt: new Date().toISOString(),
          });
        } catch (inventoryError) {
          console.error(
            "[inventory] deduct failed",
            inventoryError instanceof Error
              ? inventoryError.message
              : inventoryError,
          );
        }
      }
      return NextResponse.json({
        ok: true,
        call: {
          ...order.data,
          status: acknowledge ? "acknowledged" : order.data.status,
        },
      });
    }
    if (order.error) {
      return NextResponse.json({ error: order.error.message }, { status: 500 });
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const supabase = createSupabaseAdminClient();
  const restaurantId = tenant.restaurant.id;
  const existing = await supabase
    .from("waiter_calls")
    .select("id, status, table_id, call_type")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const status = String(existing.data?.status ?? "").trim().toLowerCase();

  if (
    existing.data &&
    (isAcknowledgedCall(status) ||
      status === "accepted" ||
      status === "ready" ||
      status === "served")
  ) {
    const archived = await archiveAcknowledgedWaiterCalls(supabase, restaurantId, [
      id,
    ]);
    if (archived.error) {
      if (isMissingArchivedAtColumn(archived.error)) {
        return NextResponse.json({ ok: true, archived: false });
      }
      return NextResponse.json({ error: archived.error.message }, { status: 500 });
    }
    await closeCartsForWaiterCalls(supabase, restaurantId, [id]);
    return NextResponse.json({ ok: true, archived: true });
  }

  if (existing.error && !existing.data) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("waiter_calls")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (String(existing.data?.call_type ?? "call_waiter") === "call_waiter") {
    await closeCartsForWaiterCalls(supabase, restaurantId, [id]);
    const tableId = String(existing.data?.table_id ?? "");
    if (tableId) await closeOpenTableCart(supabase, restaurantId, tableId);
  }

  await supabase
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true });
}
