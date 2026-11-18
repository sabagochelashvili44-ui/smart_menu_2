import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasUsableServiceRoleKey,
  type StaffWriteMode,
} from "@/lib/staff-write-shared";

export type { StaffWriteMode };
export {
  hasUsableServiceRoleKey,
  staffWriteErrorMessage,
} from "@/lib/staff-write-shared";

/**
 * Prefer service_role for staff table writes (bypasses RLS).
 * When the key is missing / non-JWT (admin would silently fall back to anon),
 * use the logged-in owner's cookie session so `auth.jwt()->>'email'` can
 * satisfy `is_restaurant_owner(restaurant_id)` on restaurant_staff policies.
 */
export async function createStaffWriteClient(): Promise<{
  client: SupabaseClient;
  mode: StaffWriteMode;
}> {
  if (hasUsableServiceRoleKey()) {
    return { client: createSupabaseAdminClient(), mode: "service" };
  }
  // Do NOT call createSupabaseAdminClient() here — without a usable
  // service_role it returns anon with no user JWT and RLS inserts fail.
  return {
    client: await createSupabaseServerClient(),
    mode: "user",
  };
}
