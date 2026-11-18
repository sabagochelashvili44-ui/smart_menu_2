export type StaffWriteMode = "service" | "user";

export function looksLikeJwtServiceKey(key: string) {
  return key.includes(".") && key.length > 80;
}

/** True when env has a usable service_role key (bypasses RLS). */
export function hasUsableServiceRoleKey(
  env: NodeJS.ProcessEnv = process.env,
) {
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    env.SUPERABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  if (!serviceRoleKey) return false;
  if (looksLikeJwtServiceKey(serviceRoleKey)) return true;
  return env.SUPABASE_ALLOW_SECRET_KEY === "1";
}

/** Friendlier message when Postgres RLS rejects restaurant_staff writes. */
export function staffWriteErrorMessage(
  error: { message?: string } | null | undefined,
  mode: StaffWriteMode,
) {
  const raw = String(error?.message ?? "").trim();
  if (/row level security|RLS/i.test(raw)) {
    if (mode === "user") {
      return "Could not save staff: owner session was rejected by database policy. Confirm you are logged in as the restaurant owner, then set SUPABASE_SERVICE_ROLE_KEY on the server.";
    }
    return "Could not save staff: database policy blocked the write. Set a valid SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT) on the server.";
  }
  return raw || "Could not save staff.";
}
