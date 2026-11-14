import "server-only";

import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

type MemoryEntry = {
  translations: Record<string, string>;
  expiresAt: number;
};

const memory = new Map<string, MemoryEntry>();

function phraseHash(text: string) {
  return createHash("sha256").update(text.trim()).digest("hex");
}

function memoryKey(restaurantId: string, locale: "en" | "ru", hash: string) {
  return `${restaurantId}::${locale}::${hash}`;
}

export function invalidateMenuTranslateCache(restaurantId: string) {
  const id = restaurantId.trim();
  if (!id) return;
  for (const key of memory.keys()) {
    if (key.startsWith(`${id}::`)) memory.delete(key);
  }
  void clearPersistedTranslateCache(id);
}

async function clearPersistedTranslateCache(restaurantId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const cleared = await supabase
      .from("menu_translate_cache")
      .delete()
      .eq("restaurant_id", restaurantId);
    if (cleared.error && !/menu_translate_cache|does not exist|schema cache/i.test(cleared.error.message)) {
      console.error("[menu-translate-cache] clear failed", cleared.error.message);
    }
  } catch (error) {
    console.error("[menu-translate-cache] clear failed", error);
  }
}

export async function readMenuTranslateCache(input: {
  restaurantId: string;
  locale: "en" | "ru";
  texts: string[];
}) {
  const restaurantId = input.restaurantId.trim();
  const found: Record<string, string> = {};
  const missing: string[] = [];
  if (!restaurantId || !input.texts.length) {
    return { found, missing: [...input.texts] };
  }

  const now = Date.now();
  const pendingDb: string[] = [];

  for (const text of input.texts) {
    const hash = phraseHash(text);
    const key = memoryKey(restaurantId, input.locale, hash);
    const cached = memory.get(key);
    if (cached && cached.expiresAt > now) {
      const value = cached.translations[text];
      if (value?.trim()) {
        found[text] = value.trim();
        continue;
      }
    }
    pendingDb.push(text);
  }

  if (!pendingDb.length) return { found, missing };

  try {
    const hashes = pendingDb.map(phraseHash);
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("menu_translate_cache")
      .select("source_text, translated_text, phrase_hash")
      .eq("restaurant_id", restaurantId)
      .eq("locale", input.locale)
      .in("phrase_hash", hashes);

    if (error) {
      if (!/menu_translate_cache|does not exist|schema cache/i.test(error.message)) {
        console.error("[menu-translate-cache] read failed", error.message);
      }
      return { found, missing: pendingDb };
    }

    const byHash = new Map<string, string>();
    for (const row of data ?? []) {
      const hash = String((row as { phrase_hash?: unknown }).phrase_hash ?? "");
      const translated = String(
        (row as { translated_text?: unknown }).translated_text ?? "",
      ).trim();
      if (hash && translated) byHash.set(hash, translated);
    }

    for (const text of pendingDb) {
      const hash = phraseHash(text);
      const translated = byHash.get(hash);
      if (translated) {
        found[text] = translated;
        memory.set(memoryKey(restaurantId, input.locale, hash), {
          translations: { [text]: translated },
          expiresAt: now + MEMORY_TTL_MS,
        });
      } else {
        missing.push(text);
      }
    }
  } catch (error) {
    console.error("[menu-translate-cache] read failed", error);
    return { found, missing: pendingDb };
  }

  return { found, missing };
}

export async function writeMenuTranslateCache(input: {
  restaurantId: string;
  locale: "en" | "ru";
  translations: Record<string, string>;
}) {
  const restaurantId = input.restaurantId.trim();
  const entries = Object.entries(input.translations).filter(
    ([source, translated]) => source.trim() && translated.trim(),
  );
  if (!restaurantId || !entries.length) return;

  const now = Date.now();
  const rows = entries.map(([source_text, translated_text]) => {
    const phrase_hash = phraseHash(source_text);
    memory.set(memoryKey(restaurantId, input.locale, phrase_hash), {
      translations: { [source_text]: translated_text.trim() },
      expiresAt: now + MEMORY_TTL_MS,
    });
    return {
      restaurant_id: restaurantId,
      locale: input.locale,
      phrase_hash,
      source_text,
      translated_text: translated_text.trim(),
      updated_at: new Date().toISOString(),
    };
  });

  try {
    const supabase = createSupabaseAdminClient();
    const upserted = await supabase.from("menu_translate_cache").upsert(rows, {
      onConflict: "restaurant_id,locale,phrase_hash",
    });
    if (
      upserted.error &&
      !/menu_translate_cache|does not exist|schema cache/i.test(
        upserted.error.message,
      )
    ) {
      console.error("[menu-translate-cache] write failed", upserted.error.message);
    }
  } catch (error) {
    console.error("[menu-translate-cache] write failed", error);
  }
}
