import {
  assertGuestRestaurant,
  assertGuestTable,
  rateLimitPublicApi,
} from "@/lib/public-api-guard";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IntentBody = {
  restaurant_id?: string;
  table_id?: string | null;
  session_id?: string;
  events?: {
    event_type?: string;
    dish_id?: string;
    dish_name?: string;
    category_id?: string;
    quantity?: number;
    unit_price?: number;
    duration_ms?: number;
  }[];
};

const ALLOWED = new Set([
  "view",
  "cart_add",
  "cart_remove",
  "session_start",
  "dish_dwell",
  "category_dwell",
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as IntentBody | null;
  const restaurantId = body?.restaurant_id?.trim() ?? "";
  const limited = rateLimitPublicApi(request, "intent", restaurantId, 80);
  if (!limited.ok) return limited.response;

  const restaurant = await assertGuestRestaurant(restaurantId);
  if (!restaurant) {
    return NextResponse.json({ error: "restaurant_id required" }, { status: 400 });
  }

  const tableId = body?.table_id?.trim() || "";
  let resolvedTableId: string | null = null;
  if (tableId) {
    const table = await assertGuestTable(restaurant.id, tableId);
    if (!table) {
      return NextResponse.json({ error: "Invalid table." }, { status: 400 });
    }
    resolvedTableId = table.id;
  }

  const sessionId = String(body?.session_id ?? "").trim().slice(0, 80);
  const rows = (body?.events ?? [])
    .slice(0, 50)
    .map((event) => {
      const eventType = String(event.event_type ?? "");
      if (!ALLOWED.has(eventType)) return null;
      const duration = Math.min(
        120000,
        Math.max(0, Math.floor(Number(event.duration_ms) || 0)),
      );
      return {
        restaurant_id: restaurant.id,
        table_id: resolvedTableId,
        session_id: sessionId,
        category_id: String(event.category_id ?? "").slice(0, 80),
        dish_id: String(event.dish_id ?? "").slice(0, 80),
        dish_name: String(event.dish_name ?? "").slice(0, 200),
        event_type: eventType,
        quantity: Math.min(99, Math.max(1, Math.floor(Number(event.quantity) || 1))),
        unit_price: Math.max(0, Number(event.unit_price) || 0),
        duration_ms: duration,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!rows.length) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("guest_intent_events").insert(rows);

  if (
    error &&
    (/session_id|category_id|duration_ms/i.test(error.message) ||
      /guest_intent_events_type_check|check constraint/i.test(error.message))
  ) {
    const legacy = rows
      .filter((row) =>
        row.event_type === "view" ||
        row.event_type === "cart_add" ||
        row.event_type === "cart_remove",
      )
      .map((row) => ({
        restaurant_id: row.restaurant_id,
        table_id: row.table_id,
        dish_id: row.dish_id,
        dish_name: row.dish_name,
        event_type: row.event_type,
        quantity: row.quantity,
        unit_price: row.unit_price,
      }));
    if (!legacy.length) return NextResponse.json({ ok: true, inserted: 0 });
    const retry = await supabase.from("guest_intent_events").insert(legacy);
    if (retry.error) return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: true, inserted: legacy.length });
  }

  if (error) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
