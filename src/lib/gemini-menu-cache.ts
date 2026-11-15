import "server-only";

import { GoogleGenAI } from "@google/genai";
export {
  CHEF_SLOW_RESPONSE_MS,
  hashChefMenuCache,
} from "@/lib/chef-menu-cache-hash";

/** Safety-net TTL (30m). Menu edits must invalidate immediately and not wait for this. */
export const GEMINI_MENU_CACHE_TTL_SECONDS = 1_800;

/**
 * Skip explicit remote cache when the static block is too small to pay off.
 * Gemini requires min_total_token_count=1024 (~3.5k+ chars for mixed KA/EN).
 */
export const GEMINI_MENU_CACHE_MIN_CHARS = 4_000;

export function shouldCreateGeminiMenuCache(systemInstruction: string) {
  return String(systemInstruction ?? "").trim().length >= GEMINI_MENU_CACHE_MIN_CHARS;
}

type MenuCacheEntry = {
  name: string;
  hash: string;
  expiresAt: number;
  restaurantId: string;
  locale: string;
  model: string;
};

const memory = new Map<string, MenuCacheEntry>();

/** Skip remote cache creates after FreeTier/exhaustion until this timestamp. */
let cachesDisabledUntil = 0;

function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    ""
  );
}

function cacheCreateBlocked() {
  return Date.now() < cachesDisabledUntil;
}

function disableRemoteCacheCreates(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "");
  if (
    /FreeTier|TotalCachedContentStorageTokens|limit=0|RESOURCE_EXHAUSTED|Cached content is too small|min_total_token_count/i.test(
      message,
    )
  ) {
    // Paid keys can still report FreeTier for caches; stop hammering for 6h.
    // "too small" also stops retries until prompt shape grows (avoids 400 spam).
    cachesDisabledUntil = Date.now() + 6 * 60 * 60 * 1000;
    console.warn(
      "[gemini-menu-cache] remote cache disabled for 6h after quota/exhaustion",
    );
    return true;
  }
  return false;
}

function memoryKey(restaurantId: string, locale: string, model: string) {
  return `${restaurantId}::${locale}::${model}`;
}

function stillFresh(entry: MenuCacheEntry, hash: string) {
  return entry.hash === hash && entry.expiresAt > Date.now() + 15_000;
}

async function deleteRemoteCache(name: string) {
  const apiKey = geminiApiKey();
  if (!apiKey || !name) return;
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.caches.delete({ name });
  } catch (error) {
    console.error("[gemini-menu-cache] delete failed", error);
  }
}

export function invalidateGeminiMenuCache(restaurantId: string) {
  const id = restaurantId.trim();
  if (!id) return;
  const doomed: MenuCacheEntry[] = [];
  for (const [key, entry] of memory) {
    if (entry.restaurantId !== id) continue;
    memory.delete(key);
    doomed.push(entry);
  }
  for (const entry of doomed) {
    void deleteRemoteCache(entry.name);
  }
}

/** Non-blocking lookup — never creates a remote cache (avoids first-turn lag). */
export function peekGeminiMenuCache(input: {
  restaurantId: string;
  locale: string;
  model: string;
  hash: string;
}): string | null {
  const restaurantId = input.restaurantId.trim();
  const locale = input.locale.trim() || "ka";
  const model = input.model.trim();
  const hash = input.hash.trim();
  if (!restaurantId || !model || !hash) return null;
  const existing = memory.get(memoryKey(restaurantId, locale, model));
  if (!existing || !stillFresh(existing, hash)) return null;
  return existing.name;
}

export async function getOrCreateGeminiMenuCache(input: {
  restaurantId: string;
  locale: string;
  model: string;
  hash: string;
  systemInstruction: string;
}): Promise<string | null> {
  const restaurantId = input.restaurantId.trim();
  const locale = input.locale.trim() || "ka";
  const model = input.model.trim();
  const hash = input.hash.trim();
  if (!restaurantId || !model || !hash || !input.systemInstruction.trim()) {
    return null;
  }

  const key = memoryKey(restaurantId, locale, model);
  const existing = memory.get(key);
  if (existing && stillFresh(existing, hash)) {
    return existing.name;
  }
  if (existing) {
    memory.delete(key);
    void deleteRemoteCache(existing.name);
  }

  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  if (cacheCreateBlocked()) return null;
  if (!shouldCreateGeminiMenuCache(input.systemInstruction)) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const created = await ai.caches.create({
      model,
      config: {
        displayName:
          `chef-${restaurantId.slice(0, 8)}-${locale}-${hash.slice(0, 10)}`.slice(
            0,
            128,
          ),
        systemInstruction: input.systemInstruction,
        ttl: `${GEMINI_MENU_CACHE_TTL_SECONDS}s`,
      },
    });
    const name = created.name?.trim();
    if (!name) return null;
    const expireMs = created.expireTime
      ? Date.parse(created.expireTime)
      : Date.now() + GEMINI_MENU_CACHE_TTL_SECONDS * 1000;
    memory.set(key, {
      name,
      hash,
      expiresAt: Number.isFinite(expireMs)
        ? expireMs
        : Date.now() + GEMINI_MENU_CACHE_TTL_SECONDS * 1000,
      restaurantId,
      locale,
      model,
    });
    return name;
  } catch (error) {
    if (!disableRemoteCacheCreates(error)) {
      console.error("[gemini-menu-cache] create failed", error);
    }
    return null;
  }
}

/** Warm cache for the next turn without delaying the current reply. */
export function warmGeminiMenuCache(input: {
  restaurantId: string;
  locale: string;
  model: string;
  hash: string;
  systemInstruction: string;
}) {
  if (cacheCreateBlocked()) return;
  if (!shouldCreateGeminiMenuCache(input.systemInstruction)) return;
  if (peekGeminiMenuCache(input)) return;
  void getOrCreateGeminiMenuCache(input).catch(() => {});
}

/** Dev/QA: seed an in-memory cache entry without calling Gemini. */
export function seedGeminiMenuCacheForTests(input: {
  restaurantId: string;
  locale: string;
  model: string;
  hash: string;
  name?: string;
  ttlMs?: number;
}) {
  const restaurantId = input.restaurantId.trim();
  const locale = input.locale.trim() || "ka";
  const model = input.model.trim();
  const hash = input.hash.trim();
  if (!restaurantId || !model || !hash) return;
  memory.set(memoryKey(restaurantId, locale, model), {
    name: input.name?.trim() || `test-caches/${restaurantId}-${hash.slice(0, 8)}`,
    hash,
    expiresAt: Date.now() + Math.max(60_000, input.ttlMs ?? 3_600_000),
    restaurantId,
    locale,
    model,
  });
}

/** Dev/QA: inspect whether a hash is currently peeksable. */
export function debugGeminiMenuCacheState(input: {
  restaurantId: string;
  locale: string;
  model: string;
  hash: string;
}) {
  return {
    size: memory.size,
    peek: peekGeminiMenuCache(input),
  };
}
