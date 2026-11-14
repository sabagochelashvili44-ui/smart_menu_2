import type { SupabaseClient } from "@supabase/supabase-js";

type ShiftNoteInsert = {
  restaurant_id: string;
  title?: string;
  content: string;
  body?: string;
  author_email?: string;
  author_role?: string | null;
  is_active?: boolean;
};

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function missingColumnName(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  const quoted =
    message.match(/Could not find the '([^']+)' column/i) ??
    message.match(/column "([^"]+)" of relation/i) ??
    message.match(/column "([^"]+)" does not exist/i);
  return quoted?.[1]?.toLowerCase() ?? null;
}

function compactInsert(row: ShiftNoteInsert) {
  const payload: Record<string, string | boolean> = {
    restaurant_id: row.restaurant_id,
    content: row.content,
  };
  const title = String(row.title ?? "").trim();
  if (title) payload.title = title;
  if (row.body) payload.body = row.body;
  if (row.author_email) payload.author_email = row.author_email;
  if (row.author_role) payload.author_role = row.author_role;
  if (typeof row.is_active === "boolean") payload.is_active = row.is_active;
  return payload;
}

export async function selectShiftNotes(
  supabase: SupabaseClient,
  restaurantId: string,
) {
  const withActive = await supabase
    .from("shift_notes")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!withActive.error) return withActive;
  if (!isMissingColumnError(withActive.error)) return withActive;

  return supabase
    .from("shift_notes")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(40);
}

export async function insertShiftNote(
  supabase: SupabaseClient,
  row: ShiftNoteInsert,
) {
  const payload = compactInsert({
    ...row,
    content: row.content,
    body: row.body || row.content,
  });

  let lastError: { message?: string } | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await supabase
      .from("shift_notes")
      .insert(payload)
      .select("*")
      .single();

    if (!result.error && result.data) {
      const saved = result.data as Record<string, unknown>;
      return {
        ...result,
        data: {
          ...saved,
          content: saved.content ?? payload.content ?? row.content,
          body: saved.body ?? saved.content ?? payload.body ?? row.content,
          author_email: saved.author_email ?? payload.author_email ?? "",
          author_role: saved.author_role ?? payload.author_role ?? null,
        },
      };
    }

    lastError = result.error;
    const column = missingColumnName(result.error);
    if (
      column &&
      column in payload &&
      column !== "content" &&
      column !== "restaurant_id"
    ) {
      delete payload[column];
      continue;
    }

    return result;
  }

  return { data: null, error: lastError };
}
