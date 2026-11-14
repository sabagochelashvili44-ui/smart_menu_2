import { priceWaiterCallItems } from "@/lib/price-waiter-call-items";
import {
  assertGuestTable,
  rateLimitPublicApi,
} from "@/lib/public-api-guard";
import { canSeeLowRatingAlerts } from "@/lib/staff-role-shared";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  closeCartsForWaiterCalls,
  closeOpenTableCart,
  sendSharedFoodOrder,
} from "@/lib/table-cart";
import { requireTenantApi } from "@/lib/tenant";
import { sanitizeWaiterCallItems } from "@/lib/waiter-call-items";
import {
  archiveAcknowledgedWaiterCalls,
  insertWaiterCall,
  isMissingArchivedAtColumn,
  selectWaiterCalls,
} from "@/lib/waiter-calls-query";
import {
  filterLowRatingCalls,
  isGuestWaiterCallType,
  parseWaiterCallType,
  type WaiterCallType,
} from "@/lib/waiter-call-types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type WaiterCallItem = {
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note?: string;
};

export type WaiterCall = {
  id: string;
  restaurant_id: string;
  table_id: string;
  table_number: string;
  items: WaiterCallItem[];
  status: string;
  call_type: WaiterCallType;
  created_at: string;
  ready_at?: string | null;
};

function toItems(raw: unknown): WaiterCallItem[] {
  return sanitizeWaiterCallItems(raw) ?? [];
}

function toCall(row: Record<string, unknown>): WaiterCall {
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    table_id: String(row.table_id),
    table_number: String(row.table_number ?? ""),
    items: toItems(row.items),
    status: String(row.status ?? "open"),
    call_type: parseWaiterCallType(row.call_type),
    created_at: String(row.created_at),
    ready_at: row.ready_at ? String(row.ready_at) : null,
  };
}

export async function GET() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;
  const restaurantId = tenant.restaurant.id;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await selectWaiterCalls(supabase, restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const calls = filterLowRatingCalls(
    (data ?? []).map((row) => toCall(row as Record<string, unknown>)),
    canSeeLowRatingAlerts(tenant.staffRole, tenant.isSuperAdmin),
  );


  return NextResponse.json(
    { calls },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    restaurant_id?: string;
    table_id?: string;
    items?: unknown;
    call_type?: unknown;
  } | null;

  const restaurantId = String(body?.restaurant_id ?? "").trim();
  const tableId = String(body?.table_id ?? "").trim();
  const limited = rateLimitPublicApi(
    request,
    `waiter-calls:${tableId || "-"}`,
    restaurantId,
    30,
  );
  if (!limited.ok) {
    return limited.response;
  }

  const table = await assertGuestTable(restaurantId, tableId);
  if (!table) {
    return NextResponse.json({ error: "Invalid waiter call" }, { status: 400 });
  }

  const callType = parseWaiterCallType(body?.call_type);
  if (!isGuestWaiterCallType(callType)) {
    return NextResponse.json({ error: "Invalid waiter call" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (callType === "call_waiter") {
    const sent = await sendSharedFoodOrder(table, body?.items);
    if (!sent.missing) {
      if (sent.error || !sent.call) {
        return NextResponse.json(
          { error: sent.error ?? "Could not call the waiter" },
          {
            status:
              sent.error === "Those dishes are sold out." ||
              sent.error === "Cart is empty."
                ? 400
                : 500,
          },
        );
      }
      return NextResponse.json({
        call: toCall(sent.call as Record<string, unknown>),
        appended: sent.appended === true,
      });
    }
  }

  const items =
    callType === "call_waiter"
      ? await priceWaiterCallItems(table.restaurant_id, body?.items, {
          allowUnavailable: false,
        })
      : [];

  const { data, error } = await insertWaiterCall(supabase, {
    restaurant_id: table.restaurant_id,
    table_id: table.id,
    table_number: table.table_number,
    items,
    status: "open",
    call_type: callType,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not call the waiter" },
      { status: 500 },
    );
  }

  if (callType === "bill_card" || callType === "bill_cash") {
    await closeOpenTableCart(supabase, table.restaurant_id, table.id);
  }

  return NextResponse.json({ call: toCall(data as Record<string, unknown>) });
}

export async function DELETE() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;
  const restaurantId = tenant.restaurant.id;

  const supabase = createSupabaseAdminClient();

  async function callCounts() {
    const total = await supabase
      .from("waiter_calls")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId);
    const acknowledged = await supabase
      .from("waiter_calls")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "acknowledged");
    const archivedRows = await supabase
      .from("waiter_calls")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .not("archived_at", "is", null);
    return {
      total: total.count,
      totalError: total.error?.message ?? null,
      acknowledged: acknowledged.count,
      acknowledgedError: acknowledged.error?.message ?? null,
      archived: archivedRows.count,
      archivedError: archivedRows.error?.message ?? null,
    };
  }

  const before = await callCounts();

  const archived = await archiveAcknowledgedWaiterCalls(
    supabase,
    restaurantId,
  );

  if (archived.error) {
    if (isMissingArchivedAtColumn(archived.error)) {
      return NextResponse.json({ ok: true, archived: false });
    }
    return NextResponse.json({ error: archived.error.message }, { status: 500 });
  }

  await closeCartsForWaiterCalls(
    supabase,
    restaurantId,
    ((archived.data ?? []) as { id: string }[]).map((row) => String(row.id)),
  );

  const after = await callCounts();

  return NextResponse.json({ ok: true, archived: true });
}
