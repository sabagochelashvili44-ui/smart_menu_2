"use server";

import { revalidatePath } from "next/cache";
import {
  loadRestaurantAiPrompts,
  MAX_AI_PROMPTS_PER_RESTAURANT,
  normalizePromptInput,
  seedRestaurantAiPrompts,
  type RestaurantAiPrompt,
} from "@/lib/restaurant-ai-prompts";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireTenantRestaurant } from "@/lib/tenant";

async function requirePromptEditor() {
  const ctx = await requireTenantRestaurant();
  if (!ctx.user || !ctx.restaurant) {
    return {
      ok: false as const,
      error: "Unauthorized.",
      restaurant: null,
    };
  }
  if (
    !ctx.isSuperAdmin &&
    ctx.staffRole !== "owner" &&
    ctx.staffRole !== "manager"
  ) {
    return {
      ok: false as const,
      error: "Forbidden.",
      restaurant: null,
    };
  }
  return {
    ok: true as const,
    error: null as string | null,
    restaurant: ctx.restaurant,
  };
}

function revalidatePromptSurfaces(restaurantId: string) {
  revalidatePath("/admin/settings");
  revalidatePath("/menu", "layout");
  void restaurantId;
}

export async function loadAdminAiPrompts() {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return {
      error: access.error,
      restaurant: null,
      prompts: [] as RestaurantAiPrompt[],
      tableReady: false,
    };
  }
  const loaded = await loadRestaurantAiPrompts(access.restaurant.id);
  return {
    error: null as string | null,
    restaurant: access.restaurant,
    prompts: loaded.prompts,
    tableReady: loaded.tableReady,
  };
}

export async function createAdminAiPrompt(formData: FormData) {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized.", prompt: null };
  }
  const fields = normalizePromptInput({
    label: String(formData.get("label") ?? ""),
    queryText: String(formData.get("query_text") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    isActive: String(formData.get("is_active") ?? "true") !== "false",
  });
  if (!fields.label) return { error: "Label is required.", prompt: null };
  if (!fields.queryText) return { error: "Prompt text is required.", prompt: null };

  const loaded = await loadRestaurantAiPrompts(access.restaurant.id);
  if (!loaded.tableReady) {
    return {
      error: "Run the restaurant_ai_prompts migration in Supabase first.",
      prompt: null,
    };
  }
  if (loaded.prompts.length >= MAX_AI_PROMPTS_PER_RESTAURANT) {
    return {
      error: `You can save at most ${MAX_AI_PROMPTS_PER_RESTAURANT} chips.`,
      prompt: null,
    };
  }

  const nextOrder =
    loaded.prompts.reduce(
      (max, row) => Math.max(max, row.sortOrder),
      -1,
    ) + 1;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("restaurant_ai_prompts")
    .insert({
      restaurant_id: access.restaurant.id,
      label: fields.label,
      query_text: fields.queryText,
      icon: fields.icon,
      is_active: fields.isActive,
      sort_order: nextOrder,
    })
    .select("id, restaurant_id, label, query_text, icon, is_active, sort_order")
    .maybeSingle();
  if (error || !data) {
    return { error: error?.message ?? "Could not save chip.", prompt: null };
  }
  revalidatePromptSurfaces(access.restaurant.id);
  return {
    error: null,
    prompt: {
      id: String((data as { id?: unknown }).id ?? ""),
      restaurantId: access.restaurant.id,
      label: fields.label,
      queryText: fields.queryText,
      icon: fields.icon,
      isActive: fields.isActive,
      sortOrder: nextOrder,
    } satisfies RestaurantAiPrompt,
  };
}

export async function updateAdminAiPrompt(formData: FormData) {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Chip is required." };
  const fields = normalizePromptInput({
    label: String(formData.get("label") ?? ""),
    queryText: String(formData.get("query_text") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    isActive: String(formData.get("is_active") ?? "true") !== "false",
    sortOrder: Number(formData.get("sort_order") ?? 0),
  });
  if (!fields.label) return { error: "Label is required." };
  if (!fields.queryText) return { error: "Prompt text is required." };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("restaurant_ai_prompts")
    .update({
      label: fields.label,
      query_text: fields.queryText,
      icon: fields.icon,
      is_active: fields.isActive,
      sort_order: fields.sortOrder,
    })
    .eq("id", id)
    .eq("restaurant_id", access.restaurant.id);
  if (error) return { error: error.message };
  revalidatePromptSurfaces(access.restaurant.id);
  return { error: null };
}

export async function setAdminAiPromptActive(id: string, isActive: boolean) {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized." };
  }
  const promptId = id.trim();
  if (!promptId) return { error: "Chip is required." };
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("restaurant_ai_prompts")
    .update({ is_active: isActive })
    .eq("id", promptId)
    .eq("restaurant_id", access.restaurant.id);
  if (error) return { error: error.message };
  revalidatePromptSurfaces(access.restaurant.id);
  return { error: null };
}

export async function deleteAdminAiPrompt(id: string) {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized." };
  }
  const promptId = id.trim();
  if (!promptId) return { error: "Chip is required." };
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("restaurant_ai_prompts")
    .delete()
    .eq("id", promptId)
    .eq("restaurant_id", access.restaurant.id);
  if (error) return { error: error.message };
  revalidatePromptSurfaces(access.restaurant.id);
  return { error: null };
}

export async function moveAdminAiPrompt(id: string, direction: "up" | "down") {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized." };
  }
  const loaded = await loadRestaurantAiPrompts(access.restaurant.id);
  const index = loaded.prompts.findIndex((row) => row.id === id);
  if (index < 0) return { error: "Chip not found." };
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= loaded.prompts.length) {
    return { error: null };
  }
  const current = loaded.prompts[index];
  const other = loaded.prompts[swapWith];
  const supabase = createSupabaseAdminClient();
  const first = await supabase
    .from("restaurant_ai_prompts")
    .update({ sort_order: other.sortOrder })
    .eq("id", current.id)
    .eq("restaurant_id", access.restaurant.id);
  if (first.error) return { error: first.error.message };
  const second = await supabase
    .from("restaurant_ai_prompts")
    .update({ sort_order: current.sortOrder })
    .eq("id", other.id)
    .eq("restaurant_id", access.restaurant.id);
  if (second.error) return { error: second.error.message };
  revalidatePromptSurfaces(access.restaurant.id);
  return { error: null };
}

export async function restoreDefaultAdminAiPrompts() {
  const access = await requirePromptEditor();
  if (!access.ok || !access.restaurant) {
    return { error: access.error ?? "Unauthorized." };
  }
  const supabase = createSupabaseAdminClient();
  const { error: deleteError } = await supabase
    .from("restaurant_ai_prompts")
    .delete()
    .eq("restaurant_id", access.restaurant.id);
  if (deleteError) return { error: deleteError.message };
  const seeded = await seedRestaurantAiPrompts(access.restaurant.id);
  if (seeded.error) return { error: seeded.error };
  revalidatePromptSurfaces(access.restaurant.id);
  return { error: null };
}
