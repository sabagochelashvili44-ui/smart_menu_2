export type CrossSellKind = "drink" | "side" | "dessert";

export type CrossSellDish = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  pairReason?: string;
};

type CategoryRef = { id: string; name: string };

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function companionKind(categoryName: string): CrossSellKind | null {
  const name = normalize(categoryName);
  if (
    includesAny(name, [
      "drink",
      "wine",
      "beer",
      "spirit",
      "სასმელ",
      "ღვინო",
      "ლუდი",
      "напит",
      "вино",
      "пиво",
    ])
  ) {
    return "drink";
  }
  if (
    includesAny(name, [
      "dessert",
      "sweet",
      "დესერტ",
      "ტკბილ",
      "десерт",
    ])
  ) {
    return "dessert";
  }
  if (
    includesAny(name, [
      "side",
      "bread",
      "garnish",
      "sauce",
      "tkemali",
      "adjika",
      "ketchup",
      "გარნირ",
      "პური",
      "სოუს",
      "ტყემალ",
      "აჯიკა",
      "гарнир",
      "хлеб",
      "соус",
      "ткемали",
      "аджика",
    ])
  ) {
    return "side";
  }
  return null;
}

const BURGER_HINTS = [
  "burger",
  "hamburger",
  "cheeseburger",
  "ბურგერ",
  "гамбургер",
  "бургер",
];

const SAUCE_HINTS = [
  "sauce",
  "სოუს",
  "соус",
  "tkemali",
  "ტყემალ",
  "ткемали",
  "adjika",
  "აჯიკა",
  "аджика",
  "ketchup",
  "mayo",
  "mustard",
  "aioli",
];

function isBurgerName(name: string) {
  return includesAny(normalize(name), BURGER_HINTS);
}

function isSauceName(name: string) {
  return includesAny(normalize(name), SAUCE_HINTS);
}

export function isAnchorCategory(categoryName: string) {
  if (companionKind(categoryName)) return false;
  const name = normalize(categoryName);
  return includesAny(name, [
    "khachapuri",
    "ხაჭაპურ",
    "хачапур",
    "khinkali",
    "ხინკალ",
    "хинкал",
    "main",
    "grill",
    "fish",
    "თევზ",
    "მწვად",
    "ძირითად",
    "starter",
    "salad",
    "soup",
    "სალათ",
    "სუპ",
    "vegetarian",
    "ვეგეტარ",
    "burger",
    "ბურგერ",
    "бургер",
  ]);
}

function kindOfDish(
  dish: CrossSellDish,
  categories: CategoryRef[],
): CrossSellKind | null {
  const category =
    categories.find((row) => row.id === dish.category_id)?.name ?? "";
  const fromCategory = companionKind(category);
  if (fromCategory) return fromCategory;
  if (isSauceName(dish.name)) return "side";
  return null;
}

function hashSeed(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = Math.trunc(hash * 31 + (char.codePointAt(0) ?? 0));
  }
  return Math.abs(hash);
}

function rotate<T>(items: T[], seed: number) {
  if (items.length < 2) return items;
  const offset = seed % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function drinkBoost(dishName: string, hints: string[]) {
  if (!hints.length) return 0;
  const name = normalize(dishName);
  return hints.some((hint) => name.includes(hint)) ? 1 : 0;
}

function drinkHintsForAnchor(anchorName: string, categoryName: string) {
  const blob = normalize(`${anchorName} ${categoryName}`);
  if (includesAny(blob, BURGER_HINTS)) {
    return [
      "beer",
      "ლუდი",
      "пиво",
      "natakhtari",
      "ნატახტარ",
      "kazbegi",
      "ყაზბეგ",
    ];
  }
  if (includesAny(blob, ["khinkali", "ხინკალ", "хинкал"])) {
    return ["beer", "ლუდი", "пиво", "lemonade", "limon", "tarragon", "ტარხუნ"];
  }
  if (includesAny(blob, ["khachapuri", "ხაჭაპურ", "хачапур"])) {
    return ["lemonade", "limon", "tarragon", "ტარხუნ"];
  }
  if (includesAny(blob, ["chicken", "ქათამ", "fish", "თევზ", "shrimp"])) {
    return ["lemonade", "limon", "rkatsiteli", "რქაწითელ"];
  }
  if (includesAny(blob, ["mtsvadi", "მწვად", "chashushuli", "ჩაშუშულ"])) {
    return ["saperavi", "საფერავ", "kindzmarauli", "ქინძმარაულ"];
  }
  return [];
}

const KIND_ORDER: CrossSellKind[] = ["drink", "side", "dessert"];

function cartContext(
  dishes: CrossSellDish[],
  categories: CategoryRef[],
  inCart: Set<string>,
  lastAddedId?: string,
) {
  const categoryById = new Map(categories.map((row) => [row.id, row.name]));
  const cartKinds = new Set<CrossSellKind>();
  let hasAnchor = false;
  let lastIsDrink = false;
  let hints: string[] = [];
  let lastHints: string[] = [];
  for (const dish of dishes) {
    if (!inCart.has(dish.id)) continue;
    const category = categoryById.get(dish.category_id) ?? "";
    const kind = kindOfDish(dish, categories);
    if (kind) cartKinds.add(kind);
    if (lastAddedId && dish.id === lastAddedId && kind === "drink") {
      lastIsDrink = true;
    }
    const burger = isBurgerName(dish.name);
    if (isAnchorCategory(category) || burger) {
      hasAnchor = true;
      const nextHints = drinkHintsForAnchor(dish.name, category);
      if (!hints.length) hints = nextHints;
      if (lastAddedId && dish.id === lastAddedId) lastHints = nextHints;
    }
  }
  return {
    cartKinds,
    hasAnchor,
    lastIsDrink,
    hints: lastHints.length ? lastHints : hints,
  };
}

function sortCompanions(
  dishes: CrossSellDish[],
  kind: CrossSellKind,
  hints: string[],
  seedValue: number,
) {
  const sorted = [...dishes].sort((left, right) => {
    const imageDelta =
      Number(Boolean(right.image_url?.trim())) -
      Number(Boolean(left.image_url?.trim()));
    if (imageDelta) return imageDelta;
    if (kind === "drink") {
      const boost = drinkBoost(right.name, hints) - drinkBoost(left.name, hints);
      if (boost) return boost;
    }
    return left.price - right.price || left.name.localeCompare(right.name);
  });
  return rotate(sorted, seedValue);
}

function pickFromKinds(
  fillOrder: CrossSellKind[],
  byKind: Record<CrossSellKind, CrossSellDish[]>,
  limit: number,
) {
  const picked: CrossSellDish[] = [];
  const used = new Set<string>();
  for (const kind of fillOrder) {
    if (picked.length >= limit) break;
    const next = byKind[kind].find((dish) => !used.has(dish.id));
    if (!next) continue;
    used.add(next.id);
    picked.push(next);
  }
  for (const kind of fillOrder) {
    for (const dish of byKind[kind]) {
      if (picked.length >= limit) break;
      if (used.has(dish.id)) continue;
      used.add(dish.id);
      picked.push(dish);
    }
  }
  return picked.slice(0, limit);
}

export function pickCrossSells({
  dishes,
  categories,
  cartIds,
  seed = "",
  lastAddedId,
  limit = 3,
}: {
  dishes: CrossSellDish[];
  categories: CategoryRef[];
  cartIds: Iterable<string>;
  seed?: string;
  lastAddedId?: string;
  limit?: number;
}): CrossSellDish[] {
  const inCart = new Set(cartIds);
  const { cartKinds, hasAnchor, lastIsDrink, hints } = cartContext(
    dishes,
    categories,
    inCart,
    lastAddedId || seed,
  );
  if (lastIsDrink) {
    cartKinds.add("drink");
  }
  if (!hasAnchor && !lastIsDrink) return [];

  const byKind: Record<CrossSellKind, CrossSellDish[]> = {
    drink: [],
    side: [],
    dessert: [],
  };
  for (const dish of dishes) {
    if (!dish.is_available || inCart.has(dish.id)) continue;
    const kind = kindOfDish(dish, categories);
    if (!kind) continue;
    byKind[kind].push(dish);
  }

  const seedValue = hashSeed(seed);
  for (const kind of KIND_ORDER) {
    byKind[kind] = sortCompanions(byKind[kind], kind, hints, seedValue);
  }

  const missing = KIND_ORDER.filter((kind) => !cartKinds.has(kind));
  const fillOrder = lastIsDrink
    ? (["side", "dessert"] as CrossSellKind[])
    : [
        ...missing,
        ...KIND_ORDER.filter((kind) => cartKinds.has(kind) && kind !== "drink"),
      ];
  return pickFromKinds(fillOrder, byKind, limit);
}
