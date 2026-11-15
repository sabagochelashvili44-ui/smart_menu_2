import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClientCredentials } from "@/lib/supabaseClient";
import type { RestaurantBrandFields } from "@/lib/restaurant-brand";
import type { AdminRecipeLine } from "@/lib/dish-recipes";

let warnedMissingServiceRole = false;
let warnedNonJwtServiceRole = false;

function looksLikeJwt(key: string) {
  // Legacy anon/service_role keys are JWTs (three base64 segments).
  return key.includes(".") && key.length > 80;
}

/**
 * Prefer a legacy JWT service_role. Non-JWT `sb_secret_…` keys are rejected by
 * PostgREST on some projects ("Invalid API key") and would empty the guest menu.
 * Set SUPABASE_ALLOW_SECRET_KEY=1 to force using a non-JWT secret.
 */
function resolveAdminKey(serviceRoleKey: string, anonOrPlaceholder: string) {
  if (!serviceRoleKey) {
    if (!warnedMissingServiceRole) {
      warnedMissingServiceRole = true;
      console.warn(
        "[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is missing; falling back to anon key.",
      );
    }
    return anonOrPlaceholder;
  }
  if (looksLikeJwt(serviceRoleKey) || process.env.SUPABASE_ALLOW_SECRET_KEY === "1") {
    return serviceRoleKey;
  }
  if (!warnedNonJwtServiceRole) {
    warnedNonJwtServiceRole = true;
    console.warn(
      "[supabaseAdmin] Non-JWT SUPABASE_SERVICE_ROLE_KEY ignored (use legacy service_role JWT, or SUPABASE_ALLOW_SECRET_KEY=1); falling back to anon key.",
    );
  }
  return anonOrPlaceholder;
}

/** Server-only client. Requires the service role so writes bypass RLS. */
export function createSupabaseAdminClient(): SupabaseClient {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPERABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  const { url, key: anonOrPlaceholder } = getSupabaseClientCredentials();
  const key = resolveAdminKey(serviceRoleKey, anonOrPlaceholder);

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminRestaurant = RestaurantBrandFields;

export type AdminTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
};

export type AdminCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  order_index: number;
  name_en?: string | null;
  name_ru?: string | null;
  station?: string | null;
  menu_role?: string | null;
};

export type AdminDish = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  bottle_price?: number | null;
  glass_price?: number | null;
  margin_score: number;
  image_url: string | null;
  allergens: string[];
  ingredients: string[];
  is_available: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  prep_minutes: number | null;
  name_en?: string | null;
  name_ru?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  /** Curated companion dish/drink ids from the same restaurant menu. */
  pairing_dish_ids?: string[];
  recipe?: AdminRecipeLine[];
};

/** Resolves the signed-in manager's restaurant, or a safe fallback. Never throws. */
export async function getPrimaryRestaurant() {
  try {
    const { getActiveRestaurant } = await import("@/lib/tenant");
    return await getActiveRestaurant();
  } catch {
    return null;
  }
}
