import { GoogleGenAI } from "@google/genai";
import { recordGeminiUsage } from "@/lib/ai-usage";
import {
  readMenuTranslateCache,
  writeMenuTranslateCache,
} from "@/lib/menu-translate-cache";
import { rateLimitPublicApi } from "@/lib/public-api-guard";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Target = "en" | "ru";

function parseTarget(value: unknown): Target | null {
  return value === "en" || value === "ru" ? value : null;
}

function translationBag(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  if (root.translations && typeof root.translations === "object") {
    return root.translations;
  }
  return parsed;
}

function translationsFromRows(bag: unknown) {
  const translations: Record<string, string> = {};
  if (!Array.isArray(bag)) return translations;
  for (const row of bag) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const source = String(
      item.original ?? item.source ?? item.from ?? item.key ?? "",
    ).trim();
    const target = String(
      item.translation ?? item.translated ?? item.target ?? item.to ?? item.value ?? "",
    ).trim();
    if (source && target) translations[source] = target;
  }
  return translations;
}

function translationsFromMap(bag: unknown, texts: string[]) {
  const translations: Record<string, string> = {};
  if (!bag || typeof bag !== "object") return translations;
  const record = bag as Record<string, unknown>;
  for (const text of texts) {
    const value = record[text];
    if (typeof value === "string" && value.trim()) {
      translations[text] = value.trim();
    }
  }
  return translations;
}

function extractTranslations(
  parsed: unknown,
  texts: string[],
): Record<string, string> {
  const bag = translationBag(parsed);
  if (!bag) return {};
  if (Array.isArray(bag)) return translationsFromRows(bag);
  return translationsFromMap(bag, texts);
}

async function translateChunk(
  geminiKey: string,
  target: Target,
  texts: string[],
  restaurantId?: string,
) {
  const language = target === "ru" ? "Russian" : "English";
  const systemPrompt = `You are an expert fine-dining culinary translator specializing in Georgian gastronomy.
Translate each input string into natural, grammatically impeccable ${language}.
Rules:
1. Preserve authentic Georgian culinary terms (khachapuri, khinkali, sulguni, nadughi, tkemali, adjika, qvevri, ketsi, mtsvadi, chashushuli, shkmeruli, kharcho, chakapuli, ojakhuri, mchadi, shoti, churchkhela) while translating their descriptors and ingredients into idiomatic ${language}.
2. Never produce literal word-by-word calques or awkward syntax. Use refined restaurant menu phrasing.
3. For Russian, ensure proper grammatical gender, case agreement, and capitalization (e.g. «Фирменный хачапури „Царский"», «Хинкали „Калакури" (10 шт.)»).
4. For English, use natural culinary terminology (e.g. "slow-braised veal", "clarified butter", "oven-roasted pumpkin cream soup").
5. Return ONLY valid JSON: {"translations":{"<exact original>":"<${language} text>"}}. Translate every input string completely and never leave Georgian letters (მხედრული) in the output.`;

  if (geminiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const models = [
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
    ];
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: JSON.stringify({ texts }),
            config: {
              systemInstruction: systemPrompt,
              temperature: 0,
              responseMimeType: "application/json",
            },
          });
          const raw = res.text?.trim() ?? "{}";
          const translations = extractTranslations(JSON.parse(raw), texts);
          if (Object.keys(translations).length > 0) {
            await recordGeminiUsage({
              restaurantId,
              feature: "translate",
              model,
              response: res,
            });
            return {
              translations,
              error: null as string | null,
            };
          }
          break;
        } catch (error) {
          console.error("[menu-translate] Gemini request failed", error);
          const message =
            error instanceof Error ? error.message : String(error ?? "");
          const retryable = /503|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|429/i.test(
            message,
          );
          if (!retryable || attempt === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }
  }

  return {
    translations: {} as Record<string, string>,
    error: "Translation service unavailable",
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    target?: unknown;
    texts?: unknown;
    restaurantId?: unknown;
  } | null;

  const restaurantId =
    typeof body?.restaurantId === "string" ? body.restaurantId.trim() : "";
  const limited = rateLimitPublicApi(request, "menu-translate", restaurantId, 8);
  if (!limited.ok) return limited.response;

  const target = parseTarget(body?.target);
  const texts = Array.isArray(body?.texts)
    ? [
        ...new Set(
          body.texts
            .map((item) =>
              typeof item === "string" ? item.trim().slice(0, 500) : "",
            )
            .filter(Boolean),
        ),
      ].slice(0, 300)
    : [];

  if (!target || texts.length === 0) {
    return NextResponse.json({
      translations: {},
      error: "target (en|ru) and texts[] are required",
    });
  }

  const translations: Record<string, string> = {};
  let missing = texts;

  if (restaurantId) {
    const cached = await readMenuTranslateCache({
      restaurantId,
      locale: target,
      texts,
    });
    Object.assign(translations, cached.found);
    missing = cached.missing;
  }

  if (!missing.length) {
    return NextResponse.json({ translations, error: null });
  }

  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";
  if (!geminiKey) {
    console.error("[menu-translate] GEMINI_API_KEY is missing");
    return NextResponse.json({
      translations,
      error:
        Object.keys(translations).length === 0
          ? "Translation API key is missing"
          : null,
    });
  }

  const chunkSize = 40;
  let lastError: string | null = null;
  const newlyTranslated: Record<string, string> = {};

  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const result = await translateChunk(
      geminiKey,
      target,
      chunk,
      restaurantId || undefined,
    );
    Object.assign(translations, result.translations);
    Object.assign(newlyTranslated, result.translations);
    if (result.error) lastError = result.error;
  }

  if (restaurantId && Object.keys(newlyTranslated).length > 0) {
    void writeMenuTranslateCache({
      restaurantId,
      locale: target,
      translations: newlyTranslated,
    });
  }

  return NextResponse.json({
    translations,
    error: Object.keys(translations).length === 0 ? lastError : null,
  });
}
