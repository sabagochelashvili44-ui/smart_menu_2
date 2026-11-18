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
 * Prefer service_role for staff table writes. When it is missing / non-JWT,
 * fall back to the logged-in owner's cookie session so RLS
 * `is_restaurant_owner(restaurant_id)` can pass.
 */
export async function createStaffWriteClient(): Promise<{
  client: SupabaseClient;
  mode: StaffWriteMode;
}> {
  if (hasUsableServiceRoleKey()) {
    return { client: createSupabaseAdminClient(), mode: "service" };
  }
  const userClient = await createSupabaseServerClient();
  return { client: userClient, mode: "user" };
}
