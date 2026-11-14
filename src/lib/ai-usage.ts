import "server-only";

import {
  estimateGeminiCostUsd,
  roundUsd,
} from "@/lib/gemini-cost";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type AiUsageFeature =
  | "chat"
  | "rewrite"
  | "digest"
  | "analytics"
  | "translate";

export type AiUsageProvider = "gemini";

export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
};

function asNonNegInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function normalizeModelId(model: string) {
  return model
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/@\d+$/, "");
}

function normalizeUsage(
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  cachedTokens = 0,
): AiTokenUsage {
  const prompt = asNonNegInt(promptTokens);
  const completion = asNonNegInt(completionTokens);
  const cached = Math.min(prompt, asNonNegInt(cachedTokens));
  const total = asNonNegInt(totalTokens) || prompt + completion;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cachedTokens: cached,
  };
}

function readUsageBag(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const nested =
    root.usageMetadata ??
    root.usage_metadata ??
    root.usage ??
    (root.response && typeof root.response === "object"
      ? (root.response as Record<string, unknown>).usageMetadata
      : null);
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  if (
    "promptTokenCount" in root ||
    "candidatesTokenCount" in root ||
    "totalTokenCount" in root
  ) {
    return root;
  }
  return null;
}

export function usageFromGemini(response: unknown): AiTokenUsage | null {
  const meta = readUsageBag(response);
  if (!meta) return null;
  const prompt = asNonNegInt(
    meta.promptTokenCount ??
      meta.prompt_token_count ??
      meta.inputTokenCount ??
      meta.input_tokens,
  );
  const completion = asNonNegInt(
    meta.candidatesTokenCount ??
      meta.candidates_token_count ??
      meta.outputTokenCount ??
      meta.output_tokens,
  );
  const thoughts = asNonNegInt(
    meta.thoughtsTokenCount ?? meta.thoughts_token_count,
  );
  const cached = asNonNegInt(
    meta.cachedContentTokenCount ?? meta.cached_content_token_count,
  );
  const total = asNonNegInt(
    meta.totalTokenCount ??
      meta.total_token_count ??
      prompt + completion + thoughts,
  );
  if (!prompt && !completion && !thoughts && !total) return null;
  return normalizeUsage(prompt, completion + thoughts, total, cached);
}

export function usageFromGeminiChunks(chunks: unknown[]): AiTokenUsage | null {
  let best: AiTokenUsage | null = null;
  for (const chunk of chunks) {
    const usage = usageFromGemini(chunk);
    if (!usage) continue;
    if (!best || usage.totalTokens >= best.totalTokens) best = usage;
  }
  return best;
}

export function estimateCostUsd(model: string, usage: AiTokenUsage) {
  return roundUsd(
    estimateGeminiCostUsd(model, {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
    }),
  );
}

export async function recordAiUsage(input: {
  restaurantId?: string | null;
  feature: AiUsageFeature;
  provider?: AiUsageProvider;
  model: string;
  usage?: AiTokenUsage | null;
}) {
  await persistAiUsage(input);
}

export async function recordGeminiUsage(input: {
  restaurantId?: string | null;
  feature: AiUsageFeature;
  model: string;
  response: unknown;
}) {
  await recordAiUsage({
    restaurantId: input.restaurantId,
    feature: input.feature,
    provider: "gemini",
    model: input.model,
    usage: usageFromGemini(input.response),
  });
}

export async function resetRestaurantAiUsage(restaurantId: string) {
  const id = restaurantId.trim();
  if (!id) return { error: "Restaurant is required." };
  try {
    const supabase = createSupabaseAdminClient();
    const archived = await supabase
      .from("restaurant_ai_usage")
      .update({ archived_at: new Date().toISOString() })
      .eq("restaurant_id", id)
      .is("archived_at", null);
    if (archived.error && /archived_at/i.test(archived.error.message)) {
      const cleared = await supabase
        .from("restaurant_ai_usage")
        .delete()
        .eq("restaurant_id", id);
      if (cleared.error) return { error: cleared.error.message };
      return { error: null };
    }
    if (archived.error) return { error: archived.error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Reset failed.",
    };
  }
}

async function persistAiUsage(input: {
  restaurantId?: string | null;
  feature: AiUsageFeature;
  provider?: AiUsageProvider;
  model: string;
  usage?: AiTokenUsage | null;
}) {
  const restaurantId = input.restaurantId?.trim();
  if (!restaurantId) return;
  const usage = input.usage;
  if (!usage || (!usage.promptTokens && !usage.completionTokens && !usage.totalTokens)) {
    console.error("[ai-usage] missing token counts", {
      restaurantId,
      feature: input.feature,
      model: input.model,
    });
    return;
  }
  const model = normalizeModelId(input.model) || "unknown";
  const costUsd = estimateCostUsd(model, usage);
  const row = {
    restaurant_id: restaurantId,
    feature: input.feature,
    provider: "gemini" as const,
    model,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    cached_tokens: usage.cachedTokens ?? 0,
    cost_usd: costUsd,
    estimated_cost_usd: costUsd,
  };
  try {
    const supabase = createSupabaseAdminClient();
    const inserted = await supabase.from("restaurant_ai_usage").insert(row);
    if (inserted.error && /cached_tokens/i.test(inserted.error.message)) {
      const { cached_tokens: _cached, ...withoutCached } = row;
      const retry = await supabase.from("restaurant_ai_usage").insert(withoutCached);
      if (
        retry.error &&
        /estimated_cost_usd/i.test(retry.error.message)
      ) {
        const { estimated_cost_usd: _ignored, ...legacy } = withoutCached;
        const oldest = await supabase.from("restaurant_ai_usage").insert(legacy);
        if (oldest.error) {
          console.error("[ai-usage] insert failed", oldest.error.message);
        }
        return;
      }
      if (retry.error) {
        console.error("[ai-usage] insert failed", retry.error.message);
      }
      return;
    }
    if (
      inserted.error &&
      /estimated_cost_usd/i.test(inserted.error.message)
    ) {
      const { estimated_cost_usd: _ignored, ...legacy } = row;
      const retry = await supabase.from("restaurant_ai_usage").insert(legacy);
      if (retry.error) {
        console.error("[ai-usage] insert failed", retry.error.message);
      }
      return;
    }
    if (inserted.error) {
      console.error("[ai-usage] insert failed", inserted.error.message);
    }
  } catch (error) {
    console.error("[ai-usage] record failed", error);
  }
}
