export type DishNutrition = {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

export function parseNutritionInput(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 10) / 10;
}

/** Whole minutes, 1–1440. Empty or zero clears the value. */
export function parsePrepMinutes(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Math.round(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 24 * 60);
}

export function prepDraftValue(value: number | null | undefined) {
  return value == null || value <= 0 ? "" : String(value);
}

export function formatMacro(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function hasDishNutrition(dish: DishNutrition) {
  const calories = parseNutritionInput(dish.calories);
  const protein = parseNutritionInput(dish.protein);
  const carbs = parseNutritionInput(dish.carbs);
  const fat = parseNutritionInput(dish.fat);
  return (
    (calories != null && calories > 0) ||
    (protein != null && protein > 0) ||
    (carbs != null && carbs > 0) ||
    (fat != null && fat > 0)
  );
}

export function nutritionDraftValue(value: number | null | undefined) {
  const parsed = parseNutritionInput(value);
  return parsed == null ? "" : String(parsed);
}

export function nutritionContextLine(dish: DishNutrition) {
  const parts: string[] = [];
  const calories = parseNutritionInput(dish.calories);
  const protein = parseNutritionInput(dish.protein);
  const carbs = parseNutritionInput(dish.carbs);
  const fat = parseNutritionInput(dish.fat);
  if (calories != null) parts.push(`calories ${formatMacro(calories)} kcal`);
  if (protein != null) parts.push(`protein ${formatMacro(protein)}g`);
  if (carbs != null) parts.push(`carbs ${formatMacro(carbs)}g`);
  if (fat != null) parts.push(`fat ${formatMacro(fat)}g`);
  return parts.length ? parts.join(", ") : "not listed";
}

export type GuestNutritionLabels = {
  nutritionEnergy: string;
  nutritionProtein: string;
  nutritionCarbs: string;
  nutritionFat: string;
  nutritionKcal: string;
  nutritionGram: string;
};

export function guestNutritionItems(
  dish: DishNutrition,
  labels: GuestNutritionLabels,
) {
  if (!hasDishNutrition(dish)) return [];
  const calories = parseNutritionInput(dish.calories);
  const protein = parseNutritionInput(dish.protein);
  const carbs = parseNutritionInput(dish.carbs);
  const fat = parseNutritionInput(dish.fat);
  const items: { key: "calories" | "protein" | "carbs" | "fat"; text: string }[] =
    [];
  if (calories != null) {
    items.push({
      key: "calories",
      text: `${labels.nutritionEnergy}: ${formatMacro(calories)} ${labels.nutritionKcal}`,
    });
  }
  if (protein != null) {
    items.push({
      key: "protein",
      text: `${labels.nutritionProtein}: ${formatMacro(protein)} ${labels.nutritionGram}`,
    });
  }
  if (carbs != null) {
    items.push({
      key: "carbs",
      text: `${labels.nutritionCarbs}: ${formatMacro(carbs)} ${labels.nutritionGram}`,
    });
  }
  if (fat != null) {
    items.push({
      key: "fat",
      text: `${labels.nutritionFat}: ${formatMacro(fat)} ${labels.nutritionGram}`,
    });
  }
  return items;
}

export function guestNutritionLine(
  dish: DishNutrition,
  labels: GuestNutritionLabels,
) {
  const items = guestNutritionItems(dish, labels);
  return items.length ? items.map((item) => item.text).join(" | ") : null;
}
