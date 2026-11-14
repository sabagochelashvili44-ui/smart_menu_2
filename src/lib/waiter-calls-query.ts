import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWaiterCallType } from "@/lib/waiter-call-types";

export const WAITER_CALL_SELECT =
  "id, restaurant_id, table_id, table_number, items, status, call_type, created_at";
export const WAITER_CALL_SELECT_LEGACY =
  "id, restaurant_id, table_id, table_number, items, status, created_at";

function missingColumn(
  error: { message?: string } | null | undefined,
  column: string,
) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes(column) &&
    (message.includes("schema cache") ||
      message.includes("column") ||
      message.includes("could not find"))
  );
}

export function isMissingCallTypeColumn(error: { message?: string } | null | undefined) {
  return missingColumn(error, "call_type");
}

export function isMissingArchivedAtColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return message.includes("archived_at") && missingColumn(error, "archived_at");
}

export function isMissingReadyAtColumn(error: { message?: string } | null | undefined) {
  return missingColumn(error, "ready_at");
}

export async function selectWaiterCalls(
  supabase: SupabaseClient,
  restaurantId: string,
) {
  const withReady = `${WAITER_CALL_SELECT}, ready_at`;
  const withArchive = await supabase
    .from("waiter_calls")
    .select(withReady)
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "acknowledged"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (
    withArchive.error &&
    missingColumn(withArchive.error, "ready_at")
  ) {
    const withoutReady = await supabase
      .from("waiter_calls")
      .select(WAITER_CALL_SELECT)
      .eq("restaurant_id", restaurantId)
      .in("status", ["open", "acknowledged"])
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (!withoutReady.error) return withoutReady;
    if (isMissingArchivedAtColumn(withoutReady.error)) {
      return supabase
        .from("waiter_calls")
        .select(WAITER_CALL_SELECT)
        .eq("restaurant_id", restaurantId)
        .in("status", ["open", "acknowledged"])
        .order("created_at", { ascending: false });
    }
    return withoutReady;
  }

  if (!withArchive.error) return withArchive;

  if (isMissingArchivedAtColumn(withArchive.error)) {
    const withoutArchive = await supabase
      .from("waiter_calls")
      .select(WAITER_CALL_SELECT)
      .eq("restaurant_id", restaurantId)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false });
    if (!withoutArchive.error || !isMissingCallTypeColumn(withoutArchive.error)) {
      return withoutArchive;
    }
  }

  if (!isMissingCallTypeColumn(withArchive.error)) return withArchive;

  const legacyArchived = await supabase
    .from("waiter_calls")
    .select(WAITER_CALL_SELECT_LEGACY)
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "acknowledged"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (!legacyArchived.error) return legacyArchived;
  if (!isMissingArchivedAtColumn(legacyArchived.error)) return legacyArchived;

  return supabase
    .from("waiter_calls")
    .select(WAITER_CALL_SELECT_LEGACY)
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false });
}

export async function archiveAcknowledgedWaiterCalls(
  supabase: SupabaseClient,
  restaurantId: string,
  ids?: string[],
) {
  const now = new Date().toISOString();
  let archive = supabase
    .from("waiter_calls")
    .update({ archived_at: now })
    .eq("restaurant_id", restaurantId)
    .eq("status", "acknowledged")
    .is("archived_at", null)
    .not("ready_at", "is", null)
    .select("id");
  if (ids?.length) archive = archive.in("id", ids);
  let archived = await archive;

  if (archived.error && missingColumn(archived.error, "ready_at")) {
    let withoutReady = supabase
      .from("waiter_calls")
      .update({ archived_at: now })
      .eq("restaurant_id", restaurantId)
      .eq("status", "acknowledged")
      .is("archived_at", null)
      .select("id");
    if (ids?.length) withoutReady = withoutReady.in("id", ids);
    archived = await withoutReady;
  }


  if (!archived.error || !isMissingArchivedAtColumn(archived.error)) {
    return archived;
  }

  // Kitchen can hide these tickets in the UI. Never delete sales rows.
  return {
    data: (ids ?? []).map((id) => ({ id })),
    error: null,
  };
}

export async function insertWaiterCall(
  supabase: SupabaseClient,
  row: {
    restaurant_id: string;
    table_id: string;
    table_number: string;
    items: unknown;
    status: string;
    call_type?: unknown;
  },
) {
  const payload = {
    restaurant_id: row.restaurant_id,
    table_id: row.table_id,
    table_number: row.table_number,
    items: row.items,
    status: row.status,
    call_type: parseWaiterCallType(row.call_type),
  };

  const withType = await supabase
    .from("waiter_calls")
    .insert(payload)
    .select(WAITER_CALL_SELECT)
    .single();

  if (!withType.error && withType.data) return withType;

  const message = (withType.error?.message ?? "").toLowerCase();
  const checkFailed =
    message.includes("waiter_calls_call_type_check") ||
    message.includes("violates check constraint");
  if (checkFailed && payload.call_type === "low_rating") {
    const fallback = await supabase
      .from("waiter_calls")
      .insert({ ...payload, call_type: "call_waiter" })
      .select(WAITER_CALL_SELECT)
      .single();
    if (!fallback.error && fallback.data) return fallback;
  }

  if (!isMissingCallTypeColumn(withType.error)) return withType;

  return supabase
    .from("waiter_calls")
    .insert({
      restaurant_id: payload.restaurant_id,
      table_id: payload.table_id,
      table_number: payload.table_number,
      items: payload.items,
      status: payload.status,
    })
    .select(WAITER_CALL_SELECT_LEGACY)
    .single();
}
