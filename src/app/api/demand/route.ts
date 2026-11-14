import {
  insertOffMenuRequest,
  menuCoversQuery,
  offMenuDishQuery,
  type OffMenuSource,
} from "@/lib/guest-demand";
import {
  assertGuestRestaurant,
  assertGuestTable,
  rateLimitPublicApi,
} from "@/lib/public-api-guard";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    restaurant_id?: string;
    table_id?: string | null;
    session_id?: string;
    source?: string;
    query?: string;
    dishes?: Array<{
      name?: string | null;
      name_en?: string | null;
      name_ru?: string | null;
      description?: string | null;
      ingredients?: string[] | null;
    }>;
  };

  const restaurantId = body.restaurant_id?.trim() ?? "";
  const limited = rateLimitPublicApi(request, "demand", restaurantId, 40);
  if (!limited.ok) return limited.response;

  const restaurant = await assertGuestRestaurant(restaurantId);
  if (!restaurant) {
    return NextResponse.json({ error: "restaurant_id required" }, { status: 400 });
  }

  const source: OffMenuSource | null =
    body.source === "search" || body.source === "chat" ? body.source : null;
  if (!source) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const query = offMenuDishQuery(String(body.query ?? ""));
  if (!query) return NextResponse.json({ ok: true, skipped: true });
  if (Array.isArray(body.dishes) && menuCoversQuery(body.dishes, query)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const tableId = body.table_id?.trim() || "";
  let resolvedTableId: string | null = null;
  if (tableId) {
    const table = await assertGuestTable(restaurant.id, tableId);
    if (!table) {
      return NextResponse.json({ error: "Invalid table." }, { status: 400 });
    }
    resolvedTableId = table.id;
  }

  await insertOffMenuRequest({
    restaurantId: restaurant.id,
    tableId: resolvedTableId,
    sessionId: body.session_id,
    source,
    query,
  });
  return NextResponse.json({ ok: true });
}
