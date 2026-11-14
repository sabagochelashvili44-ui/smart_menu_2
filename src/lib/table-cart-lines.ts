import { parseDrinkPour, type DrinkPour } from "@/lib/menu-lane";

export type TableCartLine = {
  line_id: string;
  dish_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note?: string;
  batch: number;
  status: "draft" | "sent";
  pour?: DrinkPour;
};

export type CartMutation =
  | { op: "add"; dish_id: string; name: string; unit_price: number; pour?: DrinkPour }
  | { op: "set_qty"; line_id: string; quantity: number }
  | { op: "set_note"; line_id: string; note: string }
  | { op: "remove"; line_id: string }
  | { op: "decrease_dish"; dish_id: string; pour?: DrinkPour };

const MAX_QTY = 99;
const MAX_LINES = 30;

function noteOf(line: TableCartLine) {
  return (line.note ?? "").trim();
}

function withNote(line: TableCartLine, note: string): TableCartLine {
  if (!note) {
    const next = { ...line };
    delete next.note;
    return next;
  }
  return { ...line, note };
}

export function parseCartLines(raw: unknown): TableCartLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: TableCartLine[] = [];
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const lineId = String(row.line_id ?? "").trim();
    const dishId = String(row.dish_id ?? "").trim();
    const name = String(row.name ?? "").trim();
    const quantity = Math.min(
      MAX_QTY,
      Math.max(0, Math.floor(Number(row.quantity) || 0)),
    );
    if (!lineId || !dishId || !name || quantity < 1) continue;
    const note = String(row.note ?? "").trim().slice(0, 200);
    const batch = Math.floor(Number(row.batch) || 0);
    const status = row.status === "sent" ? "sent" : "draft";
    const pour = parseDrinkPour(row.pour);
    lines.push({
      line_id: lineId,
      dish_id: dishId,
      name,
      quantity,
      unit_price: Math.max(0, Number(row.unit_price) || 0),
      ...(note ? { note } : {}),
      batch: status === "sent" ? Math.max(1, batch) : 0,
      status,
      ...(pour ? { pour } : {}),
    });
  }
  return lines.slice(0, MAX_LINES);
}

export function applyCartMutation(
  lines: TableCartLine[],
  mutation: CartMutation,
  newId: () => string,
): TableCartLine[] {
  const next = lines.map((line) => ({ ...line }));

  if (mutation.op === "add") {
    const dishId = mutation.dish_id.trim();
    const name = mutation.name.trim();
    if (!dishId || !name) return next;
    const pour = mutation.pour;
    const draft = next.find(
      (line) =>
        line.status === "draft" &&
        line.dish_id === dishId &&
        (line.pour ?? "") === (pour ?? "") &&
        noteOf(line) === "",
    );
    if (draft) {
      draft.quantity = Math.min(MAX_QTY, draft.quantity + 1);
      return next;
    }
    if (next.length >= MAX_LINES) return next;
    next.push({
      line_id: newId(),
      dish_id: dishId,
      name,
      quantity: 1,
      unit_price: Math.max(0, Number(mutation.unit_price) || 0),
      batch: 0,
      status: "draft",
      ...(pour ? { pour } : {}),
    });
    return next;
  }

  if (mutation.op === "decrease_dish") {
    const dishId = mutation.dish_id.trim();
    const pour = mutation.pour;
    const draft =
      next.find(
        (line) =>
          line.status === "draft" &&
          line.dish_id === dishId &&
          (pour ? line.pour === pour : true) &&
          noteOf(line) === "",
      ) ??
      next.find(
        (line) =>
          line.status === "draft" &&
          line.dish_id === dishId &&
          (pour ? line.pour === pour : true),
      );
    if (!draft) return next;
    if (draft.quantity <= 1) {
      return next.filter((line) => line.line_id !== draft.line_id);
    }
    draft.quantity -= 1;
    return next;
  }

  if (mutation.op === "remove") {
    return next.filter(
      (line) => line.line_id !== mutation.line_id || line.status !== "draft",
    );
  }

  if (mutation.op === "set_qty") {
    const quantity = Math.floor(Number(mutation.quantity) || 0);
    const line = next.find((item) => item.line_id === mutation.line_id);
    if (!line || line.status !== "draft") return next;
    if (quantity < 1) {
      return next.filter((item) => item.line_id !== line.line_id);
    }
    line.quantity = Math.min(MAX_QTY, quantity);
    return next;
  }

  const lineIndex = next.findIndex((item) => item.line_id === mutation.line_id);
  if (lineIndex < 0) return next;
  const line = next[lineIndex];
  if (!line || line.status !== "draft") return next;
  const note = mutation.note.trim().slice(0, 200);
  const twin = next.find(
    (item) =>
      item.line_id !== line.line_id &&
      item.status === "draft" &&
      item.dish_id === line.dish_id &&
      noteOf(item) === note,
  );
  if (twin) {
    twin.quantity = Math.min(MAX_QTY, twin.quantity + line.quantity);
    return next.filter((item) => item.line_id !== line.line_id);
  }
  next[lineIndex] = withNote(line, note);
  return next;
}

export function markDraftsSent(
  lines: TableCartLine[],
  priced: Array<{
    dish_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    note?: string;
  }>,
  batch: number,
): TableCartLine[] {
  const pool = priced.map((item) => ({ ...item, used: false }));
  return lines.map((line) => {
    if (line.status !== "draft") return line;
    const match = pool.find(
      (item) =>
        !item.used &&
        item.dish_id === line.dish_id &&
        (item.note ?? "") === (line.note ?? "") &&
        item.quantity === line.quantity,
    );
    if (!match) return line;
    match.used = true;
    return {
      ...line,
      name: match.name,
      unit_price: match.unit_price,
      status: "sent",
      batch,
    };
  });
}

export function sameCartLines(left: TableCartLine[], right: TableCartLine[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}
