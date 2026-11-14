import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireTenantApi } from "@/lib/tenant";
import type { OrderStatus } from "@/types/database";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VALID_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "preparing",
  "ready",
  "served",
  "cancelled",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: OrderStatus;
  } | null;
  if (!body?.status || !VALID_ORDER_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Valid status required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .update({ status: body.status })
    .eq("id", id)
    .eq("restaurant_id", tenant.restaurant.id)
    .select(
      "id, restaurant_id, table_id, status, total_amount, created_at, items",
    )
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: error?.message ?? "Order not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ order });
}
