import {
  assertGuestRestaurant,
  assertGuestTable,
  rateLimitPublicApi,
} from "@/lib/public-api-guard";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireTenantApi } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function toReview(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    restaurant_id: String(row.restaurant_id ?? ""),
    table_id: row.table_id ? String(row.table_id) : null,
    table_number: row.table_number ? String(row.table_number) : "",
    rating: Number(row.rating) || 0,
    feedback: String(row.feedback ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}

export async function GET() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;
  const restaurantId = tenant.restaurant.id;

  const supabase = createSupabaseAdminClient();
  const withTable = await supabase
    .from("reviews")
    .select("id, restaurant_id, rating, feedback, created_at, table_id, table_number")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!withTable.error) {
    return NextResponse.json({
      reviews: (withTable.data ?? []).map((row) =>
        toReview(row as Record<string, unknown>),
      ),
    });
  }

  const fallback = await supabase
    .from("reviews")
    .select("id, restaurant_id, rating, feedback, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (fallback.error) {
    return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  }

  return NextResponse.json({
    reviews: (fallback.data ?? []).map((row) =>
      toReview(row as Record<string, unknown>),
    ),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    restaurant_id?: string;
    table_id?: string | null;
    table_number?: string;
    rating?: number;
    feedback?: string;
  } | null;

  const restaurantId = String(body?.restaurant_id ?? "").trim();
  const rating = Number(body?.rating);
  const feedback = String(body?.feedback ?? "").trim().slice(0, 1000) || "—";
  const limited = rateLimitPublicApi(request, "reviews", restaurantId, 5);
  if (!limited.ok) return limited.response;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }

  const restaurant = await assertGuestRestaurant(restaurantId);
  if (!restaurant) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }

  const tableId = String(body?.table_id ?? "").trim();
  const payload: Record<string, string | number> = {
    restaurant_id: restaurant.id,
    rating,
    feedback,
  };
  if (tableId) {
    const table = await assertGuestTable(restaurant.id, tableId);
    if (!table) {
      return NextResponse.json({ error: "Invalid review" }, { status: 400 });
    }
    payload.table_id = table.id;
    payload.table_number = table.table_number;
  }

  const supabase = createSupabaseAdminClient();

  let result = await supabase.from("reviews").insert(payload).select("*").single();
  if (result.error) {
    delete payload.table_id;
    delete payload.table_number;
    result = await supabase.from("reviews").insert(payload).select("*").single();
  }

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message ?? "Could not save review" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    review: toReview(result.data as Record<string, unknown>),
  });
}
