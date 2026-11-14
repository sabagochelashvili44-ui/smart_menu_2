import "server-only";

import { isUuid } from "@/lib/restaurant-brand";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 4000;

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type GuestTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
};

export type GuestRestaurant = {
  id: string;
  service_fee_percent: number | null;
};

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((time) => now - time < WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

export function rateLimitPublicApi(
  request: Request,
  route: string,
  restaurantId: string | null | undefined,
  maxPerMinute: number,
): { ok: true } | { ok: false; response: NextResponse } {
  const now = Date.now();
  prune(now);
  const restaurant = (restaurantId ?? "").trim() || "-";
  const key = `${route}:${clientIp(request)}:${restaurant}`;
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => now - time < WINDOW_MS);
  if (bucket.hits.length >= maxPerMinute) {
    buckets.set(key, bucket);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}

export async function assertGuestRestaurant(restaurantId: string) {
  if (!isUuid(restaurantId)) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("restaurants")
    .select("id, service_fee_percent")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    service_fee_percent:
      data.service_fee_percent == null ? null : Number(data.service_fee_percent),
  } satisfies GuestRestaurant;
}

export async function assertGuestTable(restaurantId: string, tableId: string) {
  if (!isUuid(restaurantId) || !isUuid(tableId)) return null;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("tables")
    .select("id, restaurant_id, table_number")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    restaurant_id: String(data.restaurant_id),
    table_number: String(data.table_number ?? ""),
  } satisfies GuestTable;
}
