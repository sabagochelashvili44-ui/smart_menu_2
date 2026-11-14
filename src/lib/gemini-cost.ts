/** Official Gemini paid-tier USD prices per 1,000,000 tokens. */
export const GEMINI_TOKENS_PER_MILLION = 1_000_000;

export type GeminiRate = {
  input: number;
  output: number;
};

/** Explicit context-cache input is billed at 10% of the model's input rate. */
export const GEMINI_CACHED_INPUT_MULTIPLIER = 0.1;

/**
 * Paid-tier list prices from https://ai.google.dev/gemini-api/docs/pricing
 * Flash 3.6 / 3.8 keep intro rates through 2026-12-31, then standard rates.
 */
export const GEMINI_FLASH_INTRO_ENDS_AT = Date.UTC(2027, 0, 1);

export const GEMINI_INPUT_PRICE_PER_1M = {
  "gemini-3.8-flash": 0.75,
  "gemini-3.6-flash": 0.75,
  "gemini-3.5-flash-lite": 0.3,
  "gemini-2.5-flash": 0.3,
  "gemini-2.5-flash-lite": 0.1,
  "gemini-2.0-flash": 0.1,
  "gemini-2.0-flash-lite": 0.075,
  "gemini-flash-latest": 0.75,
} as const;

export const GEMINI_OUTPUT_PRICE_PER_1M = {
  "gemini-3.8-flash": 3.75,
  "gemini-3.6-flash": 3.75,
  "gemini-3.5-flash-lite": 2.5,
  "gemini-2.5-flash": 2.5,
  "gemini-2.5-flash-lite": 0.4,
  "gemini-2.0-flash": 0.4,
  "gemini-2.0-flash-lite": 0.3,
  "gemini-flash-latest": 3.75,
} as const;

const FLASH_STANDARD: GeminiRate = { input: 1.5, output: 7.5 };
const FLASH_INTRO: GeminiRate = { input: 0.75, output: 3.75 };
const LITE_FALLBACK: GeminiRate = { input: 0.3, output: 2.5 };

export type GeminiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
};

export type DailyGeminiBurn = {
  date: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

export type GeminiMonthlyProjection = {
  daysObserved: number;
  averageDailyCostUsd: number;
  peakDailyCostUsd: number;
  monthlyProjectedUsd: number;
  heavyLoadMonthlyUsd: number;
};

const EMPTY_PROJECTION: GeminiMonthlyProjection = {
  daysObserved: 0,
  averageDailyCostUsd: 0,
  peakDailyCostUsd: 0,
  monthlyProjectedUsd: 0,
  heavyLoadMonthlyUsd: 0,
};

function normalizeModelId(model: string) {
  return model
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/@\d+$/, "");
}

function flashIntroActive(atMs = Date.now()) {
  return atMs < GEMINI_FLASH_INTRO_ENDS_AT;
}

export function geminiRatesFor(model: string, atMs = Date.now()): GeminiRate {
  const key = normalizeModelId(model);
  if (key.includes("3.8-flash") || key.includes("3.6-flash") || key === "gemini-flash-latest") {
    return flashIntroActive(atMs) ? FLASH_INTRO : FLASH_STANDARD;
  }
  if (key.includes("3.5-flash-lite")) {
    return {
      input: GEMINI_INPUT_PRICE_PER_1M["gemini-3.5-flash-lite"],
      output: GEMINI_OUTPUT_PRICE_PER_1M["gemini-3.5-flash-lite"],
    };
  }
  if (key.includes("2.5-flash-lite")) {
    return {
      input: GEMINI_INPUT_PRICE_PER_1M["gemini-2.5-flash-lite"],
      output: GEMINI_OUTPUT_PRICE_PER_1M["gemini-2.5-flash-lite"],
    };
  }
  if (key.includes("2.5-flash")) {
    return {
      input: GEMINI_INPUT_PRICE_PER_1M["gemini-2.5-flash"],
      output: GEMINI_OUTPUT_PRICE_PER_1M["gemini-2.5-flash"],
    };
  }
  if (key.includes("2.0-flash-lite")) {
    return {
      input: GEMINI_INPUT_PRICE_PER_1M["gemini-2.0-flash-lite"],
      output: GEMINI_OUTPUT_PRICE_PER_1M["gemini-2.0-flash-lite"],
    };
  }
  if (key.includes("2.0-flash")) {
    return {
      input: GEMINI_INPUT_PRICE_PER_1M["gemini-2.0-flash"],
      output: GEMINI_OUTPUT_PRICE_PER_1M["gemini-2.0-flash"],
    };
  }
  if (key.includes("flash-lite")) return LITE_FALLBACK;
  if (key.includes("flash")) {
    return flashIntroActive(atMs) ? FLASH_INTRO : FLASH_STANDARD;
  }
  return LITE_FALLBACK;
}

export function geminiCachedInputRate(model: string, atMs = Date.now()) {
  return geminiRatesFor(model, atMs).input * GEMINI_CACHED_INPUT_MULTIPLIER;
}

/**
 * cost = ((prompt - cached) / 1e6) * INPUT
 *      + (cached / 1e6) * INPUT * 0.1
 *      + (completion / 1e6) * OUTPUT
 */
export function estimateGeminiCostUsd(
  model: string,
  usage: GeminiTokenUsage,
  atMs = Date.now(),
) {
  const rates = geminiRatesFor(model, atMs);
  const prompt = Math.max(0, Number(usage.promptTokens) || 0);
  const completion = Math.max(0, Number(usage.completionTokens) || 0);
  const cached = Math.min(prompt, Math.max(0, Number(usage.cachedTokens) || 0));
  const uncached = prompt - cached;
  return (
    (uncached / GEMINI_TOKENS_PER_MILLION) * rates.input +
    (cached / GEMINI_TOKENS_PER_MILLION) * rates.input * GEMINI_CACHED_INPUT_MULTIPLIER +
    (completion / GEMINI_TOKENS_PER_MILLION) * rates.output
  );
}

export function roundUsd(value: number, digits = 6) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tbilisiDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function calendarDayCount(fromKey: string, toKey: string) {
  if (!fromKey || !toKey || fromKey > toKey) return 1;
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  const start = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const end = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function dailyGeminiBurnFromRows(
  rows: {
    created_at?: string | null;
    model?: string | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    cached_tokens?: number | null;
    estimated_cost_usd?: number | null;
    cost_usd?: number | null;
  }[],
) {
  const byDate = new Map<string, DailyGeminiBurn>();
  for (const row of rows) {
    const date = tbilisiDateKey(row.created_at ?? "");
    if (!date) continue;
    const prompt = Math.max(0, Number(row.prompt_tokens) || 0);
    const completion = Math.max(0, Number(row.completion_tokens) || 0);
    const cached = Math.max(0, Number(row.cached_tokens) || 0);
    const priced = estimateGeminiCostUsd(String(row.model ?? ""), {
      promptTokens: prompt,
      completionTokens: completion,
      cachedTokens: cached,
    });
    const stored = Number(row.estimated_cost_usd ?? row.cost_usd);
    const cost = prompt || completion ? priced : Number.isFinite(stored) ? stored : 0;
    const prev = byDate.get(date) ?? {
      date,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    prev.promptTokens += prompt;
    prev.completionTokens += completion;
    prev.costUsd += cost;
    byDate.set(date, prev);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Heavy-load monthly projection: average daily burn across the observed
 * Tbilisi calendar span × 30, plus peak-day × 30 for a full-load month.
 */
export function projectMonthlyGeminiCost(
  days: DailyGeminiBurn[],
  options?: { monthDays?: number; today?: string },
): GeminiMonthlyProjection {
  const monthDays = options?.monthDays ?? 30;
  if (!days.length) return { ...EMPTY_PROJECTION };
  const today = options?.today ?? tbilisiDateKey(new Date());
  const first = days[0]?.date ?? today;
  const last = days[days.length - 1]?.date ?? today;
  const windowEnd = today >= last ? today : last;
  const daysObserved = calendarDayCount(first, windowEnd);
  const totalCost = days.reduce((sum, day) => sum + day.costUsd, 0);
  const peakDailyCostUsd = days.reduce(
    (peak, day) => Math.max(peak, day.costUsd),
    0,
  );
  const averageDailyCostUsd = totalCost / daysObserved;
  return {
    daysObserved,
    averageDailyCostUsd: roundUsd(averageDailyCostUsd),
    peakDailyCostUsd: roundUsd(peakDailyCostUsd),
    monthlyProjectedUsd: roundUsd(averageDailyCostUsd * monthDays),
    heavyLoadMonthlyUsd: roundUsd(peakDailyCostUsd * monthDays),
  };
}

export function projectMonthlyGeminiCostFromRows(
  rows: Parameters<typeof dailyGeminiBurnFromRows>[0],
  options?: { monthDays?: number; today?: string },
) {
  return projectMonthlyGeminiCost(dailyGeminiBurnFromRows(rows), options);
}

export function tbilisiToday() {
  return tbilisiDateKey(new Date());
}
