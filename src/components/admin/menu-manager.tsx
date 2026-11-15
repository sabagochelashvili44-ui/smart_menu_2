"use client";

import {
  deleteAdminCategory,
  deleteAdminDish,
  saveAdminCategory,
  saveAdminDish,
  toggleAdminDish,
  uploadMenuDishImage,
} from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  parseNutritionInput,
  nutritionDraftValue,
  parsePrepMinutes,
  prepDraftValue,
} from "@/lib/dish-nutrition";
import { splitCommaOutsideParens } from "@/lib/menu-list-normalize";
import {
  categoryNameFromFields,
  dishDescription,
  dishLabel,
  formatGel,
} from "@/lib/menu-copy";
import { cn } from "@/lib/utils";
import type { AdminIngredient, RecipeUnit } from "@/lib/dish-recipes";
import { RECIPE_UNITS, isRecipeUnit } from "@/lib/dish-recipes";
import type { AdminCategory, AdminDish } from "@/lib/supabaseAdmin";
import {
  canonicalDishPrice,
  isBarCategory,
  parseMoney,
  type MenuLane,
} from "@/lib/menu-lane";
import { ImagePlus, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

type RecipeDraftLine = {
  name: string;
  quantity: string;
  unit: RecipeUnit;
  cost_per_unit: string;
  stock_qty: string;
};

type DishDraft = {
  id?: string;
  category_id: string;
  name: string;
  name_en: string;
  name_ru: string;
  description: string;
  description_en: string;
  description_ru: string;
  price: string;
  bottle_price: string;
  glass_price: string;
  prep_minutes: string;
  image_url: string;
  ingredients: string;
  allergens: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  is_available: boolean;
  pairing_dish_ids: string[];
  recipe: RecipeDraftLine[];
};

function emptyRecipeLine(): RecipeDraftLine {
  return {
    name: "",
    quantity: "",
    unit: "g",
    cost_per_unit: "",
    stock_qty: "",
  };
}

function emptyDraft(categoryId: string): DishDraft {
  return {
    category_id: categoryId,
    name: "",
    name_en: "",
    name_ru: "",
    description: "",
    description_en: "",
    description_ru: "",
    price: "",
    bottle_price: "",
    glass_price: "",
    prep_minutes: "",
    image_url: "",
    ingredients: "",
    allergens: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    is_available: true,
    pairing_dish_ids: [],
    recipe: [],
  };
}

function parseCommaList(value: string) {
  return splitCommaOutsideParens(value);
}

function parseAllergens(value: string) {
  return parseCommaList(value).map((item) => item.toLowerCase());
}

export function MenuManager({
  restaurantId,
  restaurantName,
  categories,
  dishes,
  ingredients = [],
}: {
  restaurantId: string;
  restaurantName: string;
  categories: AdminCategory[];
  dishes: AdminDish[];
  ingredients?: AdminIngredient[];
}) {
  const { locale, t } = useAdminLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AdminDish[]>(dishes);
  const [categoryRows, setCategoryRows] = useState<AdminCategory[]>(categories);
  const [categoryName, setCategoryName] = useState("");
  const [lane, setLane] = useState<MenuLane>("food");
  const [draft, setDraft] = useState<DishDraft>(
    emptyDraft(categories.find((row) => !isBarCategory(row))?.id ?? categories[0]?.id ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pairingSearch, setPairingSearch] = useState("");
  const [pairingCategoryId, setPairingCategoryId] = useState<string>("all");

  useEffect(() => {
    setItems(dishes);
  }, [dishes]);

  useEffect(() => {
    setCategoryRows(categories);
  }, [categories]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const laneCategories = useMemo(
    () =>
      categoryRows.filter((category) => isBarCategory(category) === (lane === "bar")),
    [categoryRows, lane],
  );
  const grouped = useMemo(
    () =>
      laneCategories.map((category) => ({
        category,
        dishes: items.filter((dish) => dish.category_id === category.id),
      })),
    [items, laneCategories],
  );
  const filledGroups = grouped.filter((group) => group.dishes.length > 0);
  const emptyCategories = grouped
    .filter((group) => group.dishes.length === 0)
    .map((group) => group.category);

  const pairingCandidates = useMemo(() => {
    const selfId = draft.id;
    const collator =
      locale === "ru" ? "ru" : locale === "en" ? "en" : "ka";
    return items
      .filter((dish) => dish.id !== selfId)
      .map((dish) => {
        const category = categoryRows.find((row) => row.id === dish.category_id);
        const bar = category ? isBarCategory(category) : false;
        const label = dishLabel(dish.name, locale);
        return {
          dish,
          bar,
          category,
          label,
          searchBlob: [
            label,
            dish.name,
            dish.name_en,
            dish.name_ru,
            category?.name,
            category?.name_en,
            category?.name_ru,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase(collator),
        };
      })
      .sort((a, b) => {
        if (a.bar !== b.bar) return a.bar ? 1 : -1;
        const catA = categoryNameFromFields(a.category ?? { name: "" }, locale);
        const catB = categoryNameFromFields(b.category ?? { name: "" }, locale);
        const byCat = catA.localeCompare(catB, collator);
        if (byCat !== 0) return byCat;
        return a.label.localeCompare(b.label, collator);
      });
  }, [items, categoryRows, draft.id, locale]);

  const pairingCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of pairingCandidates) {
      counts.set(row.dish.category_id, (counts.get(row.dish.category_id) ?? 0) + 1);
    }
    return categoryRows
      .filter((category) => counts.has(category.id))
      .map((category) => ({
        category,
        count: counts.get(category.id) ?? 0,
      }));
  }, [pairingCandidates, categoryRows]);

  const filteredPairings = useMemo(() => {
    const needle = pairingSearch.trim().toLocaleLowerCase(
      locale === "ru" ? "ru" : locale === "en" ? "en" : "ka",
    );
    return pairingCandidates.filter((row) => {
      if (
        pairingCategoryId !== "all" &&
        row.dish.category_id !== pairingCategoryId
      ) {
        return false;
      }
      if (!needle) return true;
      return row.searchBlob.includes(needle);
    });
  }, [pairingCandidates, pairingCategoryId, pairingSearch, locale]);

  const selectedPairings = useMemo(() => {
    const byId = new Map(items.map((dish) => [dish.id, dish]));
    return draft.pairing_dish_ids
      .map((id) => byId.get(id))
      .filter((dish): dish is AdminDish => Boolean(dish));
  }, [draft.pairing_dish_ids, items]);

  function togglePairing(dishId: string) {
    setDraft((current) => {
      const selected = new Set(current.pairing_dish_ids);
      if (selected.has(dishId)) selected.delete(dishId);
      else selected.add(dishId);
      return { ...current, pairing_dish_ids: [...selected] };
    });
  }

  function clearPairings() {
    setDraft((current) => ({ ...current, pairing_dish_ids: [] }));
  }

  function upsertLocal(dish: AdminDish) {
    setItems((current) => {
      if (current.some((row) => row.id === dish.id)) {
        return current.map((row) =>
          row.id === dish.id
            ? { ...row, ...dish, recipe: dish.recipe ?? row.recipe }
            : row,
        );
      }
      return [...current, dish];
    });
  }

  function startEdit(dish: AdminDish) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    const category = categoryRows.find((row) => row.id === dish.category_id);
    const nextLane: MenuLane = category && isBarCategory(category) ? "bar" : "food";
    setLane(nextLane);
    const glass =
      dish.glass_price != null
        ? String(dish.glass_price)
        : nextLane === "bar"
          ? String(dish.price ?? "")
          : "";
    const bottle = dish.bottle_price != null ? String(dish.bottle_price) : "";
    setDraft({
      id: dish.id,
      category_id: dish.category_id,
      name: dish.name,
      name_en: dish.name_en ?? "",
      name_ru: dish.name_ru ?? "",
      description: dish.description ?? "",
      description_en: dish.description_en ?? "",
      description_ru: dish.description_ru ?? "",
      price: String(dish.price ?? ""),
      bottle_price: bottle,
      glass_price: glass,
      prep_minutes: prepDraftValue(dish.prep_minutes),
      image_url: dish.image_url ?? "",
      ingredients: (dish.ingredients ?? []).join(", "),
      allergens: (dish.allergens ?? []).join(", "),
      calories: nutritionDraftValue(dish.calories),
      protein: nutritionDraftValue(dish.protein),
      carbs: nutritionDraftValue(dish.carbs),
      fat: nutritionDraftValue(dish.fat),
      is_available: dish.is_available,
      pairing_dish_ids: [...(dish.pairing_dish_ids ?? [])],
      recipe: (dish.recipe ?? []).map((line) => ({
        name: line.name,
        quantity: String(line.quantity ?? ""),
        unit: isRecipeUnit(line.unit) ? line.unit : "g",
        cost_per_unit: String(line.cost_per_unit ?? ""),
        stock_qty: String(line.stock_qty ?? ""),
      })),
    });
    setPairingSearch("");
    setPairingCategoryId("all");
    setError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearDishImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDraft((current) => ({ ...current, image_url: "" }));
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function onImageSelected(file: File | null) {
    if (!file || uploadingImage) return;
    if (file.type && !file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploadingImage(true);
    setError(null);
    const payload = new FormData();
    payload.set("image", file);
    try {
      const result = await uploadMenuDishImage(payload);
      if (result.error || !result.url) {
        URL.revokeObjectURL(localPreview);
        setPreviewUrl(null);
        setError(result.error ?? t.imageUploadFailed);
        return;
      }
      setDraft((current) => ({ ...current, image_url: result.url! }));
    } catch {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t.imageUploadFailed);
    } finally {
      setUploadingImage(false);
    }
  }

  function switchLane(next: MenuLane) {
    if (next === lane) return;
    startTransition(() => {
      setLane(next);
      const first = categoryRows.find(
        (row) => isBarCategory(row) === (next === "bar"),
      );
      setDraft(emptyDraft(first?.id ?? ""));
      setError(null);
    });
  }

  async function save() {
    if (!draft.name.trim() || !draft.category_id || uploadingImage) return;
    const barItem = lane === "bar";
    const bottlePrice = barItem ? parseMoney(draft.bottle_price) : null;
    const glassPrice = barItem ? parseMoney(draft.glass_price) : null;
    if (barItem && bottlePrice == null && glassPrice == null) {
      setError(t.price);
      return;
    }
    setSaving(true);
    const result = await saveAdminDish({
      id: draft.id,
      category_id: draft.category_id,
      name: draft.name,
      name_en: draft.name_en,
      name_ru: draft.name_ru,
      description: draft.description.trim(),
      description_en: draft.description_en,
      description_ru: draft.description_ru,
      price: barItem
        ? canonicalDishPrice({
            bottle_price: bottlePrice,
            glass_price: glassPrice,
          })
        : Number(draft.price) || 0,
      bottle_price: bottlePrice,
      glass_price: glassPrice,
      prep_minutes: parsePrepMinutes(draft.prep_minutes),
      image_url: draft.image_url,
      ingredients: parseCommaList(draft.ingredients),
      allergens: parseAllergens(draft.allergens),
      calories: parseNutritionInput(draft.calories),
      protein: parseNutritionInput(draft.protein),
      carbs: parseNutritionInput(draft.carbs),
      fat: parseNutritionInput(draft.fat),
      is_available: draft.is_available,
      pairing_dish_ids: draft.pairing_dish_ids,
      recipe: draft.recipe.map((line) => ({
        name: line.name,
        unit: line.unit,
        quantity: Number(line.quantity) || 0,
        cost_per_unit:
          line.cost_per_unit.trim() === "" ? null : Number(line.cost_per_unit),
        stock_qty: line.stock_qty.trim() === "" ? null : Number(line.stock_qty),
      })),
    });
    setSaving(false);
    if (result.error || !result.dish) {
      setError(result.error ?? t.saveChanges);
      return;
    }
    upsertLocal(result.dish);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDraft(emptyDraft(draft.category_id));
    router.refresh();
  }

  async function toggle(dish: AdminDish, available: boolean) {
    const previous = dish.is_available;
    setItems((current) =>
      current.map((row) =>
        row.id === dish.id ? { ...row, is_available: available } : row,
      ),
    );
    if (draft.id === dish.id) {
      setDraft((current) => ({ ...current, is_available: available }));
    }
    const result = await toggleAdminDish(dish.id, available);
    if (result.error) {
      setItems((current) =>
        current.map((row) =>
          row.id === dish.id ? { ...row, is_available: previous } : row,
        ),
      );
      setError(result.error);
      return;
    }
    if (result.dish) upsertLocal(result.dish);
    setError(null);
  }

  async function remove(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    const snapshot = items;
    setItems((current) => current.filter((row) => row.id !== id));
    if (draft.id === id) {
      setDraft(emptyDraft(laneCategories[0]?.id ?? ""));
    }
    const result = await deleteAdminDish(id);
    if (result.error) {
      setItems(snapshot);
      setError(result.error);
      return;
    }
    setError(null);
    router.refresh();
  }

  async function addCategory() {
    if (!categoryName.trim()) return;
    setSaving(true);
    const result = await saveAdminCategory({
      name: categoryName,
      station: lane === "bar" ? "bar" : "kitchen",
      menu_role: lane === "bar" ? "drink" : "food",
    });
    setSaving(false);
    if (result.error || !result.category) {
      setError(result.error ?? t.saveChanges);
      return;
    }
    setCategoryRows((current) => [...current, result.category!]);
    setCategoryName("");
    setDraft((current) =>
      current.category_id ? current : emptyDraft(result.category!.id),
    );
    setError(null);
    router.refresh();
  }

  async function suggestTranslations() {
    const name = draft.name.trim();
    const description = draft.description.trim();
    if (!name || suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const texts = [name, ...(description ? [description] : [])];
      const [enRes, ruRes] = await Promise.all([
        fetch("/api/menu-translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "en",
            texts,
            restaurantId,
          }),
        }),
        fetch("/api/menu-translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "ru",
            texts,
            restaurantId,
          }),
        }),
      ]);
      const enJson = (await enRes.json()) as {
        translations?: Record<string, string>;
      };
      const ruJson = (await ruRes.json()) as {
        translations?: Record<string, string>;
      };
      setDraft((current) => ({
        ...current,
        name_en: current.name_en.trim() || enJson.translations?.[name] || "",
        name_ru: current.name_ru.trim() || ruJson.translations?.[name] || "",
        description_en:
          current.description_en.trim() ||
          (description ? enJson.translations?.[description] ?? "" : ""),
        description_ru:
          current.description_ru.trim() ||
          (description ? ruJson.translations?.[description] ?? "" : ""),
      }));
    } catch {
      setError(t.aiChipSaveFailed);
    } finally {
      setSuggesting(false);
    }
  }

  async function renameCategory(
    category: AdminCategory,
    patch: {
      name?: string;
      name_en?: string;
      name_ru?: string;
      station?: string;
      menu_role?: string;
    },
  ) {
    const name = (patch.name ?? category.name).trim();
    if (!name) return;
    const nameEn = patch.name_en ?? category.name_en ?? "";
    const nameRu = patch.name_ru ?? category.name_ru ?? "";
    const station = patch.station ?? category.station ?? "kitchen";
    const menuRole = patch.menu_role ?? category.menu_role ?? "food";
    if (
      name === category.name &&
      nameEn === (category.name_en ?? "") &&
      nameRu === (category.name_ru ?? "") &&
      station === (category.station ?? "kitchen") &&
      menuRole === (category.menu_role ?? "food")
    ) {
      return;
    }
    const result = await saveAdminCategory({
      id: category.id,
      name,
      name_en: nameEn,
      name_ru: nameRu,
      station,
      menu_role: menuRole,
    });
    if (result.error || !result.category) {
      setError(result.error ?? t.saveChanges);
      return;
    }
    setCategoryRows((current) =>
      current.map((row) => (row.id === category.id ? result.category! : row)),
    );
    setError(null);
  }

  async function removeCategory(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    const snapshotCategories = categoryRows;
    const snapshotItems = items;
    setCategoryRows((current) => current.filter((row) => row.id !== id));
    setItems((current) => current.filter((row) => row.category_id !== id));
    if (draft.category_id === id) {
      setDraft(
        emptyDraft(categoryRows.find((row) => row.id !== id)?.id ?? ""),
      );
    }
    const result = await deleteAdminCategory(id);
    if (result.error) {
      setCategoryRows(snapshotCategories);
      setItems(snapshotItems);
      setError(result.error);
      return;
    }
    setError(null);
    router.refresh();
  }

  const barForm = lane === "bar";

  return (
    <div className="space-y-6">
      <p className="text-sm">
        {t.restaurant}: <span className="font-medium">{restaurantName}</span>
      </p>
      <div className="bg-muted inline-flex rounded-lg p-1">
        <button
          type="button"
          className={laneTabClass(lane === "food")}
          aria-pressed={lane === "food"}
          onClick={() => switchLane("food")}
        >
          {t.overviewFoodTab}
        </button>
        <button
          type="button"
          className={laneTabClass(lane === "bar")}
          aria-pressed={lane === "bar"}
          onClick={() => switchLane("bar")}
        >
          {t.overviewBarTab}
        </button>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void addCategory();
        }}
      >
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="new-category">{t.category}</Label>
          <Input
            id="new-category"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder={t.category}
          />
        </div>
        <Button type="submit" disabled={saving}>
          + {t.category}
        </Button>
      </form>

      <form
        ref={formRef}
        id="admin-dish-form"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 className="text-base font-medium sm:col-span-2">
          {draft.id
            ? barForm
              ? t.editDrink
              : t.editDish
            : barForm
              ? t.addDrink
              : t.addDish}
        </h3>
        <div className="space-y-1">
          <Label htmlFor="dish-name">{t.name}</Label>
          <Input
            id="dish-name"
            name="name"
            required
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="აჭარული ხაჭაპური"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dish-name-en">{t.nameEn}</Label>
          <Input
            id="dish-name-en"
            value={draft.name_en}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name_en: event.target.value }))
            }
            placeholder="Adjarian khachapuri"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-name-ru">{t.nameRu}</Label>
          <Input
            id="dish-name-ru"
            value={draft.name_ru}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name_ru: event.target.value }))
            }
            placeholder="Аджарский хачапури"
          />
        </div>
        {barForm ? (
          <>
            <MoneyField
              id="dish-price-bottle"
              label={t.priceBottle}
              value={draft.bottle_price}
              onChange={(value) =>
                setDraft((current) => ({ ...current, bottle_price: value }))
              }
            />
            <MoneyField
              id="dish-price-glass"
              label={t.priceGlass}
              value={draft.glass_price}
              onChange={(value) =>
                setDraft((current) => ({ ...current, glass_price: value }))
              }
            />
          </>
        ) : (
          <MoneyField
            id="dish-price"
            label={t.price}
            value={draft.price}
            required
            onChange={(value) =>
              setDraft((current) => ({ ...current, price: value }))
            }
          />
        )}
        <div className="space-y-1">
          <Label htmlFor="dish-prep">{t.prepTime}</Label>
          <Input
            id="dish-prep"
            name="prep_minutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            inputMode="numeric"
            value={draft.prep_minutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                prep_minutes: event.target.value,
              }))
            }
            placeholder="15"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-desc">
            {t.description}{" "}
            <span className="text-muted-foreground font-normal">
              ({t.optional})
            </span>
          </Label>
          <Textarea
            id="dish-desc"
            name="description"
            value={draft.description}
            required={false}
            rows={3}
            placeholder={t.noDescription}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-desc-en">{t.descriptionEn}</Label>
          <Textarea
            id="dish-desc-en"
            value={draft.description_en}
            rows={2}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description_en: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-desc-ru">{t.descriptionRu}</Label>
          <Textarea
            id="dish-desc-ru"
            value={draft.description_ru}
            rows={2}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description_ru: event.target.value,
              }))
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={suggesting || !draft.name.trim()}
            onClick={() => void suggestTranslations()}
          >
            {suggesting ? t.suggestingTranslation : t.suggestTranslation}
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dish-image">{t.imageUrl}</Label>
          <input
            ref={imageInputRef}
            id="dish-image"
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadingImage || saving}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void onImageSelected(file);
            }}
          />
          <label
            htmlFor={uploadingImage ? undefined : "dish-image"}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploadingImage) setDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (uploadingImage) return;
              const file = event.dataTransfer.files?.[0] ?? null;
              void onImageSelected(file);
            }}
            className={cn(
              "border-primary/30 bg-muted/40 relative flex min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragOver && "border-primary bg-primary/10",
              uploadingImage && "pointer-events-none cursor-wait",
            )}
          >
            {previewUrl || draft.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl || draft.image_url}
                alt=""
                className="bg-muted h-28 w-28 rounded-lg object-contain ring-1 ring-foreground/10"
              />
            ) : (
              <>
                <ImagePlus className="text-muted-foreground mb-2 size-8" />
                <span className="text-sm font-medium">{t.imageDropzone}</span>
                <span className="text-muted-foreground mt-1 text-xs">
                  {t.imageHint}
                </span>
              </>
            )}
            {uploadingImage ? (
              <span className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader2 className="text-primary size-6 animate-spin" />
                <span className="text-sm font-medium">{t.imageUploadingShort}</span>
              </span>
            ) : null}
          </label>
          {previewUrl || draft.image_url ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                {t.imageChange}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={uploadingImage}
                onClick={clearDishImage}
              >
                {t.delete}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="dish-cat">{t.category}</Label>
          <select
            id="dish-cat"
            className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
            value={draft.category_id}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                category_id: event.target.value,
              }))
            }
          >
            {laneCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryNameFromFields(category, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-ingredients">{t.ingredients}</Label>
          <Input
            id="dish-ingredients"
            value={draft.ingredients}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                ingredients: event.target.value,
              }))
            }
            placeholder={t.ingredientsPlaceholder}
          />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t.pairingsSection}</p>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-xs">
                {t.pairingsSelected(draft.pairing_dish_ids.length)}
              </p>
              {draft.pairing_dish_ids.length > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  onClick={clearPairings}
                >
                  {t.pairingsClear}
                </button>
              ) : null}
            </div>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.pairingsHint}
          </p>
          {pairingCandidates.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.pairingsEmpty}</p>
          ) : (
            <div className="border-border/70 bg-card space-y-3 rounded-2xl border p-3 shadow-sm">
              {selectedPairings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPairings.map((dish) => (
                    <button
                      key={`sel-${dish.id}`}
                      type="button"
                      onClick={() => togglePairing(dish.id)}
                      className="bg-primary/10 text-primary inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                      title={t.delete}
                    >
                      <span className="line-clamp-1">
                        {dishLabel(dish.name, locale)}
                      </span>
                      <X className="size-3 shrink-0 opacity-70" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setPairingCategoryId("all")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    pairingCategoryId === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.pairingsAll}
                  <span className="ml-1 opacity-70">
                    {pairingCandidates.length}
                  </span>
                </button>
                {pairingCategoryOptions.map(({ category, count }) => {
                  const active = pairingCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setPairingCategoryId(category.id)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {categoryNameFromFields(category, locale)}
                      <span className="ml-1 opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  id="pairing-search"
                  value={pairingSearch}
                  onChange={(event) => setPairingSearch(event.target.value)}
                  placeholder={t.pairingsSearch}
                  className="h-9 pr-9 pl-9"
                  autoComplete="off"
                />
                {pairingSearch ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md"
                    aria-label={t.pairingsClear}
                    onClick={() => setPairingSearch("")}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-border/60">
                {filteredPairings.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                    {t.pairingsNoMatch}
                  </p>
                ) : (
                  <ul className="divide-border/60 divide-y">
                    {filteredPairings.map(({ dish, category, label }) => {
                      const checked = draft.pairing_dish_ids.includes(dish.id);
                      const catLabel = category
                        ? categoryNameFromFields(category, locale)
                        : "";
                      return (
                        <li key={dish.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                              checked
                                ? "bg-primary/8"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-primary size-4 shrink-0"
                              checked={checked}
                              onChange={() => togglePairing(dish.id)}
                            />
                            <span className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
                              {dish.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={dish.image_url}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <span
                                  className="from-muted to-muted/50 block size-full bg-linear-to-br"
                                  aria-hidden
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-1 text-sm font-medium leading-tight">
                                {label}
                              </span>
                              <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-snug">
                                {catLabel ? <span>{catLabel}</span> : null}
                                <span className="text-brand-price font-semibold tabular-nums">
                                  {formatGel(dish.price)}
                                </span>
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">{t.recipeSection}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.recipeHint}
          </p>
          <datalist id="ingredient-catalog">
            {ingredients.map((item) => (
              <option
                key={item.id}
                value={item.name}
              >{`${item.unit} · ${item.stock_qty}`}</option>
            ))}
          </datalist>
          {draft.recipe.map((line, index) => (
            <div
              key={`recipe-${index}`}
              className="grid gap-2 rounded-lg border p-2 sm:grid-cols-6"
            >
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`recipe-name-${index}`}>{t.recipeName}</Label>
                <Input
                  id={`recipe-name-${index}`}
                  list="ingredient-catalog"
                  value={line.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    const match = ingredients.find(
                      (item) =>
                        item.name.trim().toLowerCase() === name.trim().toLowerCase(),
                    );
                    setDraft((current) => ({
                      ...current,
                      recipe: current.recipe.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              name,
                              unit: match?.unit ?? row.unit,
                              cost_per_unit:
                                match && row.cost_per_unit === ""
                                  ? String(match.cost_per_unit)
                                  : row.cost_per_unit,
                              stock_qty:
                                match && row.stock_qty === ""
                                  ? String(match.stock_qty)
                                  : row.stock_qty,
                            }
                          : row,
                      ),
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`recipe-qty-${index}`}>{t.recipeQuantity}</Label>
                <Input
                  id={`recipe-qty-${index}`}
                  type="number"
                  min={0}
                  step="0.001"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recipe: current.recipe.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, quantity: event.target.value }
                          : row,
                      ),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`recipe-unit-${index}`}>{t.recipeUnit}</Label>
                <select
                  id={`recipe-unit-${index}`}
                  className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                  value={line.unit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recipe: current.recipe.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              unit: isRecipeUnit(event.target.value)
                                ? event.target.value
                                : row.unit,
                            }
                          : row,
                      ),
                    }))
                  }
                >
                  {RECIPE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`recipe-cost-${index}`}>{t.recipeCost}</Label>
                <Input
                  id={`recipe-cost-${index}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={line.cost_per_unit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recipe: current.recipe.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, cost_per_unit: event.target.value }
                          : row,
                      ),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`recipe-stock-${index}`}>{t.recipeStock}</Label>
                <div className="flex gap-1">
                  <Input
                    id={`recipe-stock-${index}`}
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    value={line.stock_qty}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        recipe: current.recipe.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, stock_qty: event.target.value }
                            : row,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        recipe: current.recipe.filter(
                          (_, rowIndex) => rowIndex !== index,
                        ),
                      }))
                    }
                  >
                    {t.recipeRemove}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                recipe: [...current.recipe, emptyRecipeLine()],
              }))
            }
          >
            {t.recipeAdd}
          </Button>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dish-all">{t.allergens}</Label>
          <Input
            id="dish-all"
            value={draft.allergens}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                allergens: event.target.value,
              }))
            }
            placeholder="gluten, dairy, eggs"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">{t.nutritionSection}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["calories", t.nutritionCalories],
                ["protein", t.nutritionProtein],
                ["carbs", t.nutritionCarbs],
                ["fat", t.nutritionFat],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`dish-${field}`}>{label}</Label>
                <Input
                  id={`dish-${field}`}
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={draft[field]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Label htmlFor="dish-available" className="flex items-center gap-2">
            <Switch
              id="dish-available"
              checked={draft.is_available}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, is_available: checked }))
              }
            />
            {draft.is_available ? t.inStock : t.soldOut}
          </Label>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving || uploadingImage}>
            {uploadingImage
              ? t.imageUploading
              : draft.id
                ? t.saveChanges
                : barForm
                  ? t.addDrink
                  : t.addDish}
          </Button>
          {draft.id ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setDraft(emptyDraft(laneCategories[0]?.id ?? ""));
              }}
            >
              {t.cancelEdit}
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-destructive text-sm sm:col-span-2">{error}</p> : null}
      </form>

      {filledGroups.length === 0 && emptyCategories.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">{t.menuEmpty}</p>
      ) : null}

      {filledGroups.map(({ category, dishes: categoryDishes }) => (
        <section key={category.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              defaultValue={category.name}
              className="h-8 max-w-xs"
              onBlur={(event) =>
                void renameCategory(category, { name: event.target.value })
              }
              aria-label={t.category}
            />
            <Input
              defaultValue={category.name_en ?? ""}
              className="h-8 max-w-40"
              placeholder={t.nameEn}
              onBlur={(event) =>
                void renameCategory(category, { name_en: event.target.value })
              }
              aria-label={t.nameEn}
            />
            <Input
              defaultValue={category.name_ru ?? ""}
              className="h-8 max-w-40"
              placeholder={t.nameRu}
              onBlur={(event) =>
                void renameCategory(category, { name_ru: event.target.value })
              }
              aria-label={t.nameRu}
            />
            <CategoryMetaSelects
              category={category}
              onChange={(patch) => void renameCategory(category, patch)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void removeCategory(category.id)}
            >
              {t.delete}
            </Button>
          </div>
          {categoryDishes.map((dish) => (
            <div
              key={dish.id}
              className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {dishLabel(dish.name, locale)} ·{" "}
                  <span className="text-primary">
                    {barForm
                      ? [
                          dish.glass_price != null
                            ? `${t.priceGlass} ${formatGel(dish.glass_price)}`
                            : null,
                          dish.bottle_price != null
                            ? `${t.priceBottle} ${formatGel(dish.bottle_price)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || formatGel(Number(dish.price))
                      : formatGel(Number(dish.price))}
                  </span>
                </p>
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  {dish.description
                    ? dishDescription(dish.name, dish.description, locale)
                    : t.noDescription}
                </p>
                {dish.prep_minutes ? (
                  <p className="text-muted-foreground text-xs">
                    {dish.prep_minutes} {t.prepMinutes}
                  </p>
                ) : null}
                {(dish.ingredients ?? []).length > 0 ? (
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {t.ingredients}: {(dish.ingredients ?? []).join(", ")}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant={dish.is_available ? "secondary" : "destructive"}>
                    {dish.is_available ? t.inStock : t.soldOut}
                  </Badge>
                  {(dish.allergens ?? []).map((allergen) => (
                    <Badge key={allergen} variant="outline">
                      {allergen}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs" htmlFor={`stock-${dish.id}`}>
                  {dish.is_available ? t.inStock : t.soldOut}
                </Label>
                <Switch
                  id={`stock-${dish.id}`}
                  checked={dish.is_available}
                  onCheckedChange={(checked) => void toggle(dish, checked)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(dish)}
                >
                  {t.edit}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(dish.id)}
                >
                  {t.delete}
                </Button>
              </div>
            </div>
          ))}
        </section>
      ))}

      {emptyCategories.length > 0 ? (
        <section className="space-y-2">
          {emptyCategories.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center gap-2">
              <Input
                defaultValue={category.name}
                className="h-8 max-w-xs"
                onBlur={(event) =>
                  void renameCategory(category, { name: event.target.value })
                }
                aria-label={t.category}
              />
              <Input
                defaultValue={category.name_en ?? ""}
                className="h-8 max-w-40"
                placeholder={t.nameEn}
                onBlur={(event) =>
                  void renameCategory(category, { name_en: event.target.value })
                }
                aria-label={t.nameEn}
              />
              <Input
                defaultValue={category.name_ru ?? ""}
                className="h-8 max-w-40"
                placeholder={t.nameRu}
                onBlur={(event) =>
                  void renameCategory(category, { name_ru: event.target.value })
                }
                aria-label={t.nameRu}
              />
              <CategoryMetaSelects
                category={category}
                onChange={(patch) => void renameCategory(category, patch)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void removeCategory(category.id)}
              >
                {t.delete}
              </Button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function laneTabClass(active: boolean) {
  return active
    ? "rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm"
    : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground";
}

function MoneyField({
  id,
  label,
  value,
  required = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
          ₾
        </span>
        <Input
          id={id}
          name={id}
          type="number"
          min="0"
          step="0.01"
          required={required}
          inputMode="decimal"
          className="pl-7"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
        />
      </div>
    </div>
  );
}

function CategoryMetaSelects({
  category,
  onChange,
}: {
  category: AdminCategory;
  onChange: (patch: { station?: string; menu_role?: string }) => void;
}) {
  const { t } = useAdminLocale();
  const selectClass =
    "border-input h-8 rounded-md border bg-transparent px-2 text-sm";
  return (
    <>
      <select
        className={selectClass}
        value={category.station ?? "kitchen"}
        aria-label={t.categoryStation}
        onChange={(event) => onChange({ station: event.target.value })}
      >
        <option value="kitchen">{t.stationKitchen}</option>
        <option value="grill">{t.stationGrill}</option>
        <option value="cold">{t.stationCold}</option>
        <option value="pastry">{t.stationPastry}</option>
        <option value="bar">{t.stationBar}</option>
        <option value="other">{t.stationOther}</option>
      </select>
      <select
        className={selectClass}
        value={category.menu_role ?? "food"}
        aria-label={t.categoryRole}
        onChange={(event) => onChange({ menu_role: event.target.value })}
      >
        <option value="food">{t.roleFood}</option>
        <option value="drink">{t.roleDrink}</option>
        <option value="dessert">{t.roleDessert}</option>
        <option value="sauce">{t.roleSauce}</option>
        <option value="other">{t.roleOther}</option>
      </select>
    </>
  );
}
