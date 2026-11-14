import { pickCrossSells, type CrossSellDish } from "@/lib/cross-sell";
import {
  pickCartAwareCompanions,
  type FlavorCourse,
  type FlavorDish,
  type FlavorReasonKey,
  cartRecommendationSlots,
  flavorCourse,
} from "@/lib/flavor-pairing";
import { dishMatchesDiet, type DietFilter } from "@/lib/guest-diet";
import { ui, type MenuLocale } from "@/lib/menu-copy";

export type RecommendableDish = CrossSellDish & {
  description?: string | null;
  allergens?: string[] | null;
  ingredients?: string[] | null;
  wine_pairing?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  pairReason?: string;
  category?: string;
};

export type ExternalContext = {
  hour: number;
  temperatureC: number | null;
  rainy: boolean;
};

export type UpsellHeading = "together" | "chef";

export type UpsellResult = {
  heading: UpsellHeading;
  items: RecommendableDish[];
  mix: FlavorCourse[];
};

type CategoryRef = {
  id: string;
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
};

type CartLine = { id: string; quantity: number };

function joinText(...parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" ");
}

function categoryName(dish: RecommendableDish, categories: CategoryRef[]) {
  return categories.find((row) => row.id === dish.category_id)?.name ?? "";
}

function categoryBlob(dish: RecommendableDish, categories: CategoryRef[]) {
  const row = categories.find((item) => item.id === dish.category_id);
  if (!row) return "";
  return joinText(row.name, row.name_en, row.name_ru);
}

function toFlavorDish(
  dish: RecommendableDish,
  categories: CategoryRef[],
): FlavorDish {
  return {
    id: dish.id,
    name: joinText(dish.name, dish.name_en, dish.name_ru),
    description: joinText(
      dish.description,
      dish.description_en,
      dish.description_ru,
    ),
    ingredients: dish.ingredients,
    category: categoryBlob(dish, categories),
    wine_pairing: dish.wine_pairing,
    price: dish.price,
    image_url: dish.image_url,
    is_available: dish.is_available,
  };
}

export function flavorWhyLine(
  locale: MenuLocale,
  key: FlavorReasonKey,
) {
  const copy = ui[locale];
  switch (key) {
    case "cutRich":
      return copy.flavorWhyCutRich;
    case "coolSpice":
      return copy.flavorWhyCoolSpice;
    case "grillMatch":
      return copy.flavorWhyGrill;
    case "seafoodMatch":
      return copy.flavorWhySeafood;
    case "dairyBalance":
      return copy.flavorWhyDairy;
    case "sweetFinish":
      return copy.flavorWhyDessert;
    case "drinkLift":
      return copy.flavorWhyDrink;
    case "wineListed":
      return copy.flavorWhyWine;
    default:
      return copy.flavorWhyShare;
  }
}

export function localExternalContext(now = new Date()): ExternalContext {
  const hour = now.getHours();
  const month = now.getMonth() + 1;
  let temperatureC = 16;
  if (month >= 6 && month <= 8) temperatureC = 29;
  else if (month === 5 || month === 9) temperatureC = 22;
  else if (month === 11 || month === 12 || month <= 2) temperatureC = 4;
  return {
    hour,
    temperatureC,
    rainy: month === 11 || month === 3,
  };
}

function cartFlavorState(
  dishes: RecommendableDish[],
  categories: CategoryRef[],
  inCart: Set<string>,
) {
  const cartDishes = dishes
    .filter((dish) => inCart.has(dish.id))
    .map((dish) => toFlavorDish(dish, categories));
  const hasDessert = cartDishes.some((dish) => flavorCourse(dish) === "dessert");
  const hasDrink = cartDishes.some((dish) => flavorCourse(dish) === "drink");
  return {
    cartDishes,
    hasDessert,
    hasDrink,
    mix: cartRecommendationSlots(hasDessert, hasDrink),
  };
}

function withReason(
  dish: RecommendableDish,
  locale: MenuLocale,
  reason: FlavorReasonKey,
  categories: CategoryRef[],
): RecommendableDish {
  return {
    ...dish,
    pairReason: flavorWhyLine(locale, reason),
    category: categoryName(dish, categories),
  };
}

export function pickContextUpsells({
  dishes,
  categories,
  cart,
  diet,
  lastAddedId,
  locale = "ka",
  limit = 3,
}: {
  dishes: RecommendableDish[];
  categories: CategoryRef[];
  cart: CartLine[];
  diet: DietFilter;
  context?: ExternalContext;
  lastAddedId?: string | null;
  locale?: MenuLocale;
  limit?: number;
}): UpsellResult {
  const inCart = new Set(cart.map((line) => line.id));
  const lastId = lastAddedId ?? cart[cart.length - 1]?.id;
  const { cartDishes, mix } = cartFlavorState(dishes, categories, inCart);

  const allowed = (dish: RecommendableDish) => {
    if (!dish.is_available || inCart.has(dish.id)) return false;
    const category = categoryName(dish, categories);
    return dishMatchesDiet({ ...dish, category }, diet);
  };

  const flavorItems = pickCartAwareCompanions({
    cart: cartDishes,
    dishes: dishes.filter(allowed).map((dish) => toFlavorDish(dish, categories)),
    inCart,
    limit,
  });

  const fromFlavor = flavorItems
    .map((row) => {
      const dish = dishes.find((item) => item.id === row.dish.id);
      return dish ? withReason(dish, locale, row.reason, categories) : null;
    })
    .filter((dish): dish is RecommendableDish => Boolean(dish));

  if (fromFlavor.length >= limit) {
    return { heading: "together", items: fromFlavor.slice(0, limit), mix };
  }

  const used = new Set(fromFlavor.map((dish) => dish.id));
  const items = [...fromFlavor];
  const needed = [...mix];
  for (const dish of items) {
    const index = needed.indexOf(
      flavorCourse(toFlavorDish(dish, categories)),
    );
    if (index >= 0) needed.splice(index, 1);
  }

  const fallback = pickCrossSells({
    dishes,
    categories,
    cartIds: inCart,
    seed: lastId ?? "",
    lastAddedId: lastId,
    limit: limit * 2,
  }).filter((dish) => allowed(dish) && !used.has(dish.id));

  function fillCourse(course: FlavorCourse, source: RecommendableDish[]) {
    const next = source.find((dish) => {
      if (used.has(dish.id) || !allowed(dish)) return false;
      return flavorCourse(toFlavorDish(dish, categories)) === course;
    });
    if (!next) return;
    items.push(withReason(next, locale, "shareTable", categories));
    used.add(next.id);
  }

  for (const course of needed) {
    if (items.length >= limit) break;
    fillCourse(course, fallback);
    if (items.length >= limit) break;
    fillCourse(course, dishes);
  }

  return { heading: "together", items: items.slice(0, limit), mix };
}

export function fillChefRecommendationCards({
  preferred,
  companions,
  mix,
}: {
  preferred: RecommendableDish[];
  companions: RecommendableDish[];
  mix: FlavorCourse[];
}): RecommendableDish[] {
  const slots = mix.length ? mix : (["dish", "dish", "dish"] as FlavorCourse[]);
  const picked: RecommendableDish[] = [];
  const used = new Set<string>();

  function courseOf(dish: RecommendableDish): FlavorCourse {
    return flavorCourse({
      id: dish.id,
      name: dish.name,
      description: dish.description,
      ingredients: dish.ingredients,
      category: dish.category ?? "",
      wine_pairing: dish.wine_pairing,
      price: dish.price,
      image_url: dish.image_url,
      is_available: dish.is_available,
    });
  }

  function takeFrom(source: RecommendableDish[], course: FlavorCourse) {
    const next = source.find(
      (dish) => !used.has(dish.id) && courseOf(dish) === course,
    );
    if (!next) return false;
    used.add(next.id);
    picked.push(next);
    return true;
  }

  for (const course of slots) {
    if (takeFrom(preferred, course)) continue;
    takeFrom(companions, course);
  }
  const stillNeeded = [...slots];
  for (const dish of picked) {
    const index = stillNeeded.indexOf(courseOf(dish));
    if (index >= 0) stillNeeded.splice(index, 1);
  }
  for (const course of stillNeeded) {
    if (picked.length >= 3) break;
    takeFrom([...preferred, ...companions], course);
  }
  return picked.slice(0, 3);
}
