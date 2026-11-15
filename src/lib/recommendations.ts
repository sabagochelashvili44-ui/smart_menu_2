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
  pairing_dish_ids?: string[] | null;
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
  options?: { preferDrink?: boolean; preferDessert?: boolean },
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
    mix: cartRecommendationSlots(hasDessert, hasDrink, options),
  };
}

function curatedPreferFlags(
  cartIds: Iterable<string>,
  byId: Map<string, RecommendableDish>,
  categories: CategoryRef[],
) {
  let preferDrink = false;
  let preferDessert = false;
  for (const cartId of cartIds) {
    const source = byId.get(cartId);
    for (const id of source?.pairing_dish_ids ?? []) {
      const companion = byId.get(id);
      if (!companion || !companion.is_available) continue;
      const course = flavorCourse(toFlavorDish(companion, categories));
      if (course === "drink") preferDrink = true;
      if (course === "dessert") preferDessert = true;
    }
  }
  return { preferDrink, preferDessert };
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
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  const prefer = curatedPreferFlags(
    lastId ? [lastId, ...inCart] : inCart,
    byId,
    categories,
  );
  const { cartDishes, mix } = cartFlavorState(
    dishes,
    categories,
    inCart,
    prefer,
  );

  const allowed = (dish: RecommendableDish) => {
    if (!dish.is_available || inCart.has(dish.id)) return false;
    const category = categoryName(dish, categories);
    return dishMatchesDiet({ ...dish, category }, diet);
  };

  // Admin-curated companions for the last-selected item: show ALL of them,
  // and never mix in heuristic suggestions.
  const curatedSource = lastId ? byId.get(lastId) : null;
  const curatedIds = curatedSource?.pairing_dish_ids ?? [];
  if (curatedIds.length > 0) {
    const curatedItems: RecommendableDish[] = [];
    for (const id of curatedIds) {
      const companion = byId.get(id);
      // Keep every configured companion that still exists; only skip sold-out
      // and items already in the cart.
      if (!companion || !companion.is_available || inCart.has(companion.id)) {
        continue;
      }
      curatedItems.push(
        withReason(companion, locale, "shareTable", categories),
      );
    }
    return {
      heading: "together",
      items: curatedItems,
      mix: cartRecommendationSlots(
        curatedItems.some(
          (dish) => flavorCourse(toFlavorDish(dish, categories)) === "dessert",
        ),
        curatedItems.some(
          (dish) => flavorCourse(toFlavorDish(dish, categories)) === "drink",
        ),
      ),
    };
  }

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

  const used = new Set<string>();
  const items: RecommendableDish[] = [];
  for (const dish of fromFlavor) {
    if (items.length >= limit || used.has(dish.id)) continue;
    items.push(dish);
    used.add(dish.id);
  }
  if (items.length >= limit) {
    return { heading: "together", items: items.slice(0, limit), mix };
  }

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
  priorityIds = [],
  catalogDishes = [],
}: {
  preferred: RecommendableDish[];
  companions: RecommendableDish[];
  mix: FlavorCourse[];
  /** Admin-curated companion ids — when set, cards are ONLY these (all of them). */
  priorityIds?: string[];
  /** Full menu used to resolve curated ids not present in preferred/companions. */
  catalogDishes?: RecommendableDish[];
}): RecommendableDish[] {
  const catalog = [...catalogDishes, ...preferred, ...companions];
  const byId = new Map<string, RecommendableDish>();
  for (const dish of catalog) {
    if (dish?.id) byId.set(dish.id, dish);
  }

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

  if (priorityIds.length > 0) {
    return priorityIds
      .map((id) => byId.get(id))
      .filter((dish): dish is RecommendableDish => Boolean(dish))
      .filter((dish) => dish.is_available !== false)
      .map((dish) => ({
        ...dish,
        pairReason: dish.pairReason ?? undefined,
      }));
  }

  const slots = mix.length ? [...mix] : (["dish", "dish", "dish"] as FlavorCourse[]);
  const picked: RecommendableDish[] = [];
  const used = new Set<string>();

  function takeFrom(source: RecommendableDish[], course: FlavorCourse) {
    const next = source.find(
      (dish) =>
        dish.is_available !== false &&
        !used.has(dish.id) &&
        courseOf(dish) === course,
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

/** Official companion ids for the focused cart item (last added), in admin order. */
export function curatedPriorityIdsFromCart(
  cartIds: string[],
  dishes: Array<{ id: string; pairing_dish_ids?: string[] | null }>,
  options?: { lastAddedId?: string | null },
) {
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  const focusId =
    options?.lastAddedId && byId.has(options.lastAddedId)
      ? options.lastAddedId
      : cartIds[cartIds.length - 1];
  if (!focusId) return [];
  const source = byId.get(focusId);
  const cartSet = new Set(cartIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of source?.pairing_dish_ids ?? []) {
    if (!id || seen.has(id) || cartSet.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const DISH_ID_LINE_RE =
  /\n?\s*\*?\*?DISH_IDS?\*?\*?:\s*([^\n]*)/i;

/**
 * Force DISH_IDS to the admin pairing list for a subject dish.
 * Prefer an explicit subjectDishId (from the guest question) over the cart.
 */
export function enforceCuratedPairingsInChefReply({
  text,
  dishes,
  cartIds,
  lastAddedId = null,
  subjectDishId = null,
  clearWhenEmpty = false,
  noAlcohol = false,
}: {
  text: string;
  dishes: RecommendableDish[];
  cartIds: string[];
  lastAddedId?: string | null;
  subjectDishId?: string | null;
  /** When the subject has no admin pairings, strip DISH_IDS to none. */
  clearWhenEmpty?: boolean;
  noAlcohol?: boolean;
}) {
  const byIdLookup = new Map(dishes.map((dish) => [dish.id, dish]));
  let priorityIds: string[] = [];
  if (subjectDishId && byIdLookup.has(subjectDishId)) {
    const source = byIdLookup.get(subjectDishId);
    const cartSet = new Set(cartIds);
    for (const id of source?.pairing_dish_ids ?? []) {
      if (!id || cartSet.has(id)) continue;
      priorityIds.push(id);
    }
    if (!priorityIds.length && clearWhenEmpty) {
      // Drop invented companion cards; keep a short refusal instead of Gemini prose.
      const sourceName = source?.name?.trim() || "ამ კერძს";
      return `ამ მენიუში ${sourceName}-თან ერთად შესათავაზებელი პოზიცია ჯერ მითითებული არ არის.\nDISH_IDS: none`;
    }
    if (!priorityIds.length) return text;
  } else {
    if (!cartIds.length) return text;
    priorityIds = curatedPriorityIdsFromCart(cartIds, dishes, {
      lastAddedId,
    });
    if (!priorityIds.length) return text;
  }

  const byId = new Map(dishes.map((dish) => [dish.id.toLowerCase(), dish]));
  const curated = priorityIds
    .map((id) => byId.get(id.toLowerCase()))
    .filter((dish): dish is RecommendableDish => Boolean(dish))
    .filter((dish) => dish.is_available !== false)
    .filter((dish) => !(noAlcohol && /ღვინ|wine|საფერავ|ლუდ|beer|qvevri|ყვევრ/i.test(dish.name)));

  if (!curated.length) return text;

  const uniqueIds = curated.map((dish) => dish.id);
  let spoken = text.replace(DISH_ID_LINE_RE, "\n").trimEnd();
  const missingNames = curated
    .map((dish) => dish.name.trim())
    .filter(
      (name) =>
        name &&
        !spoken.toLocaleLowerCase("ka").includes(name.toLocaleLowerCase("ka")),
    );
  if (missingNames.length) {
    spoken = `${spoken.trim()} ერთად გირჩევთ: ${missingNames.join(", ")}.`.trim();
  }

  return `${spoken}\nDISH_IDS: ${uniqueIds.join(",")}`;
}
