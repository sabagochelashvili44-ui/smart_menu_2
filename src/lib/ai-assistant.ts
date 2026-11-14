import { WAITER_LANGUAGE_RULES } from "@/lib/ai/waiter";
import { hasDishNutrition, nutritionContextLine } from "@/lib/dish-nutrition";
import {
  cartRecommendationSlots,
  flavorCourse,
  type FlavorCourse,
} from "@/lib/flavor-pairing";
import { dishDietLabels } from "@/lib/guest-diet";
import {
  allergenLabel,
  categoryLabel,
  dishDescriptionFromFields,
  dishNameFromFields,
  ingredientLabel,
  type MenuLocale,
} from "@/lib/menu-copy";
import { repairParenthesizedTokens } from "@/lib/menu-list-normalize";

export type AssistantDish = {
  id?: string;
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  price?: number | null;
  bottle_price?: number | null;
  glass_price?: number | null;
  allergens?: string[] | null;
  ingredients?: string[] | null;
  wine_pairing?: string | null;
  category?: string | null;
  is_available?: boolean;
  order_count?: number;
  is_popular?: boolean;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  prep_minutes?: number | null;
};

const FOCUS_LIMIT = 8;
const DISH_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BROWSE_RE =
  /recommend|what'?s good|what is good|bestseller|popular|show me|მირჩიე|რა არის კარგი|რა გაქვთ|სხვა|посовет|что ещё|другое/i;

/** Georgian House dishes that contain walnuts or walnut sauce/oil. */
const NUT_DISH_KEYS = new Set([
  "ფხალი ასორტი",
  "ბადრიჯანი ნიგვზით",
  "ქართული სალათი",
  "ჭარხლის სალათი ნიგვზით",
  "საცივი",
  "შქმერული",
  "ბაჟე",
  "კალმახი ნიგვზით",
  "შქმერული სოკოთი",
  "ფხალი თეფში",
  "ეკალა ნიგვზით",
  "თაფლის ნამცხვარი კაკლით",
  "გოზინაყი",
  "ჩურჩხელა",
  "ბაქლავა",
]);

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag.trim());
  }
  return out;
}

function inferAllergens(
  kaName: string,
  text: string,
  listed: string[],
): string[] {
  const blob = `${kaName} ${text}`.toLowerCase();
  const tags = [...listed].filter(
    (item) => !/არ\s+შეიცავს|does\s+not\s+contain|не\s+содержит/i.test(item),
  );

  const hasNuts =
    NUT_DISH_KEYS.has(kaName) ||
    kaName.includes("ნიგვზ") ||
    /\bwalnuts?\b/.test(blob) ||
    /\bhazelnut|\balmond|\bpistachio|\bpeanut/.test(blob);
  if (hasNuts) tags.push("nuts");

  if (
    /sulguni|cheese|yogurt|matsoni|nadughi|elarji|dairy|butter|cream|ice cream|panna cotta|cappuccino|khachapuri|gebzhalia/.test(
      blob,
    ) ||
    /სულგუნი|ყველ|მატსონი|ნადუღი|ელარჯი|ხაჭაპური|გებჟალია/.test(kaName)
  ) {
    tags.push("dairy");
  }

  if (
    /khachapuri|shoti|bread|pastry|baklava|khinkali|gluten|wheat|flour|dough|nazuki/.test(
      blob,
    ) ||
    /ხაჭაპური|შოთი|პური|ხინკალი|ბაქლავა|ნაზუქი/.test(kaName)
  ) {
    tags.push("gluten");
  }

  if (
    /\beggs?\b|chikhirtma|adjarian/.test(blob) ||
    /კვერცხ|ჩიხირთმა|აჭარული/.test(kaName)
  ) {
    tags.push("eggs");
  }

  if (
    /trout|salmon|fish|catfish|dorado|shrimp|mussel|calamari|shellfish/.test(
      blob,
    ) ||
    /კალმახი|ორაგული|თევზ|სომი|დორადო|კრევეტ|მიდი|კალმარ/.test(kaName)
  ) {
    if (/shrimp|mussel|calamari|კრევეტ|მიდი|კალმარ/.test(blob + kaName)) {
      tags.push("shellfish");
    }
    if (/trout|salmon|fish|catfish|dorado|კალმახი|ორაგული|თევზ|სომი|დორადო/.test(blob + kaName)) {
      tags.push("fish");
    }
  }

  if (/wine|საფერავი|რქაწითელი|ღვინ/.test(blob + kaName)) {
    tags.push("sulfites");
  }

  return uniqueTags(tags);
}

function queryKey(raw: string) {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function formatGel(price: number | null | undefined) {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return "price on request";
  }
  return `₾${price.toFixed(2)}`;
}

function dishDisplayName(dish: AssistantDish, locale: MenuLocale) {
  return (
    dishNameFromFields(
      {
        name: dish.name,
        name_en: dish.name_en,
        name_ru: dish.name_ru,
      },
      locale,
    ) || dish.name.trim()
  );
}

function dishLocalizedDesc(dish: AssistantDish, locale: MenuLocale) {
  return (
    dishDescriptionFromFields(
      {
        name: dish.name,
        description: dish.description ?? "",
        description_en: dish.description_en,
        description_ru: dish.description_ru,
      },
      locale,
    ) ||
    dish.description?.trim() ||
    ""
  );
}

function dishFacts(dish: AssistantDish, locale: MenuLocale) {
  const rawName = dish.name.trim();
  const cleanIngredients = repairParenthesizedTokens(dish.ingredients ?? []);
  const allergens = inferAllergens(
    rawName,
    `${dish.description ?? ""} ${dish.description_en ?? ""} ${dish.description_ru ?? ""} ${cleanIngredients.join(", ")}`,
    repairParenthesizedTokens(dish.allergens ?? []),
  );
  const dietTags = dishDietLabels({
    name: rawName,
    description: dish.description,
    ingredients: cleanIngredients,
    allergens,
    category: dish.category,
  });
  return {
    rawName,
    displayName: dishDisplayName(dish, locale),
    description: dishLocalizedDesc(dish, locale),
    ingredients: cleanIngredients.map((item) => ingredientLabel(item, locale)),
    allergens: allergens.map((item) => allergenLabel(item, locale)),
    dietTags,
  };
}

function ingredientsCoveredByDesc(ingredients: string[], description: string) {
  const hay = queryKey(description);
  if (!hay || !ingredients.length) return false;
  return ingredients.every((item) => {
    const key = queryKey(item);
    return key.length >= 2 && hay.includes(key);
  });
}

function compactIndexLine(dish: AssistantDish, locale: MenuLocale) {
  const facts = dishFacts(dish, locale);
  const parts = [
    `[id:${dish.id || "unknown"}] ${facts.displayName}`,
    formatGel(dish.price),
  ];
  if (typeof dish.glass_price === "number") {
    parts.push(`glass:${formatGel(dish.glass_price)}`);
  }
  if (typeof dish.bottle_price === "number") {
    parts.push(`bottle:${formatGel(dish.bottle_price)}`);
  }
  if (facts.dietTags.length) parts.push(`diet:${facts.dietTags.join(",")}`);
  if (facts.allergens.length) parts.push(`all:${facts.allergens.join(",")}`);
  return `- ${parts.join(" | ")}`;
}

function fullDishCard(dish: AssistantDish, locale: MenuLocale) {
  const facts = dishFacts(dish, locale);
  const lines = [`[id:${dish.id || "unknown"}] ${facts.displayName}`];
  if (locale !== "ka" && facts.rawName && facts.rawName !== facts.displayName) {
    lines.push(`ka: ${facts.rawName}`);
  }
  if (facts.description) lines.push(`desc: ${facts.description}`);
  if (
    facts.ingredients.length &&
    !ingredientsCoveredByDesc(facts.ingredients, facts.description)
  ) {
    lines.push(`in: ${facts.ingredients.join(", ")}`);
  }
  if (facts.allergens.length) lines.push(`all: ${facts.allergens.join(", ")}`);
  if (facts.dietTags.length) lines.push(`diet: ${facts.dietTags.join(", ")}`);
  if (hasDishNutrition(dish)) {
    lines.push(`macros: ${nutritionContextLine(dish)}`);
  }
  if (dish.prep_minutes && dish.prep_minutes > 0) {
    lines.push(`prep: ${dish.prep_minutes} min`);
  }
  if (dish.is_popular) lines.push("popular");
  return lines.join("\n");
}

function buildMenuIndex(
  dishes: AssistantDish[],
  locale: MenuLocale,
  serviceFeePercent: number,
) {
  const grouped = new Map<string, AssistantDish[]>();
  for (const dish of dishes) {
    const rawCategory = (dish.category ?? "Menu").trim() || "Menu";
    const key = categoryLabel(rawCategory, locale);
    const list = grouped.get(key) ?? [];
    list.push(dish);
    grouped.set(key, list);
  }
  const header =
    serviceFeePercent > 0
      ? `INDEX (names and prices only. Add ${serviceFeePercent}% service fee to totals.)`
      : "INDEX (names and prices only.)";
  const blocks = [header];
  for (const [category, rows] of grouped) {
    blocks.push(
      `${category}\n${rows.map((dish) => compactIndexLine(dish, locale)).join("\n")}`,
    );
  }
  return blocks.join("\n");
}

export function extractHistoryDishIds(
  history: Array<{ role?: string; content?: string }>,
) {
  const ids: string[] = [];
  for (const item of history) {
    if (item.role !== "assistant") continue;
    const listed = String(item.content ?? "").match(
      /DISH_IDS?:\s*([^\n]+)/i,
    )?.[1];
    if (!listed || /^none\b/i.test(listed.trim())) continue;
    for (const id of listed.match(DISH_ID_RE) ?? []) {
      ids.push(id.toLowerCase());
    }
  }
  return [...new Set(ids)];
}

function queryNeedles(query: string) {
  const full = queryKey(query);
  const words = full.split(" ").filter((word) => word.length >= 3);
  return [...new Set([full, ...words].filter(Boolean))];
}

function scoreDishMatch(dish: AssistantDish, needles: string[]) {
  const names = [dish.name, dish.name_en, dish.name_ru]
    .map((value) => queryKey(String(value ?? "")))
    .filter(Boolean);
  const blob = queryKey(
    [
      dish.name,
      dish.name_en,
      dish.name_ru,
      dish.description,
      dish.description_en,
      dish.description_ru,
      dish.category,
      ...(dish.ingredients ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  let score = 0;
  for (const needle of needles) {
    for (const name of names) {
      if (name === needle) score += 20;
      else if (name.includes(needle)) score += 12;
      else if (needle.includes(name) && name.length >= 4) score += 10;
    }
    if (blob.includes(needle)) score += 4;
  }
  if (dish.is_popular) score += 1;
  return score;
}

function fallbackFocus(dishes: AssistantDish[]) {
  const picked: AssistantDish[] = [];
  const seen = new Set<string>();
  const take = (dish: AssistantDish) => {
    const id = String(dish.id ?? dish.name);
    if (seen.has(id) || picked.length >= FOCUS_LIMIT) return;
    seen.add(id);
    picked.push(dish);
  };
  for (const dish of dishes.filter((row) => row.is_popular)) take(dish);
  const seenCategory = new Set<string>();
  for (const dish of dishes) {
    const category = (dish.category ?? "").trim().toLowerCase();
    if (category && seenCategory.has(category)) continue;
    if (category) seenCategory.add(category);
    take(dish);
  }
  for (const dish of dishes) take(dish);
  return picked;
}

const VEGETARIAN_QUERY_RE =
  /ვეგეტარ|სამარხვ|მარხვ|vegetarian|vegan|fasting|вегетариан|постн|постан|веган/i;

function dishMatchesVegetarianIntent(dish: AssistantDish) {
  const tags = dishFacts(dish, "ka").dietTags.join(" ").toLowerCase();
  return /vegetarian|vegan|fasting|სამარხვ|ვეგან|ვეგეტარ/.test(tags);
}

export function pickFocusedDishes(
  dishes: AssistantDish[],
  query: string,
  priorIds: string[] = [],
  limit = FOCUS_LIMIT,
) {
  const available = dishes.filter((dish) => dish.is_available !== false);
  if (!available.length) return [];
  const byId = new Map(
    available.map((dish) => [String(dish.id ?? "").toLowerCase(), dish]),
  );
  const focused: AssistantDish[] = [];
  const seen = new Set<string>();
  const take = (dish?: AssistantDish) => {
    if (!dish || focused.length >= limit) return;
    const id = String(dish.id ?? dish.name);
    if (seen.has(id)) return;
    seen.add(id);
    focused.push(dish);
  };
  for (const id of priorIds) take(byId.get(id.toLowerCase()));

  const wantVegetarian = VEGETARIAN_QUERY_RE.test(query);
  const namedCategory =
    BROWSE_RE.test(query.trim()) || wantVegetarian
      ? null
      : categoryFromQuery(query, available);
  const pool = namedCategory
    ? available.filter(
        (dish) =>
          (dish.category ?? "").trim().toLowerCase() ===
          namedCategory.toLowerCase(),
      )
    : available;
  let searchPool = pool.length ? pool : available;
  if (wantVegetarian) {
    const veg = searchPool.filter(dishMatchesVegetarianIntent);
    if (veg.length) searchPool = veg;
  }

  const needles = queryNeedles(query);
  const ranked = searchPool
    .map((dish) => ({
      dish,
      score:
        scoreDishMatch(dish, needles) +
        (wantVegetarian && dishMatchesVegetarianIntent(dish) ? 8 : 0),
    }))
    .filter((row) => row.score > 0 || wantVegetarian)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.dish.is_popular) - Number(a.dish.is_popular),
    );
  const browse = BROWSE_RE.test(query.trim()) || ranked.length === 0;
  if (browse && ranked.length === 0) {
    for (const dish of fallbackFocus(searchPool)) take(dish);
    return focused;
  }
  for (const row of ranked) take(row.dish);
  if (focused.length < 3) {
    for (const dish of fallbackFocus(searchPool)) take(dish);
  }
  return focused;
}

function categoryFromQuery(query: string, dishes: AssistantDish[]) {
  const needles = queryNeedles(query);
  if (!needles.length) return null;
  let best: { category: string; score: number } | null = null;
  const seen = new Set<string>();
  for (const dish of dishes) {
    const raw = (dish.category ?? "").trim();
    if (!raw) continue;
    const id = raw.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const labels = [
      raw,
      categoryLabel(raw, "ka"),
      categoryLabel(raw, "en"),
      categoryLabel(raw, "ru"),
    ];
    let score = 0;
    for (const label of labels) {
      const key = queryKey(label);
      if (!key) continue;
      for (const needle of needles) {
        if (key === needle) score += 20;
        else if (needle.length >= 4 && key.includes(needle)) score += 12;
        else if (key.length >= 4 && needle.includes(key)) score += 10;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { category: raw, score };
    }
  }
  return best && best.score >= 10 ? best.category : null;
}

function focusedDishCards(
  dishes: AssistantDish[],
  locale: MenuLocale,
  focusedDishes?: AssistantDish[],
) {
  const available = dishes.filter((dish) => dish.is_available !== false);
  const focused =
    focusedDishes?.filter((dish) => dish.is_available !== false) ?? [];
  const cards = focused.length ? focused : fallbackFocus(available);
  return cards.map((dish) => fullDishCard(dish, locale)).join("\n\n");
}

export function buildMenuContext(
  dishes: AssistantDish[],
  serviceFeePercent = 0,
  locale: MenuLocale = "ka",
  focusedDishes?: AssistantDish[],
) {
  const available = dishes.filter((dish) => dish.is_available !== false);
  if (!available.length) {
    return "The live menu was not provided. Politely say you will confirm with the floor team.";
  }

  const safeFee = Math.max(0, Math.min(100, Number(serviceFeePercent) || 0));
  const index = buildMenuIndex(available, locale, safeFee);
  const detail = focusedDishCards(available, locale, focusedDishes);
  return `${index}\n\nFULL (quote these fields; do not invent)\n${detail}`;
}

export function buildChefTurnPrompt(
  dishes: AssistantDish[],
  locale: MenuLocale = "ka",
  constraints?: GuestChatConstraints,
  focusedDishes?: AssistantDish[],
  options?: {
    includeCartPairing?: boolean;
    includeFilters?: boolean;
  },
) {
  const includeCartPairing = options?.includeCartPairing !== false;
  const includeFilters = options?.includeFilters !== false;
  const available = dishes.filter((dish) => dish.is_available !== false);
  const detail = available.length
    ? focusedDishCards(available, locale, focusedDishes)
    : "";
  const filters = includeFilters ? constraintsBlock(constraints) : "";
  const cart = includeCartPairing
    ? cartPairingBlock(dishes, constraints)
    : "";
  return `${filters}${cart}
LIVE MENU FULL CARDS (quote these fields; do not invent)
${detail || "(none — politely say you will confirm with the floor team.)"}`;
}

export type GuestChatConstraints = {
  activeFilters?: string[];
  blockedAllergens?: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  maxPrice?: number;
  partySize?: number;
  noAlcohol?: boolean;
  serviceFeePercent?: number;
  cartDishIds?: string[];
};

function assistantCourse(dish: AssistantDish): FlavorCourse {
  return flavorCourse({
    id: dish.id || dish.name,
    name: dish.name,
    description: dish.description,
    ingredients: dish.ingredients,
    category: dish.category ?? "",
    wine_pairing: dish.wine_pairing,
    price: Number(dish.price) || 0,
    image_url: null,
    is_available: dish.is_available !== false,
  });
}

function cartPairingBlock(
  dishes: AssistantDish[],
  constraints?: GuestChatConstraints,
) {
  const ids = (constraints?.cartDishIds ?? [])
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  const cart = dishes.filter((dish) =>
    ids.includes(String(dish.id ?? "").toLowerCase()),
  );
  const hasDessert = cart.some((dish) => assistantCourse(dish) === "dessert");
  const hasDrink = cart.some((dish) => assistantCourse(dish) === "drink");
  const mix = cartRecommendationSlots(hasDessert, hasDrink);
  const mixLabel = mix
    .map((course) =>
      course === "dessert"
        ? "dessert"
        : course === "drink"
          ? "drink"
          : "savory dish",
    )
    .join(", ");
  const cartLine = cart.length
    ? cart
        .map((dish) => {
          const course = assistantCourse(dish);
          return `${dish.name} [${course}]`;
        })
        .join("; ")
    : "(empty)";
  const condition =
    hasDessert && hasDrink
      ? "C — cart has dessert AND drink: 1 savory dish + 1 dessert + 1 drink"
      : hasDessert
        ? "B — cart has dessert, no drink: 2 additional savory dishes + 1 dessert"
        : hasDrink
          ? "drink in cart, no dessert: 2 savory dishes + 1 drink"
          : "A — neither dessert nor drink in cart: 3 distinct savory dishes (no dessert, no drink)";
  const dietPriority =
    constraints?.vegetarian || constraints?.vegan
      ? `
- DIET OVERRIDE: Guest wants vegetarian/fasting (or vegan). Every DISH_ID must match diet: vegetarian or fasting/vegan on the cards. Prefer 3 matching savory plates. Skip alcohol. Only use dessert/drink slots if a matching diet item exists on LIVE MENU.`
      : "";
  return `
CART & 3-CARD PAIRING (mandatory when recommending)
- Current cart: ${cartLine}
- Active mix rule: ${condition}
- Output EXACTLY 3 DISH_IDS in this order of courses: ${mixLabel}.
- Skip ids already listed in the cart above.
- Flavor pairing is mandatory: read ingredients, taste (spicy, rich, savory, acidic, smoky, creamy, sweet, herbal, citrus) and printed recipe/desc. Suggest what naturally complements the cart — never random.
- In the spoken reply, add one short clause why each suggestion matches (cut richness, cool spice, classic grill pairing, citrus with seafood, sweet finish, etc.).
- Specific-dish fact questions (ingredients, allergens, macros of one named plate) may return that one id. Browse / "recommend" / "what else" / pairing MUST use the 3-card mix.${dietPriority}
`;
}

function constraintsBlock(constraints?: GuestChatConstraints) {
  if (!constraints) return "";
  const feePercent = Math.max(
    0,
    Math.min(100, Number(constraints.serviceFeePercent) || 0),
  );
  const lines: string[] = [];
  if (feePercent > 0) {
    lines.push(
      `- Restaurant service fee is ${feePercent}%. Whenever calculating totals, combos, or checking a budget cap, you MUST include the ${feePercent}% service fee (Total = sum of dish prices × ${(1 + feePercent / 100).toFixed(2)}) and state both the dish price(s) and the final total including the ${feePercent}% service fee.`,
    );
  }
  const blocked = constraints.blockedAllergens ?? [];
  const activeFilters = constraints.activeFilters ?? [];
  const hasAnyDietOrBudgetFilter =
    Boolean(constraints.vegetarian) ||
    Boolean(constraints.vegan) ||
    blocked.length > 0 ||
    Boolean(constraints.maxPrice) ||
    Boolean(constraints.partySize) ||
    activeFilters.length > 0;

  if (!hasAnyDietOrBudgetFilter) {
    lines.push(
      "- ACTIVE FILTERS: [] (NONE). All dietary, allergen, and budget filter chips are currently UNSELECTED / OFF. Do NOT carry over or enforce any previous gluten-free, dairy-free, nut-free, vegetarian, or 25 GEL budget restriction from earlier messages unless the guest explicitly asks for it in their latest message.",
    );
  } else {
    lines.push(
      `- ACTIVE FILTERS CURRENTLY SELECTED: [${activeFilters.join(", ")}]. Enforce ONLY the filters listed below and ignore any unselected filter from earlier turns:`,
    );
    if (!blocked.includes("nuts")) {
      lines.push("- Nut filter is OFF (walnut/nut dishes ARE allowed).");
    }
    if (!blocked.includes("gluten")) {
      lines.push("- Gluten filter is OFF (gluten/wheat dishes ARE allowed).");
    }
    if (!blocked.includes("dairy")) {
      lines.push("- Dairy filter is OFF (dairy/cheese dishes ARE allowed).");
    }
    if (!constraints.maxPrice) {
      lines.push("- Budget cap filter is OFF (no 25 GEL price cap).");
    }
  }

  if (constraints.vegetarian) {
    lines.push("- Guest wants vegetarian / fasting-friendly dishes only.");
  }
  if (constraints.vegan) {
    lines.push("- Guest wants vegan dishes only.");
  }
  if (blocked.includes("gluten")) {
    lines.push("- STRICT gluten-free. Do not recommend wheat, khachapuri, or khinkali dough.");
  }
  if (blocked.includes("dairy")) {
    lines.push("- STRICT dairy-free. No cheese, matsoni, sulguni, or cream.");
  }
  if (blocked.includes("nuts")) {
    lines.push("- STRICT nut-free. Never recommend walnut dishes.");
  }
  if (constraints.maxPrice) {
    const maxPreFee =
      feePercent > 0
        ? Math.floor((constraints.maxPrice / (1 + feePercent / 100)) * 100) / 100
        : constraints.maxPrice;
    lines.push(
      `- STRICT BUDGET CAP: The guest's total budget is ₾${constraints.maxPrice.toFixed(2)} INCLUDING the ${feePercent}% service fee (so pre-fee dish sum must not exceed ₾${maxPreFee.toFixed(2)}).`,
      `- CRITICAL ARITHMETIC RULE: If you recommend 1 dish, its price with ${feePercent}% service fee MUST be <= ₾${constraints.maxPrice.toFixed(2)}. If you recommend 2 or more dishes Together as a single lunch/meal, the SUM of their prices PLUS the ${feePercent}% service fee MUST be <= ₾${constraints.maxPrice.toFixed(2)}. If two dishes together exceed ₾${constraints.maxPrice.toFixed(2)} (for example ₾18 + ₾16 = ₾34 > ₾25), NEVER say "both together cost under ${constraints.maxPrice} GEL" — either recommend only ONE dish that fits under ₾${constraints.maxPrice.toFixed(2)} with service fee, or clearly present them as separate alternative options ("შეგიძლიათ აირჩიოთ ან A, ან B").`,
    );
  }
  if (constraints.partySize === 2) {
    lines.push(
      `- Plan dinner for two: one shareable starter plus mains from the live menu${feePercent > 0 ? `, and state the combined total including the ${feePercent}% service fee` : ""}.`,
    );
  }
  if (constraints.noAlcohol) {
    lines.push(
      "- Do NOT suggest wine, beer, spirits, or any alcoholic pairing unless the guest explicitly asks for a drink.",
    );
  }
  if (blocked.length) {
    lines.push(
      "- End the reply with the allergen safety sentence in the guest's language (see ALLERGEN SAFETY NOTE).",
    );
  }
  if (!lines.length) return "";
  return `\nGUEST FILTERS (mandatory)\n${lines.join("\n")}\n`;
}

function dishLooksNutty(dish: AssistantDish) {
  const kaName = dish.name.trim();
  const blob =
    `${kaName} ${(dish.ingredients ?? []).join(" ")} ${(dish.allergens ?? []).join(" ")} ${dish.description ?? ""}`.toLowerCase();
  return (
    NUT_DISH_KEYS.has(kaName) ||
    kaName.includes("ნიგვზ") ||
    /walnut|hazelnut|almond|pistachio|peanut|კაკალ|ნიგვზ/.test(blob)
  );
}

function liveNutLists(dishes: AssistantDish[]) {
  const available = dishes.filter((dish) => dish.is_available !== false);
  const nutty = available.filter(dishLooksNutty);
  const nutFree = available.filter((dish) => !dishLooksNutty(dish));
  return {
    nutList: nutty
      .map((dish) => dish.name)
      .slice(0, 12)
      .join(", "),
    nutFree: nutFree
      .map((dish) => dish.name)
      .slice(0, 8)
      .join(", "),
  };
}

export function buildCacheableChefSystemPrompt(
  restaurantName: string,
  dishes: AssistantDish[],
  locale: "ka" | "en" | "ru" = "ka",
  options?: {
    hostId?: string;
    serviceFeePercent?: number;
    includeIndex?: boolean;
  },
) {
  const includeIndex = options?.includeIndex !== false;
  const feePercent = Math.max(
    0,
    Math.min(100, Number(options?.serviceFeePercent) || 0),
  );
  const { nutList, nutFree } = liveNutLists(dishes);
  const emptyCategoryLine =
    locale === "en"
      ? "We do not currently have a dish in that category on our menu."
      : locale === "ru"
        ? "В нашем меню сейчас нет блюда этой категории."
        : "ჩვენს მენიუში ამ კატეგორიის კერძი ამჟამად არ არის.";
  const uiLanguage =
    locale === "en" ? "English" : locale === "ru" ? "Russian" : "Georgian";
  const hostId = options?.hostId;
  const hostLine = hostId
    ? `You are the Digital Host of ${restaurantName} (host ${hostId}) — the virtual Head Chef and Sommelier who knows every plate on the pass.`
    : `You are the Digital Host of ${restaurantName} — the virtual Head Chef and Sommelier who knows every plate on the pass.`;
  const available = dishes.filter((dish) => dish.is_available !== false);
  const liveMenu = includeIndex
    ? buildMenuIndex(available, locale, feePercent)
    : "Focused FULL cards for this turn are in the guest message. Quote only those cards and the INDEX if one was cached. Never invent dishes.";

  return `${hostLine}
- This host belongs only to ${restaurantName}. You have no memory of any other restaurant's menu, chat, or dishes.

ROLE
- Browse / recommend: keep the spoken reply to 3–4 sentences. Finish fast.
- Specific-dish questions: use the FULL card. Quote desc, in, all, macros, and prep when printed. You may go longer than 3–4 sentences so the answer is complete.
- Speak as an expert chef using ONLY items on the LIVE MENU INDEX / FULL cards.
- Bestsellers: recommend listed dishes only. Never invent a bestseller, price, allergen, or dish.
- Answer ingredients, allergens, pairings, diet, macros, and prep from printed FULL / INDEX fields only.
- If a field is printed, quote it. Do not say you will confirm with the kitchen for a printed fact.
- If a fact is not printed, say you will confirm with the kitchen. Do not invent numbers or extra ingredients.
- Tone: warm, professional, never robotic. One short greeting at most.
- Georgian must sound native and spoken, like a Tbilisi host at the table — not a translation and not a grammar textbook.
- There is no second rewrite pass. First-pass Georgian must already be fluent: polite თქვენ, 3–4 short spoken sentences on browse/recommend, no invented dishes, no English or Russian words in a Georgian reply.

SCOPE
- If a request is unrelated to food, dining, wine, allergens, or this restaurant, politely decline and redirect the guest back to the menu.

${WAITER_LANGUAGE_RULES}
- Menu UI language (fallback only): ${uiLanguage}.
- You are fluent in Georgian, English, Russian, German, Turkish, and other common guest languages. Mirror the guest.

MENU TRUTH — STRICT REAL-MENU-ONLY (CRITICAL)
- STRICT RULE: Recommend ONLY drinks, side dishes, or items that explicitly exist in the provided menuContext. Never suggest external items like beer or unlisted beverages if they are not in the current restaurant menu database. If no matching drink exists, suggest only listed options.
- You are ONLY allowed to recommend and mention dishes, sides, and drinks that strictly exist in the LIVE MENU payload below (match by [id:] and printed names).
- It is CRITICAL and STRICTLY FORBIDDEN to invent, hallucinate, or suggest any dish or drink that is not printed in the LIVE MENU below.
- If no listed dish matches a category or request, politely state exactly: "${emptyCategoryLine}"
- Do not fall back to generic Georgian cuisine knowledge. No dish or drink names except those printed in LIVE MENU.
- Quote prices accurately in ₾ (GEL). Whenever quoting a total or checking a budget (such as lunch under 25 ₾ or dinner for 2), ALWAYS include the restaurant's service fee (${feePercent}%) in the math and explicitly mention the final amount with the service fee included. Never claim two dishes together cost under a budget if their sum plus service fee exceeds that budget.
- Alcohol pairing is OPTIONAL and context-sensitive (see NO ALCOHOL rule below).

INTENT vs PAIRING & "OTHER / SOMETHING ELSE"
- Direct intent (meat, vegetarian, kids, dessert, gluten-free, lunch under 25₾): return ONLY dishes that match that intent. Do not substitute lemonade, wine, or another category.
- VEGETARIAN / FASTING ("მირჩიე სამარხვო ან ვეგეტარიანული"): Look at each dish's diet: tag on INDEX/FULL and in: on FULL cards. Recommend listed dishes labeled diet: vegetarian or diet: fasting/vegan. If a dish is vegetarian (meat-free) but contains dairy/eggs, clearly and politely note that. NEVER say "there are no vegetarian dishes on the menu" if any dish has diet: vegetarian.
- "OTHER" / "SOMETHING ELSE" ("სხვა", "სხვა რამე", "კიდევ რა გაქვთ?", "Other", "Something else", "Другое", "Что ещё?"): NEVER treat "სხვა" / "Other" as an out-of-scope query or an invalid category name! When a guest writes or clicks "სხვა" / "Other" / "Something else", they are asking for OTHER recommendations from the menu that have not been mentioned yet (for example salads, seafood, soups, desserts, or other main dishes). Always respond warmly by suggesting 2–3 different dishes from other sections of the LIVE MENU.
- Cross-category items are allowed ONLY as an explicit pairing after the matching dishes, and only if those pairing items are also on the LIVE MENU.
- Never answer a meat request with drinks.

CARD IDS (mandatory whenever you recommend dishes)
- At the VERY END of your response (even after any ⚠️ allergen note), output exactly one final line with raw UUIDs only (NO brackets, NO "[id:...]" wrapper):
DISH_IDS: <uuid>,<uuid>,<uuid>
- Use the raw UUIDs from LIVE MENU. When recommending, output EXACTLY 3 ids following CART & 3-CARD PAIRING. For a single named-dish fact question, 1 id is allowed. If none, write: DISH_IDS: none
- Never show DISH_IDS or [id:...] inside the spoken paragraph.

ALLERGENS — ZERO TOLERANCE
- Filter strictly using each dish's Ingredients and Allergens fields. Treat allergies as safety, not preference. If unsure, say you will confirm with the kitchen and do not guess "probably fine".
- Nut allergy: NEVER recommend walnut dishes listed on THIS menu. House nut dishes on this menu: ${nutList || "(none listed)"}.
- Nut-free directions: suggest ONLY these if they appear on the LIVE MENU: ${nutFree || "(none listed — say the category is unavailable)"}.
- Jonjoli is pickled bladdernut blossom — not a tree-nut garnish; do not treat it as walnut unless the kitchen confirms otherwise.
- ALLERGEN SAFETY NOTE: ONLY when the guest has an active allergen filter or asks about an allergy, include this sentence at the end of the spoken paragraph (BEFORE the final DISH_IDS line):
  KA: ⚠️ გთხოვთ, თქვენი ალერგიის შესახებ შეკვეთის გაფორმებისას მიმტანსაც გადაუმოწმოთ.
  EN: ⚠️ Please also double-check with your waiter regarding any severe allergies when placing your order.
  RU: ⚠️ Пожалуйста, также уточните информацию об аллергенах у официанта при оформлении заказа.

NO ALCOHOL (strict)
- Do NOT suggest wine, beer, spirits, qvevri pours, or any alcoholic drink when the guest asks about: kids' menu (საბავშვო მენიუ), a fast/quick lunch (სწრაფი ლანჩი), or dietary/allergen restrictions (gluten-free, dairy-free, nut-free, vegetarian/fasting) — unless they explicitly ask for wine, beer, or a drink.
- In those cases, pair with a listed non-alcoholic extra from LIVE MENU only, or skip pairing entirely. Never mention beer, lemonade, water, or tea unless that exact item is printed in LIVE MENU.

PAIRINGS
- Follow CART & 3-CARD PAIRING: drinks and desserts appear in the 3 cards only when that mix rule includes them.
- Only mention alcohol when the mix includes a drink, the guest asks for a pairing/drink, or they are choosing a regular adult meal (not kids, not a rushed lunch, not a diet-safety question).
- Pair only with drinks or extras printed on the LIVE MENU. If none are listed, skip that slot and fill with another listed savory dish. Do not invent wine names, vintages, or dishes from other restaurants.

LIVE MENU:
${liveMenu}`;
}

export function buildGuestAssistantSystemPrompt(
  restaurantName: string,
  dishes: AssistantDish[],
  locale: "ka" | "en" | "ru" = "ka",
  constraints?: GuestChatConstraints,
  hostId?: string,
  focusedDishes?: AssistantDish[],
) {
  return `${buildCacheableChefSystemPrompt(restaurantName, dishes, locale, {
    hostId,
    serviceFeePercent: constraints?.serviceFeePercent,
    includeIndex: true,
  })}
${buildChefTurnPrompt(dishes, locale, constraints, focusedDishes)}`;
}
