import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  DEFAULT_AI_PROMPTS,
  type RestaurantAiPrompt,
} from "@/lib/restaurant-ai-prompts-shared";

export {
  AI_PROMPT_ICON_MAX,
  AI_PROMPT_LABEL_MAX,
  AI_PROMPT_QUERY_MAX,
  DEFAULT_AI_PROMPTS,
  MAX_AI_PROMPTS_PER_RESTAURANT,
  normalizePromptInput,
  promptChipLabel,
  type RestaurantAiPrompt,
} from "@/lib/restaurant-ai-prompts-shared";

function isMissingPromptsTable(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("restaurant_ai_prompts") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("permission denied"))
  );
}

function mapPrompt(row: Record<string, unknown>, restaurantId: string): RestaurantAiPrompt {
  return {
    id: String(row.id ?? ""),
    restaurantId: String(row.restaurant_id ?? restaurantId),
    label: String(row.label ?? "").trim(),
    queryText: String(row.query_text ?? "").trim(),
    icon: String(row.icon ?? "").trim(),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) || 0,
  };
}

export async function loadRestaurantAiPrompts(
  restaurantId: string,
  options: { activeOnly?: boolean } = {},
): Promise<{ prompts: RestaurantAiPrompt[]; tableReady: boolean }> {
  if (!restaurantId) return { prompts: [], tableReady: false };
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("restaurant_ai_prompts")
    .select("id, restaurant_id, label, query_text, icon, is_active, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (options.activeOnly) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) {
    if (!isMissingPromptsTable(error)) {
      console.error("[ai-prompts] load failed", error.message);
    }
    return { prompts: [], tableReady: false };
  }
  return {
    prompts: ((data ?? []) as Record<string, unknown>[]).map((row) =>
      mapPrompt(row, restaurantId),
    ),
    tableReady: true,
  };
}

export async function seedRestaurantAiPrompts(restaurantId: string) {
  if (!restaurantId) return { error: "Restaurant is required.", seeded: false };
  const existing = await loadRestaurantAiPrompts(restaurantId);
  if (!existing.tableReady) {
    return { error: null, seeded: false };
  }
  if (existing.prompts.length) {
    return { error: null, seeded: false };
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("restaurant_ai_prompts").insert(
    DEFAULT_AI_PROMPTS.map((prompt) => ({
      restaurant_id: restaurantId,
      label: prompt.label,
      query_text: prompt.queryText,
      icon: prompt.icon,
      is_active: prompt.isActive,
      sort_order: prompt.sortOrder,
    })),
  );
  if (error) {
    if (isMissingPromptsTable(error)) {
      return { error: null, seeded: false };
    }
    console.error("[ai-prompts] seed failed", error.message);
    return { error: error.message, seeded: false };
  }
  return { error: null, seeded: true };
}
