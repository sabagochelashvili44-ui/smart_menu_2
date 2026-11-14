export type WaiterStreamHandlers = {
  onDelta?: (fullText: string) => void;
};

type WaiterStreamState = {
  full: string;
  failed: boolean;
  availableIds?: string[];
};

function asAvailableIds(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.map((id) => String(id).trim()).filter(Boolean);
}

function parseSseEvent(
  part: string,
  state: WaiterStreamState,
  handlers: WaiterStreamHandlers,
) {
  const line = part
    .split("\n")
    .find((row) => row.startsWith("data:"));
  if (!line) return;
  try {
    const json = JSON.parse(line.slice(5).trim()) as {
      text?: string;
      result?: string;
      error?: string;
      done?: boolean;
      availableIds?: unknown;
    };
    if (json.error) {
      state.failed = true;
      return;
    }
    const availableIds = asAvailableIds(json.availableIds);
    if (availableIds !== undefined) {
      state.availableIds = availableIds;
    }
    if (json.text) {
      state.failed = false;
      state.full += json.text;
      handlers.onDelta?.(state.full);
    }
    if (json.result) {
      state.failed = false;
      state.full = json.result;
      handlers.onDelta?.(state.full);
    }
  } catch {
    // Ignore malformed partial frame
  }
}

export async function readAiWaiterReply(
  res: Response,
  handlers: WaiterStreamHandlers = {},
) {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state: WaiterStreamState = { full: "", failed: false };
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        parseSseEvent(part, state, handlers);
      }
    }
    if (buffer.trim()) {
      for (const part of buffer.split("\n\n")) {
        parseSseEvent(part, state, handlers);
      }
    }
    const result = state.full.trim();
    return {
      ok: Boolean(result) && !state.failed && res.ok,
      result,
      availableIds: state.availableIds,
    };
  }

  const json = (await res.json().catch(() => null)) as {
    result?: string;
    message?: string;
    error?: string;
    availableIds?: unknown;
  } | null;
  const result = json?.result?.trim() || json?.message?.trim() || "";
  if (!res.ok || json?.error || !result) {
    return { ok: false, result: "", availableIds: asAvailableIds(json?.availableIds) };
  }
  handlers.onDelta?.(result);
  return {
    ok: true,
    result,
    availableIds: asAvailableIds(json?.availableIds),
  };
}
