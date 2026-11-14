import {
  deleteAdminDish,
  loadAdminMenu,
  saveAdminCategory,
  saveAdminDish,
} from "@/app/admin/actions";
import { parseNutritionInput, parsePrepMinutes } from "@/lib/dish-nutrition";
import type { RecipeInputLine } from "@/lib/dish-recipes";
import { requireTenantApi } from "@/lib/tenant";
import type { Category, Dish } from "@/types/database";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function dishRecipe(dish: unknown): RecipeInputLine[] | undefined {
  if (!dish || typeof dish !== "object" || !("recipe" in dish)) return undefined;
  const recipe = (dish as { recipe?: unknown }).recipe;
  return Array.isArray(recipe) ? (recipe as RecipeInputLine[]) : undefined;
}

export async function GET() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;
  const menu = await loadAdminMenu();
  if (!menu.restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json(menu);
}

export async function POST(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;
  const body = (await request.json().catch(() => null)) as {
    type?: "dish" | "category";
    dish?: Partial<Dish>;
    category?: Partial<Category>;
  } | null;

  if (body?.type === "category" && body.category?.name) {
    const result = await saveAdminCategory({
      id: body.category.id,
      name: body.category.name,
      name_en: body.category.name_en,
      name_ru: body.category.name_ru,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ category: result.category });
  }

  if (body?.type === "dish" && body.dish?.name && body.dish.category_id) {
    const result = await saveAdminDish({
      id: body.dish.id,
      category_id: body.dish.category_id,
      name: body.dish.name,
      description: body.dish.description ?? "",
      price: Number(body.dish.price ?? 0),
      image_url: body.dish.image_url ?? "",
      allergens: body.dish.allergens ?? [],
      ingredients: body.dish.ingredients ?? [],
      is_available: body.dish.is_available ?? true,
      calories: parseNutritionInput(body.dish.calories),
      protein: parseNutritionInput(body.dish.protein),
      carbs: parseNutritionInput(body.dish.carbs),
      fat: parseNutritionInput(body.dish.fat),
      prep_minutes: parsePrepMinutes(body.dish.prep_minutes),
      name_en: body.dish.name_en,
      name_ru: body.dish.name_ru,
      description_en: body.dish.description_en,
      description_ru: body.dish.description_ru,
      recipe: dishRecipe(body.dish),
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ dish: result.dish });
  }

  return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
}

export async function PATCH(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;
  const body = (await request.json().catch(() => null)) as {
    dish?: Dish;
    category?: Category;
  } | null;
  if (body?.dish) {
    const result = await saveAdminDish({
      id: body.dish.id,
      category_id: body.dish.category_id,
      name: body.dish.name,
      description: body.dish.description ?? "",
      price: Number(body.dish.price ?? 0),
      image_url: body.dish.image_url ?? "",
      allergens: body.dish.allergens ?? [],
      ingredients: body.dish.ingredients ?? [],
      is_available: body.dish.is_available ?? true,
      calories: parseNutritionInput(body.dish.calories),
      protein: parseNutritionInput(body.dish.protein),
      carbs: parseNutritionInput(body.dish.carbs),
      fat: parseNutritionInput(body.dish.fat),
      prep_minutes: parsePrepMinutes(body.dish.prep_minutes),
      name_en: body.dish.name_en,
      name_ru: body.dish.name_ru,
      description_en: body.dish.description_en,
      description_ru: body.dish.description_ru,
      recipe: dishRecipe(body.dish),
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ dish: result.dish });
  }
  if (body?.category) {
    const result = await saveAdminCategory({
      id: body.category.id,
      name: body.category.name,
      name_en: body.category.name_en,
      name_ru: body.category.name_ru,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ category: result.category });
  }
  return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;
  const id = new URL(request.url).searchParams.get("dishId");
  if (!id) {
    return NextResponse.json({ error: "dishId required" }, { status: 400 });
  }
  const result = await deleteAdminDish(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
