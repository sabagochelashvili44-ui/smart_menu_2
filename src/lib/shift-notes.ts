export type ShiftNote = {
  id: string;
  restaurant_id: string;
  title: string;
  body: string;
  author_email: string;
  author_role: string | null;
  created_at: string;
};

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function toShiftNote(row: Record<string, unknown>): ShiftNote {
  return {
    id: String(row.id ?? ""),
    restaurant_id: String(row.restaurant_id ?? ""),
    title: String(row.title ?? "").trim(),
    body: firstNonEmpty(row.content, row.body),
    author_email: firstNonEmpty(
      row.author_email,
      row.author_name,
      row.created_by,
    ),
    author_role: row.author_role ? String(row.author_role) : null,
    created_at: String(row.created_at ?? ""),
  };
}
