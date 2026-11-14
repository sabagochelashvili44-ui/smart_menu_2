import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type RestaurantAiHost = {
  restaurantId: string;
  createdAt: string | null;
};

function isMissingHostTable(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("restaurant_ai_hosts") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("permission denied"))
  );
}

export async function loadRestaurantAiHost(
  restaurantId: string,
): Promise<RestaurantAiHost | null> {
  if (!restaurantId) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("restaurant_ai_hosts")
    .select("restaurant_id, created_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    if (isMissingHostTable(error)) {
      return { restaurantId, createdAt: null };
    }
    console.error("[ai-host] load failed", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as { restaurant_id?: unknown; created_at?: unknown };
  return {
    restaurantId: String(row.restaurant_id ?? restaurantId),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

export async function ensureRestaurantAiHost(
  restaurantId: string,
): Promise<RestaurantAiHost | null> {
  if (!restaurantId) return null;
  const existing = await loadRestaurantAiHost(restaurantId);
  if (existing?.createdAt) return existing;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("restaurant_ai_hosts")
    .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id" })
    .select("restaurant_id, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingHostTable(error)) {
      return { restaurantId, createdAt: null };
    }
    console.error("[ai-host] ensure failed", error.message);
    return existing ?? { restaurantId, createdAt: null };
  }
  if (!data) return { restaurantId, createdAt: null };
  const row = data as { restaurant_id?: unknown; created_at?: unknown };
  return {
    restaurantId: String(row.restaurant_id ?? restaurantId),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}
