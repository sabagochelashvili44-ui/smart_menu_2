import { parseDrinkPour } from "@/lib/menu-lane";
import { rateLimitPublicApi, assertGuestTable } from "@/lib/public-api-guard";
import { mutateTableCart, readTableCart } from "@/lib/table-cart";
import type { CartMutation } from "@/lib/table-cart-lines";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMutation(body: Record<string, unknown> | null): CartMutation | null {
  const op = String(body?.op ?? "");
  if (op === "add") {
    const dishId = String(body?.dish_id ?? "").trim();
    const name = String(body?.name ?? "").trim();
    if (!dishId || !name) return null;
    const pour = parseDrinkPour(body?.pour);
    return {
      op: "add",
      dish_id: dishId,
      name,
      unit_price: Number(body?.unit_price) || 0,
      ...(pour ? { pour } : {}),
    };
  }
  if (op === "decrease_dish") {
    const dishId = String(body?.dish_id ?? "").trim();
    if (!dishId) return null;
    const pour = parseDrinkPour(body?.pour);
    return {
      op: "decrease_dish",
      dish_id: dishId,
      ...(pour ? { pour } : {}),
    };
  }
  if (op === "remove") {
    const lineId = String(body?.line_id ?? "").trim();
    if (!lineId) return null;
    return { op: "remove", line_id: lineId };
  }
  if (op === "set_qty") {
    const lineId = String(body?.line_id ?? "").trim();
    if (!lineId) return null;
    return { op: "set_qty", line_id: lineId, quantity: Number(body?.quantity) || 0 };
  }
  if (op === "set_note") {
    const lineId = String(body?.line_id ?? "").trim();
    if (!lineId) return null;
    return { op: "set_note", line_id: lineId, note: String(body?.note ?? "") };
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const restaurantId = url.searchParams.get("restaurant_id")?.trim() ?? "";
  const tableId = url.searchParams.get("table_id")?.trim() ?? "";
  const limited = rateLimitPublicApi(request, "table-cart-read", restaurantId, 240);
  if (!limited.ok) return limited.response;
  const table = await assertGuestTable(restaurantId, tableId);
  if (!table) {
    return NextResponse.json({ error: "Invalid table." }, { status: 400 });
  }
  const cart = await readTableCart(table);
  if (cart.error) {
    return NextResponse.json({ error: cart.error }, { status: 500 });
  }
  return NextResponse.json(
    {
      lines: cart.lines,
      shared: cart.shared,
      waiter_call_id: cart.waiter_call_id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const restaurantId = String(body?.restaurant_id ?? "").trim();
  const tableId = String(body?.table_id ?? "").trim();
  const limited = rateLimitPublicApi(request, "table-cart-write", restaurantId, 80);
  if (!limited.ok) return limited.response;
  const table = await assertGuestTable(restaurantId, tableId);
  if (!table) {
    return NextResponse.json({ error: "Invalid table." }, { status: 400 });
  }
  const mutation = parseMutation(body);
  if (!mutation) {
    return NextResponse.json({ error: "Invalid cart update." }, { status: 400 });
  }
  const cart = await mutateTableCart(table, mutation);
  if (cart.error) {
    return NextResponse.json({ error: cart.error }, { status: 409 });
  }
  return NextResponse.json({
    lines: cart.lines,
    shared: cart.shared,
    waiter_call_id: cart.waiter_call_id ?? null,
  });
}
