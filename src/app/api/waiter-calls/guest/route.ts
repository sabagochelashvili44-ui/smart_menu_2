import { assertGuestTable } from "@/lib/public-api-guard";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sanitizeWaiterCallItems } from "@/lib/waiter-call-items";
import {
  isMissingArchivedAtColumn,
  isMissingReadyAtColumn,
  WAITER_CALL_SELECT,
  WAITER_CALL_SELECT_LEGACY,
} from "@/lib/waiter-calls-query";
import {
  isFreshGuestTicket,
  isGuestProgressCall,
  parseWaiterCallType,
} from "@/lib/waiter-call-types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toGuestCall(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    table_id: String(row.table_id),
    table_number: String(row.table_number ?? ""),
    items: sanitizeWaiterCallItems(row.items) ?? [],
    status: String(row.status ?? "open"),
    call_type: parseWaiterCallType(row.call_type),
    created_at: String(row.created_at),
    ready_at: row.ready_at ? String(row.ready_at) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const restaurantId = url.searchParams.get("restaurant_id")?.trim() ?? "";
  const tableId = url.searchParams.get("table_id")?.trim() ?? "";
  const table = await assertGuestTable(restaurantId, tableId);
  if (!table) {
    return NextResponse.json({ error: "Invalid table." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const withArchive = await supabase
    .from("waiter_calls")
    .select(`${WAITER_CALL_SELECT}, archived_at, ready_at`)
    .eq("restaurant_id", table.restaurant_id)
    .eq("table_id", table.id)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(10);

  let rows = (withArchive.data ?? []) as Record<string, unknown>[];
  let queryError = withArchive.error;

  if (queryError && isMissingReadyAtColumn(queryError)) {
    const retry = await supabase
      .from("waiter_calls")
      .select(`${WAITER_CALL_SELECT}, archived_at`)
      .eq("restaurant_id", table.restaurant_id)
      .eq("table_id", table.id)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(10);
    rows = (retry.data ?? []) as Record<string, unknown>[];
    queryError = retry.error;
  }
  if (queryError && isMissingArchivedAtColumn(queryError)) {
    const retry = await supabase
      .from("waiter_calls")
      .select(WAITER_CALL_SELECT)
      .eq("restaurant_id", table.restaurant_id)
      .eq("table_id", table.id)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(10);
    rows = (retry.data ?? []) as Record<string, unknown>[];
    queryError = retry.error;
  }
  if (queryError) {
    const legacy = await supabase
      .from("waiter_calls")
      .select(WAITER_CALL_SELECT_LEGACY)
      .eq("restaurant_id", table.restaurant_id)
      .eq("table_id", table.id)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(10);
    rows = (legacy.data ?? []) as Record<string, unknown>[];
    queryError = legacy.error;
  }
  if (queryError) {
    const message = (queryError.message ?? "").toLowerCase();
    // Dev DBs sometimes have the table without GRANTs yet — don't 500-poll the menu.
    if (message.includes("permission denied")) {
      return NextResponse.json(
        { calls: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const calls = rows
    .filter((row) => !row.archived_at)
    .map(toGuestCall)
    .filter((call) => isGuestProgressCall(call.call_type))
    .filter((call) => isFreshGuestTicket(call.created_at))
    .slice(0, 1);

  return NextResponse.json(
    { calls },
    { headers: { "Cache-Control": "no-store" } },
  );
}
