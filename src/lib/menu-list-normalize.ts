const PARENTHESIZED_GROUP = /\([^()]*\)/g;

/**
 * Joins array fragments that were split inside parentheses, e.g.:
 * ["შავი შოკოლადი (შეიცავს კაკაოს მასას", "შაქარს", "კაკაოს კარაქს)"]
 * -> ["შავი შოკოლადი (შეიცავს კაკაოს მასას, შაქარს, კაკაოს კარაქს)"]
 */
export function repairParenthesizedTokens(items: string[]) {
  const out: string[] = [];
  let buffer = "";
  let depth = 0;

  for (const raw of items) {
    const token = raw.trim().replace(/\.\s*$/, "");
    if (!token) continue;

    if (depth > 0) {
      buffer = `${buffer}, ${token}`;
    } else {
      buffer = token;
    }

    for (const ch of token) {
      if (ch === "(") depth += 1;
      else if (ch === ")" && depth > 0) depth -= 1;
    }

    if (depth === 0) {
      out.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) {
    out.push(buffer.trim());
  }

  return out;
}

export function splitCommaOutsideParens(value: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    if (ch === "," && depth === 0) {
      const cleaned = current.trim().replace(/\.\s*$/, "");
      if (cleaned) parts.push(cleaned);
      current = "";
    } else {
      current += ch;
    }
  }
  const tail = current.trim().replace(/\.\s*$/, "");
  if (tail) parts.push(tail);
  return parts;
}

export function normalizeMenuTextList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const repaired = repairParenthesizedTokens(
      value.map((item) => String(item ?? "")),
    );
    return repaired.length ? repaired : null;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        const repaired = repairParenthesizedTokens(
          parsed.map((item) => String(item ?? "")),
        );
        return repaired.length ? repaired : null;
      }
    } catch {
      /* comma-separated string */
    }
    const split = splitCommaOutsideParens(value);
    return split.length ? split : null;
  }
  return null;
}

export function stripParenthesizedNotes(text: string) {
  return text.replace(PARENTHESIZED_GROUP, "").replace(/\s+/g, " ").trim();
}
