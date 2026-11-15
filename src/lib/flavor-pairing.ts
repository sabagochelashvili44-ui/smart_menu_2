export type FlavorTag =
  | "red_meat"
  | "poultry"
  | "seafood"
  | "dairy_rich"
  | "dumpling"
  | "pastry"
  | "spicy"
  | "smoky_grill"
  | "soup"
  | "salad"
  | "dessert"
  | "sauce"
  | "bread"
  | "beer"
  | "red_wine"
  | "white_wine"
  | "non_alc"
  | "cocktail"
  | "acidic"
  | "rich"
  | "savory"
  | "sweet"
  | "herbal"
  | "creamy"
  | "citrus"
  | "pickled";

export type FlavorCourse = "dish" | "dessert" | "drink";

export type FlavorReasonKey =
  | "cutRich"
  | "coolSpice"
  | "grillMatch"
  | "seafoodMatch"
  | "dairyBalance"
  | "sweetFinish"
  | "drinkLift"
  | "wineListed"
  | "shareTable";

export type RankedCompanion = {
  dish: FlavorDish;
  score: number;
  reason: FlavorReasonKey;
};

export type FlavorDish = {
  id: string;
  name: string;
  description?: string | null;
  ingredients?: string[] | null;
  category: string;
  wine_pairing?: string | null;
  price: number;
  image_url?: string | null;
  is_available: boolean;
};

const ALCOHOL: FlavorTag[] = ["beer", "red_wine", "white_wine", "cocktail"];
const DRINK_TAGS: FlavorTag[] = [...ALCOHOL, "non_alc"];
const PROTEIN_MAINS: FlavorTag[] = [
  "red_meat",
  "poultry",
  "seafood",
  "dumpling",
];

const TAG_KEYWORDS: Record<FlavorTag, string[]> = {
  red_meat: [
    "mtsvadi",
    "მწვად",
    "chashushuli",
    "ჩაშუშულ",
    "beef",
    "veal",
    "ხბოს",
    "საქონლ",
    "pork",
    "ღორ",
    "lamb",
    "steak",
    "говяд",
    "телят",
    "свин",
  ],
  poultry: [
    "chicken",
    "ქათამ",
    "ქათმ",
    "poultry",
    "куриц",
    "shkmeruli",
    "შქმერულ",
  ],
  seafood: [
    "fish",
    "თევზ",
    "trout",
    "shrimp",
    "seafood",
    "mussel",
    "calamari",
    "рыб",
    "კრევეტ",
    "კალმარ",
    "миди",
  ],
  dairy_rich: [
    "khachapuri",
    "ხაჭაპურ",
    "хачапур",
    "cheese",
    "ყველ",
    "sulguni",
    "სულგუნ",
    "cream",
    "ნაღებ",
  ],
  dumpling: ["khinkali", "ხინკალ", "хинкал"],
  pastry: [
    "khachapuri",
    "ხაჭაპურ",
    "хачапур",
    "pastry",
    "ცომეულ",
    "pizza",
    "პიცა",
  ],
  spicy: [
    "spicy",
    "adjika",
    "აჯიკა",
    "pepper",
    "წიწაკ",
    "kharcho",
    "ხარჩო",
  ],
  smoky_grill: [
    "mtsvadi",
    "მწვად",
    "charcoal",
    "შამფურ",
    "мангал",
    "burger",
    "hamburger",
    "ბურგერ",
    "бургер",
  ],
  soup: ["soup", "სუპ", "суп", "kharcho", "ხარჩო", "chikhirtma"],
  salad: ["salad", "სალათ", "салат", "pkhali", "ფხალ"],
  dessert: [
    "dessert",
    "დესერტ",
    "десерт",
    "cake",
    "fondant",
    "ice cream",
    "ნაყინ",
  ],
  sauce: [
    "sauce",
    "სოუს",
    "соус",
    "tkemali",
    "ტყემალ",
    "adjika",
    "ketchup",
    "aioli",
  ],
  bread: ["bread", "პური", "хлеб", "shoti"],
  beer: [
    "beer",
    "ლუდი",
    "пиво",
    "natakhtari",
    "kazbegi",
    "ნატახტარ",
    "ყაზბეგ",
    "lager",
    "ipa",
  ],
  red_wine: [
    "saperavi",
    "საფერავ",
    "kindzmarauli",
    "ქინძმარაულ",
    "mukuzani",
    "მუკუზან",
    "red wine",
    "წითელი ღვინო",
  ],
  white_wine: [
    "rkatsiteli",
    "რქაწითელ",
    "tsinandali",
    "kisi",
    "amber",
    "ქარვ",
    "თეთრი ღვინო",
    "white wine",
  ],
  non_alc: [
    "lemonade",
    "ლიმონათ",
    "juice",
    "წვენ",
    "coffee",
    "ყავა",
    "tea",
    "ჩაი",
    "tarragon",
    "ტარხუნ",
    "soda",
    "limon",
  ],
  cocktail: [
    "cocktail",
    "კოქტეილ",
    "gin",
    "ჯინ",
    "mojito",
    "aperol",
    "highball",
  ],
  acidic: [
    "tkemali",
    "ტყემალ",
    "vinegar",
    "ძმარ",
    "tomato",
    "პომიდორ",
    "wine",
    "ღვინ",
    "adjika",
    "აჯიკა",
  ],
  rich: [
    "butter",
    "კარაქ",
    "cream",
    "ნაღებ",
    "fatty",
    "walnut",
    "ნიგვზ",
    "slow-braised",
    "braised",
  ],
  savory: [
    "grill",
    "მწვად",
    "garlic",
    "ნიორ",
    "mushroom",
    "სოკო",
    "umami",
    "broth",
    "ბულიონ",
  ],
  sweet: [
    "honey",
    "თაფლ",
    "sugar",
    "შაქარ",
    "chocolate",
    "შოკოლად",
    "ice cream",
    "ნაყინ",
    "dessert",
    "დესერტ",
  ],
  herbal: [
    "cilantro",
    "ქინძ",
    "tarragon",
    "ტარხუნ",
    "rosemary",
    "parsley",
    "ოკრა",
    "ბაზილ",
    "mint",
    "პიტნ",
  ],
  creamy: [
    "cream",
    "ნაღებ",
    "matsoni",
    "მაწონ",
    "sulguni",
    "სულგუნ",
    "cheese",
    "ყველ",
  ],
  citrus: [
    "lemon",
    "ლიმონ",
    "lime",
    "orange",
    "ციტრუს",
    "citrus",
  ],
  pickled: [
    "pickle",
    "მწნილ",
    "jonjoli",
    "ჯონჯოლ",
    "pickled",
    "маринад",
  ],
};

const BURGER_HINTS = [
  "burger",
  "hamburger",
  "cheeseburger",
  "ბურგერ",
  "гамбургер",
  "бургер",
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function flavorBlob(dish: FlavorDish) {
  return normalize(
    `${dish.name} ${dish.description ?? ""} ${(dish.ingredients ?? []).join(" ")} ${dish.category}`,
  );
}

const DRINK_TAG_SET = new Set<FlavorTag>(DRINK_TAGS);

export function tagsOf(dish: FlavorDish): FlavorTag[] {
  const blob = flavorBlob(dish);
  const nameAndCategory = normalize(`${dish.name} ${dish.category}`);
  const drinkCategory = includesAny(nameAndCategory, [
    "სასმელ",
    "drink",
    "wine",
    "beer",
    "напит",
    "вино",
    "ღვინო",
    "cocktail",
    "lemonade",
    "ლიმონათ",
  ]);
  const tags = (Object.keys(TAG_KEYWORDS) as FlavorTag[]).filter((tag) => {
    const hay =
      DRINK_TAG_SET.has(tag) || tag === "sauce" ? nameAndCategory : blob;
    return includesAny(hay, TAG_KEYWORDS[tag]);
  });
  if (drinkCategory && !tags.some((tag) => DRINK_TAG_SET.has(tag))) {
    tags.push("non_alc");
  }
  if (
    includesAny(blob, ["khachapuri", "ხაჭაპურ", "хачапур"]) &&
    tags.includes("bread")
  ) {
    return tags.filter((tag) => tag !== "bread");
  }
  return tags;
}

function isBurger(dish: FlavorDish) {
  return includesAny(flavorBlob(dish), BURGER_HINTS);
}

function isDrink(tags: FlavorTag[]) {
  return tags.some((tag) => DRINK_TAGS.includes(tag));
}

function isAlcohol(tags: FlavorTag[]) {
  return tags.some((tag) => ALCOHOL.includes(tag));
}

function isProteinMain(tags: FlavorTag[]) {
  return tags.some((tag) => PROTEIN_MAINS.includes(tag));
}

function isSideLike(tags: FlavorTag[]) {
  if (tags.includes("salad") || tags.includes("bread") || tags.includes("dessert")) {
    return true;
  }
  return tags.includes("sauce") && !isProteinMain(tags);
}

export function pairingWants(last: FlavorDish): {
  want: Set<FlavorTag>;
  avoid: Set<FlavorTag>;
} {
  const tags = tagsOf(last);
  const want = new Set<FlavorTag>();
  const avoid = new Set<FlavorTag>();

  if (tags.includes("non_alc") || tags.includes("dessert")) {
    for (const tag of ALCOHOL) avoid.add(tag);
  }
  if (isDrink(tags)) {
    for (const tag of DRINK_TAGS) avoid.add(tag);
  }

  if (tags.includes("non_alc")) {
    for (const tag of [
      "pastry",
      "dairy_rich",
      "salad",
      "bread",
      "dessert",
    ] as const) {
      want.add(tag);
    }
  } else if (tags.includes("cocktail")) {
    for (const tag of [
      "pastry",
      "salad",
      "dairy_rich",
      "spicy",
      "dessert",
    ] as const) {
      want.add(tag);
    }
  } else if (tags.includes("red_wine")) {
    for (const tag of ["red_meat", "smoky_grill", "dairy_rich"] as const) {
      want.add(tag);
    }
  } else if (tags.includes("white_wine")) {
    for (const tag of ["poultry", "seafood", "salad", "dairy_rich"] as const) {
      want.add(tag);
    }
  } else if (tags.includes("beer")) {
    for (const tag of ["dumpling", "red_meat", "smoky_grill", "spicy"] as const) {
      want.add(tag);
    }
  } else if (tags.includes("dumpling")) {
    for (const tag of ["beer", "non_alc", "sauce", "salad"] as const) {
      want.add(tag);
    }
    avoid.add("red_wine");
    avoid.add("white_wine");
    avoid.add("cocktail");
  } else if (isBurger(last)) {
    for (const tag of ["beer", "sauce"] as const) want.add(tag);
    avoid.add("red_wine");
    avoid.add("white_wine");
    avoid.add("cocktail");
  } else if (tags.includes("red_meat") || tags.includes("smoky_grill")) {
    for (const tag of ["red_wine", "sauce", "salad"] as const) want.add(tag);
    avoid.add("white_wine");
  } else if (tags.includes("poultry") || tags.includes("seafood")) {
    for (const tag of ["white_wine", "non_alc", "bread", "salad"] as const) {
      want.add(tag);
    }
    avoid.add("red_wine");
  } else if (tags.includes("dairy_rich") || tags.includes("pastry")) {
    for (const tag of ["non_alc", "red_wine", "salad"] as const) want.add(tag);
    for (const tag of PROTEIN_MAINS) avoid.add(tag);
  } else if (tags.includes("soup")) {
    for (const tag of ["bread", "salad"] as const) want.add(tag);
  } else if (tags.includes("salad")) {
    for (const tag of ["bread", "non_alc", "white_wine"] as const) want.add(tag);
  } else if (tags.includes("spicy")) {
    for (const tag of ["beer", "non_alc", "bread"] as const) want.add(tag);
  }

  return { want, avoid };
}

function winePairingHits(blob: string, pairing: string) {
  const tokens = normalize(pairing)
    .split(/[\s,;/+()]+/)
    .filter((token) => token.length >= 4);
  if (!tokens.length) return 0;
  return tokens.filter((token) => blob.includes(token)).length;
}

function candidateKind(tags: FlavorTag[]): "drink" | "side" | "dessert" | "food" {
  if (tags.includes("dessert")) return "dessert";
  if (isDrink(tags)) return "drink";
  if (isSideLike(tags)) return "side";
  return "food";
}

export function flavorCourse(dish: FlavorDish): FlavorCourse {
  const tags = tagsOf(dish);
  if (tags.includes("dessert")) return "dessert";
  if (isDrink(tags)) return "drink";
  const category = normalize(dish.category);
  if (
    includesAny(category, [
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
    includesAny(category, [
      "drink",
      "wine",
      "beer",
      "bar",
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
  return "dish";
}

export function cartHasCourse(cart: FlavorDish[], course: FlavorCourse) {
  return cart.some((dish) => flavorCourse(dish) === course);
}

/** A: 3 dishes. B: dessert, no drink → 2 dishes + dessert. Drink only → 2 dishes + drink. C: both → 1 of each.
 *  When the cart is savory-only but admin curated a drink/dessert companion, reserve that slot. */
export function cartRecommendationSlots(
  hasDessert: boolean,
  hasDrink: boolean,
  options?: { preferDrink?: boolean; preferDessert?: boolean },
): FlavorCourse[] {
  if (hasDessert && hasDrink) return ["dish", "dessert", "drink"];
  if (hasDessert) return ["dish", "dish", "dessert"];
  if (hasDrink) return ["dish", "dish", "drink"];
  const preferDrink = Boolean(options?.preferDrink);
  const preferDessert = Boolean(options?.preferDessert);
  if (preferDessert && preferDrink) return ["dish", "dessert", "drink"];
  if (preferDessert) return ["dish", "dish", "dessert"];
  if (preferDrink) return ["dish", "dish", "drink"];
  return ["dish", "dish", "dish"];
}

function hasTag(tags: FlavorTag[], wanted: FlavorTag[]) {
  return tags.some((tag) => wanted.includes(tag));
}

function familyKey(dish: FlavorDish) {
  const blob = flavorBlob(dish);
  if (includesAny(blob, ["khinkali", "ხინკალ", "хинкал"])) return "khinkali";
  if (includesAny(blob, ["khachapuri", "ხაჭაპურ", "хачапур"])) return "khachapuri";
  if (includesAny(blob, BURGER_HINTS)) return "burger";
  return normalize(dish.name).slice(0, 12);
}

export function scoreFlavorPair(
  last: FlavorDish,
  candidate: FlavorDish,
): {
  score: number;
  pairing: boolean;
  wineMatch: boolean;
  reason: FlavorReasonKey;
} {
  const lastTags = tagsOf(last);
  const candidateTags = tagsOf(candidate);
  const { want, avoid } = pairingWants(last);
  const lastCourse = flavorCourse(last);
  const nextCourse = flavorCourse(candidate);

  if (last.id === candidate.id) {
    return { score: 0, pairing: false, wineMatch: false, reason: "shareTable" };
  }
  if (isDrink(lastTags) && isDrink(candidateTags)) {
    return { score: 0, pairing: false, wineMatch: false, reason: "drinkLift" };
  }

  let wineMatch = false;
  const pairingNote = last.wine_pairing?.trim();
  if (
    pairingNote &&
    lastCourse === "dish" &&
    nextCourse === "drink" &&
    !candidateTags.some((tag) => avoid.has(tag))
  ) {
    wineMatch = winePairingHits(flavorBlob(candidate), pairingNote) > 0;
  }

  let score = 1;
  let reason: FlavorReasonKey = "shareTable";
  let bestBump = 0;
  const bump = (amount: number, key: FlavorReasonKey) => {
    if (amount <= 0) return;
    score += amount;
    if (amount > bestBump) {
      bestBump = amount;
      reason = key;
    }
  };

  if (
    hasTag(lastTags, ["rich", "creamy", "dairy_rich"]) &&
    hasTag(candidateTags, ["acidic", "citrus", "pickled", "salad"])
  ) {
    bump(8, "cutRich");
  }
  if (
    lastTags.includes("spicy") &&
    hasTag(candidateTags, ["dairy_rich", "creamy", "non_alc", "sweet", "bread"])
  ) {
    bump(8, "coolSpice");
  }
  if (
    hasTag(lastTags, ["red_meat", "smoky_grill", "savory"]) &&
    hasTag(candidateTags, ["red_wine", "salad", "sauce", "acidic", "pickled"])
  ) {
    bump(7, "grillMatch");
  }
  if (
    hasTag(lastTags, ["poultry", "seafood"]) &&
    hasTag(candidateTags, ["white_wine", "citrus", "salad", "non_alc", "herbal"])
  ) {
    bump(7, "seafoodMatch");
  }
  if (
    hasTag(lastTags, ["dairy_rich", "pastry", "creamy"]) &&
    hasTag(candidateTags, ["salad", "acidic", "non_alc", "citrus"])
  ) {
    bump(6, "dairyBalance");
  }
  if (lastCourse === "dish" && nextCourse === "dessert") {
    bump(6, "sweetFinish");
  }
  if (nextCourse === "drink") {
    bump(5, "drinkLift");
  }

  const hits = candidateTags.filter((tag) => want.has(tag)).length;
  bump(hits * 4, reason);
  if (wineMatch) bump(12, "wineListed");

  const lastKind = candidateKind(lastTags);
  const nextKind = candidateKind(candidateTags);
  if (lastKind !== nextKind) score += 3;
  if (nextKind === "side") score += 2;
  if (candidate.image_url?.trim()) score += 0.2;

  if (familyKey(last) === familyKey(candidate)) score -= 6;
  if (
    isProteinMain(lastTags) &&
    isProteinMain(candidateTags) &&
    !isSideLike(candidateTags)
  ) {
    score -= 3;
  }
  if (candidateTags.some((tag) => avoid.has(tag)) && nextCourse === "drink") {
    score -= 8;
  }

  const pairing = score > 1;
  return {
    score: Math.max(0, score),
    pairing,
    wineMatch,
    reason,
  };
}

function scoreAgainstCart(cart: FlavorDish[], candidate: FlavorDish) {
  if (!cart.length) {
    return {
      score: candidate.image_url?.trim() ? 1.2 : 1,
      pairing: false,
      wineMatch: false,
      reason: "shareTable" as FlavorReasonKey,
    };
  }
  let best = {
    score: 0,
    pairing: false,
    wineMatch: false,
    reason: "shareTable" as FlavorReasonKey,
  };
  for (const item of cart) {
    const next = scoreFlavorPair(item, candidate);
    if (
      next.score > best.score ||
      (next.score === best.score && next.wineMatch && !best.wineMatch)
    ) {
      best = next;
    }
  }
  return best;
}

export function pickFlavorCompanions({
  last,
  dishes,
  inCart,
  limit = 3,
}: {
  last: FlavorDish;
  dishes: FlavorDish[];
  inCart: Set<string>;
  limit?: number;
}): FlavorDish[] {
  const lastTags = tagsOf(last);
  const ranked = dishes
    .filter((dish) => dish.is_available && dish.id !== last.id && !inCart.has(dish.id))
    .map((dish) => ({ dish, ...scoreFlavorPair(last, dish) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (left.wineMatch !== right.wineMatch) return left.wineMatch ? -1 : 1;
      return right.score - left.score || left.dish.price - right.dish.price;
    });

  const picked: FlavorDish[] = [];
  const usedKinds = new Set<string>();
  let alcoholCount = 0;
  let drinkCount = isDrink(lastTags) ? 1 : 0;

  function complementary(tags: FlavorTag[]) {
    if (isDrink(lastTags) !== isDrink(tags)) return true;
    return isSideLike(tags) || tags.includes("dessert") || tags.includes("sauce");
  }

  function accept(row: (typeof ranked)[number], requireComplement: boolean) {
    const tags = tagsOf(row.dish);
    const kind = candidateKind(tags);
    if (kind === "drink" && drinkCount >= 1) return false;
    if (isAlcohol(tags) && alcoholCount >= 1) return false;
    if (requireComplement && !complementary(tags)) return false;
    if (usedKinds.has(kind) && picked.length > 0 && requireComplement) {
      return false;
    }
    picked.push(row.dish);
    usedKinds.add(kind);
    if (kind === "drink") drinkCount += 1;
    if (isAlcohol(tags)) alcoholCount += 1;
    return true;
  }

  for (const row of ranked) {
    if (picked.length >= limit) break;
    accept(row, true);
  }
  if (picked.length < limit) {
    for (const row of ranked) {
      if (picked.length >= limit) break;
      if (picked.some((dish) => dish.id === row.dish.id)) continue;
      accept(row, false);
    }
  }
  return picked.slice(0, limit);
}

export function pickCartAwareCompanions({
  cart,
  dishes,
  inCart,
  limit = 3,
}: {
  cart: FlavorDish[];
  dishes: FlavorDish[];
  inCart: Set<string>;
  limit?: number;
}): RankedCompanion[] {
  const hasDessert = cartHasCourse(cart, "dessert");
  const hasDrink = cartHasCourse(cart, "drink");
  const slots = cartRecommendationSlots(hasDessert, hasDrink).slice(0, limit);
  const pool = dishes.filter(
    (dish) => dish.is_available && !inCart.has(dish.id),
  );
  const ranked = pool
    .map((dish) => ({ dish, ...scoreAgainstCart(cart, dish) }))
    .sort((left, right) => {
      if (left.wineMatch !== right.wineMatch) return left.wineMatch ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      return left.dish.price - right.dish.price;
    });

  const picked: RankedCompanion[] = [];
  const used = new Set<string>();
  const usedFamilies = new Set<string>();

  function take(
    course: FlavorCourse,
    opts: { strict: boolean; diversity: boolean },
  ) {
    const next = ranked.find((row) => {
      if (used.has(row.dish.id)) return false;
      if (opts.strict && flavorCourse(row.dish) !== course) return false;
      if (opts.diversity && usedFamilies.has(familyKey(row.dish))) return false;
      return true;
    });
    if (!next) return false;
    used.add(next.dish.id);
    usedFamilies.add(familyKey(next.dish));
    picked.push(next);
    return true;
  }

  for (const course of slots) {
    if (picked.length >= limit) break;
    if (!take(course, { strict: true, diversity: true })) {
      take(course, { strict: true, diversity: false });
    }
  }

  if (picked.length < limit) {
    const needed = [...slots];
    for (const row of picked) {
      const index = needed.indexOf(flavorCourse(row.dish));
      if (index >= 0) needed.splice(index, 1);
    }
    for (const course of needed) {
      if (picked.length >= limit) break;
      take(course, { strict: true, diversity: false });
    }
  }

  if (picked.length < limit) {
    for (const row of ranked) {
      if (picked.length >= limit) break;
      if (used.has(row.dish.id)) continue;
      if (!slots.includes(flavorCourse(row.dish))) continue;
      used.add(row.dish.id);
      usedFamilies.add(familyKey(row.dish));
      picked.push(row);
    }
  }

  return picked.slice(0, limit);
}
