"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bindTenantSession,
  clearTenantSession,
  switchTenantRestaurant,
} from "@/lib/tenant";

export async function bindManagerTenant(preferredSlug?: string | null) {
  return bindTenantSession(preferredSlug);
}

export async function switchActiveTenant(restaurantId: string) {
  const result = await switchTenantRestaurant(restaurantId);
  if (!result.error) {
    revalidatePath("/admin", "layout");
  }
  return result;
}

export async function clearManagerTenant() {
  await clearTenantSession();
}

export async function signOutAdminSession() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } finally {
    await clearTenantSession();
  }
}
