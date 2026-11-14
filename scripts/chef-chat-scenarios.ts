/**
 * Local chef-chat scenario suite (≥100). No Gemini calls — cost paths stay $0.
 * Run: npx tsx --tsconfig tsconfig.json scripts/chef-chat-scenarios.ts
 */
import {
  buildCacheableChefSystemPrompt,
  buildChefTurnPrompt,
  extractHistoryDishIds,
  pickFocusedDishes,
  type AssistantDish,
} from "../src/lib/ai-assistant";
import {
  buildLocalChefFactReply,
  buildLocalChefRecommendReply,
  detectChefFactKind,
  matchNamedDishForFact,
} from "../src/lib/chef-local-facts";
import {
  dishesForLiveStock,
  dishesFromIds,
  guestAskedForAlcohol,
  isChefFactTurn,
  isChefRecommendTurn,
  matchDishesInReply,
  menuHasDessert,
  menuHasDrink,
  menuHasKids,
  menuHasKhinkali,
  pairingLine,
  parseChefReply,
  pickQuizDishes,
  routeChefModel,
  scrubChefInstructionLeak,
  shouldSuppressAlcohol,
  toggleAllergen,
  visibleChefText,
  type ChatSuggestDish,
} from "../src/lib/chat-suggestions";
import {
  dishDietLabels,
  dishMatchesDiet,
  emptyDietFilter,
  inferDietFromText,
} from "../src/lib/guest-diet";
import { readAiWaiterReply } from "../src/lib/ai-waiter-client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Scenario = {
  id: string;
  name: string;
  run: () => void | Promise<void>;
};

const fails: string[] = [];
const passes: string[] = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function eq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function includes(hay: string, needle: string | RegExp, msg: string) {
  const ok =
    typeof needle === "string" ? hay.includes(needle) : needle.test(hay);
  if (!ok) throw new Error(`${msg}: missing ${String(needle)} in ${hay.slice(0, 180)}`);
}

function excludes(hay: string, needle: string | RegExp, msg: string) {
  const bad =
    typeof needle === "string" ? hay.includes(needle) : needle.test(hay);
  if (bad) throw new Error(`${msg}: found forbidden ${String(needle)}`);
}

const ID = {
  lobio: "11111111-1111-1111-1111-111111111101",
  pkhali: "11111111-1111-1111-1111-111111111102",
  badrijani: "11111111-1111-1111-1111-111111111103",
  khachapuri: "11111111-1111-1111-1111-111111111104",
  khinkali: "11111111-1111-1111-1111-111111111105",
  mtsvadi: "11111111-1111-1111-1111-111111111106",
  salad: "11111111-1111-1111-1111-111111111107",
  kids: "11111111-1111-1111-1111-111111111108",
  dessert: "11111111-1111-1111-1111-111111111109",
  wine: "11111111-1111-1111-1111-111111111110",
  lemonade: "11111111-1111-1111-1111-111111111111",
  soldOut: "11111111-1111-1111-1111-111111111112",
  elarji: "11111111-1111-1111-1111-111111111113",
  churchkhela: "11111111-1111-1111-1111-111111111114",
  soup: "11111111-1111-1111-1111-111111111115",
};

const menu: AssistantDish[] = [
  {
    id: ID.lobio,
    name: "ლობიო",
    name_en: "Lobio",
    name_ru: "Лобио",
    description: "შებოლილი ლობიო ქინძით",
    price: 12,
    category: "ცხელი საუზმეები",
    ingredients: ["ლობიო", "ქინძი", "ხახვი"],
    allergens: [],
    is_available: true,
    calories: 220,
    protein: 12,
    carbs: 28,
    fat: 6,
    prep_minutes: 15,
    is_popular: true,
  },
  {
    id: ID.pkhali,
    name: "ფხალი ასორტი",
    name_en: "Pkhali assortment",
    description: "ისპანახი და ჭარხალი ნიგვზით",
    price: 14,
    category: "ცივი საუზმეები",
    ingredients: ["ისპანახი", "ჭარხალი", "ნიგოზი"],
    allergens: ["nuts"],
    is_available: true,
    calories: 180,
    protein: 6,
    carbs: 10,
    fat: 14,
    prep_minutes: 10,
  },
  {
    id: ID.badrijani,
    name: "ბადრიჯანი ნიგვზით",
    name_en: "Eggplant with walnuts",
    price: 11,
    category: "ცივი საუზმეები",
    ingredients: ["ბადრიჯანი", "ნიგოზი", "ნიორი"],
    allergens: ["nuts"],
    is_available: true,
    calories: 160,
    protein: 4,
    carbs: 8,
    fat: 12,
  },
  {
    id: ID.khachapuri,
    name: "იმერული ხაჭაპური",
    name_en: "Imeretian khachapuri",
    price: 16,
    category: "ცომეული",
    ingredients: ["ფქვილი", "ყველი", "კვერცხი"],
    allergens: ["gluten", "dairy", "eggs"],
    is_available: true,
    calories: 450,
    protein: 18,
    carbs: 40,
    fat: 22,
    prep_minutes: 20,
    is_popular: true,
  },
  {
    id: ID.khinkali,
    name: "ხინკალი საქონლის",
    name_en: "Beef khinkali",
    price: 1.2,
    category: "ხინკალი",
    ingredients: ["ფქვილი", "საქონლის ხორცი", "ხახვი"],
    allergens: ["gluten"],
    is_available: true,
    calories: 90,
    protein: 7,
    carbs: 10,
    fat: 3,
    prep_minutes: 18,
    wine_pairing: "საფერავი",
    is_popular: true,
  },
  {
    id: ID.mtsvadi,
    name: "მწვადი ღორის",
    name_en: "Pork mtsvadi",
    price: 28,
    category: "მწვადი",
    ingredients: ["ღორის ხორცი", "ხახვი"],
    allergens: [],
    is_available: true,
    calories: 520,
    protein: 35,
    carbs: 2,
    fat: 40,
    prep_minutes: 25,
  },
  {
    id: ID.salad,
    name: "ბოსტნეულის სალათი",
    name_en: "Vegetable salad",
    price: 10,
    category: "სალათები",
    ingredients: ["პომიდორი", "კიტრი", "ზეთი"],
    allergens: [],
    is_available: true,
    calories: 90,
    protein: 2,
    carbs: 8,
    fat: 6,
    prep_minutes: 8,
  },
  {
    id: ID.kids,
    name: "საბავშვო ნაგეტები",
    name_en: "Kids nuggets",
    price: 9,
    category: "საბავშვო",
    ingredients: ["ქათამი", "პური"],
    allergens: ["gluten"],
    is_available: true,
    calories: 280,
    protein: 14,
    carbs: 22,
    fat: 14,
    prep_minutes: 12,
  },
  {
    id: ID.dessert,
    name: "ნაყინი ვანილი",
    name_en: "Vanilla ice cream",
    price: 8,
    category: "დესერტი",
    ingredients: ["რძე", "შაქარი", "ვანილი"],
    allergens: ["dairy"],
    is_available: true,
    calories: 210,
    protein: 4,
    carbs: 24,
    fat: 10,
  },
  {
    id: ID.wine,
    name: "საფერავი",
    name_en: "Saperavi",
    price: 45,
    glass_price: 12,
    bottle_price: 45,
    category: "ღვინო",
    ingredients: ["ყურძენი"],
    allergens: [],
    is_available: true,
  },
  {
    id: ID.lemonade,
    name: "ტარხუნის ლიმონათი",
    name_en: "Tarragon lemonade",
    price: 6,
    category: "სასმელები",
    ingredients: ["ტარხუნი", "შაქარი"],
    allergens: [],
    is_available: true,
  },
  {
    id: ID.soldOut,
    name: "კალმახი ნიგვზით",
    name_en: "Trout with walnuts",
    price: 32,
    category: "თევზი",
    ingredients: ["კალმახი", "ნიგოზი"],
    allergens: ["fish", "nuts"],
    is_available: false,
  },
  {
    id: ID.elarji,
    name: "ელარჯი",
    name_en: "Elarji",
    price: 18,
    category: "გარნირი",
    ingredients: ["ღომი", "სულგუნი"],
    allergens: ["dairy"],
    is_available: true,
    calories: 320,
    protein: 12,
    carbs: 30,
    fat: 16,
  },
  {
    id: ID.churchkhela,
    name: "ჩურჩხელა",
    name_en: "Churchkhela",
    price: 7,
    category: "დესერტი",
    ingredients: ["ყურძნის წვენი", "ნიგოზი"],
    allergens: ["nuts"],
    is_available: true,
  },
  {
    id: ID.soup,
    name: "ხარჩო",
    name_en: "Kharcho",
    price: 15,
    category: "სუპები",
    ingredients: ["საქონლის ხორცი", "ბრინჯი", "ქინძი"],
    allergens: [],
    is_available: true,
    prep_minutes: 20,
    is_popular: true,
  },
];

function asChat(dishes: AssistantDish[]): ChatSuggestDish[] {
  return dishes.map((d) => ({
    id: String(d.id),
    name: d.name,
    description: d.description ?? "",
    price: Number(d.price) || 0,
    allergens: d.allergens ?? [],
    is_available: d.is_available !== false,
    category: d.category ?? undefined,
    ingredients: d.ingredients ?? [],
    wine_pairing: d.wine_pairing ?? null,
    calories: d.calories ?? null,
    protein: d.protein ?? null,
    carbs: d.carbs ?? null,
    fat: d.fat ?? null,
    prep_minutes: d.prep_minutes ?? null,
  }));
}

const chatMenu = asChat(menu);
const scenarios: Scenario[] = [];

function add(id: string, name: string, run: () => void) {
  scenarios.push({ id, name, run });
}

// ─── Routing ───────────────────────────────────────────────────────────────
const flashMsgs = [
  "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
  "რა არის დღეს ყველაზე პოპულარული კერძები მენიუში?",
  "მირჩიეთ სწრაფი ლანჩი",
  "რომელია ტოპ 3 ბესტსელერი?",
  "რა ღვინო შევუხამო ხინკალს?",
  "სხვა რამე მირჩიე",
  "recommend something hearty",
  "посоветуй блюда",
  "what's good tonight?",
  "მირჩიე დესერტი",
];
flashMsgs.forEach((m, i) =>
  add(`route-flash-${i + 1}`, `route flash: ${m.slice(0, 40)}`, () => {
    eq(routeChefModel(m), "flash", "route");
  }),
);

const liteMsgs = [
  "რა ღირს ლობიო?",
  "ლობიოს ინგრედიენტები რა არის?",
  "ხაჭაპურის ალერგენები?",
  "რამდენი კალორიაა მწვადში?",
  "ხინკალი რამდენ ხანში მზადდება?",
  "არის თუ არა ელარჯი?",
  "how much is Saperavi?",
  "what is in Vegetable salad?",
  "calories in Lobio",
  "prep time for khinkali",
];
liteMsgs.forEach((m, i) =>
  add(`route-lite-${i + 1}`, `route lite: ${m.slice(0, 40)}`, () => {
    eq(routeChefModel(m), "lite", "route");
  }),
);

add("route-ambiguous-hello", "greeting stays flash", () => {
  eq(routeChefModel("გამარჯობა"), "flash", "route");
});

// ─── Scrub / leak ──────────────────────────────────────────────────────────
const leakSamples = [
  "Do NOT repeat cart items in _DISH_",
  "Do not repeat items already in the cart.",
  "CART & 3-CARD PAIRING (mandatory when recommending)",
  "Output EXACTLY 3 DISH_IDS in this order",
  "LIVE MENU FULL CARDS (quote these fields; do not invent)",
  "GUEST FILTERS (mandatory)",
  "Turn context\nhello",
  "Internal — skip this",
  "Reply only to the guest",
  "**DISH_IDS:** none",
];
leakSamples.forEach((sample, i) =>
  add(`scrub-${i + 1}`, `scrub leak: ${sample.slice(0, 36)}`, () => {
    const cleaned = scrubChefInstructionLeak(
      `გირჩევთ ლობიოს.\n${sample}\nDISH_IDS: ${ID.lobio}`,
    );
    excludes(cleaned, /do not repeat/i, "no do-not-repeat");
    excludes(cleaned, /CART & 3-CARD/i, "no cart block");
    excludes(cleaned, /LIVE MENU FULL CARDS/i, "no live menu header");
    excludes(cleaned, /Output EXACTLY/i, "no output exactly");
    excludes(cleaned, /_DISH_/i, "no _DISH_");
    excludes(cleaned, /DISH_IDS/i, "no dish ids in spoken scrub");
  }),
);

add("scrub-keeps-georgian", "scrub keeps Georgian prose", () => {
  const cleaned = scrubChefInstructionLeak(
    "გირჩევთ ლობიოს და სალათს.\nDo NOT repeat cart items in _DISH_\nDISH_IDS: none",
  );
  includes(cleaned, "ლობიოს", "keeps ka");
});

add("visible-hides-partial-dish", "visibleChefText strips trailing DISH", () => {
  const v = visibleChefText("გირჩევთ ლობიოს\nDISH");
  excludes(v, /^DISH$/m, "no dangling DISH");
});

add("parse-ids-three", "parseChefReply extracts 3 uuids", () => {
  const raw = `ტექსტი\nDISH_IDS: ${ID.lobio}, ${ID.salad}, ${ID.elarji}`;
  const parsed = parseChefReply(raw);
  eq(parsed.ids.length, 3, "3 ids");
  excludes(parsed.spoken, /DISH_IDS/i, "spoken clean");
});

add("parse-ids-none", "parseChefReply none", () => {
  eq(parseChefReply("უკაცრავად\nDISH_IDS: none").ids.length, 0, "none");
});

add("parse-ids-brackets", "parseChefReply tolerates [id:]", () => {
  const parsed = parseChefReply(`x\nDISH_IDS: [id:${ID.lobio}]`);
  assert(parsed.ids.includes(ID.lobio), "has lobio");
});

add("parse-strips-leak-then-ids", "parse strips English leak", () => {
  const parsed = parseChefReply(
    `Do NOT repeat cart items in _DISH_\nგირჩევთ სალათს\nDISH_IDS: ${ID.salad}`,
  );
  excludes(parsed.spoken, /Do NOT/i, "no leak");
  includes(parsed.spoken, "სალათს", "keeps ka");
  eq(parsed.ids[0], ID.salad, "id");
});

// ─── Local facts ───────────────────────────────────────────────────────────
const factCases: Array<{
  id: string;
  message: string;
  locale: "ka" | "en" | "ru";
  mustInclude: RegExp;
  mustId?: string;
  fee?: number;
}> = [
  {
    id: "fact-price-ka",
    message: "რა ღირს ლობიო?",
    locale: "ka",
    mustInclude: /₾12|12/,
    mustId: ID.lobio,
    fee: 14,
  },
  {
    id: "fact-price-en",
    message: "how much is Lobio?",
    locale: "en",
    mustInclude: /12/,
    mustId: ID.lobio,
  },
  {
    id: "fact-price-ru",
    message: "сколько стоит Лобио?",
    locale: "ru",
    mustInclude: /12/,
    mustId: ID.lobio,
  },
  {
    id: "fact-ing-ka",
    message: "ლობიოს ინგრედიენტები?",
    locale: "ka",
    mustInclude: /ლობიო|ქინძი/,
    mustId: ID.lobio,
  },
  {
    id: "fact-ing-en",
    message: "what is in Lobio?",
    locale: "en",
    mustInclude: /bean|lobio|cilantro|ქინძი|ლობიო/i,
    mustId: ID.lobio,
  },
  {
    id: "fact-all-ka",
    message: "ხაჭაპურის ალერგენები?",
    locale: "ka",
    mustInclude: /გლუტენ|რძ|კვერცხ|gluten|dairy|egg/i,
    mustId: ID.khachapuri,
  },
  {
    id: "fact-macros-ka",
    message: "რამდენი კალორიაა ლობიოში?",
    locale: "ka",
    mustInclude: /220|კკალ/,
    mustId: ID.lobio,
  },
  {
    id: "fact-prep-ka",
    message: "ხინკალი რამდენ ხანში მზადდება?",
    locale: "ka",
    mustInclude: /18/,
    mustId: ID.khinkali,
  },
  {
    id: "fact-avail-yes",
    message: "არის თუ არა ელარჯი?",
    locale: "ka",
    mustInclude: /ხელმისაწვდომ|დიახ/,
    mustId: ID.elarji,
  },
  {
    id: "fact-avail-no",
    message: "არის თუ არა კალმახი ნიგვზით?",
    locale: "ka",
    mustInclude: /არ არის|არა/,
    mustId: ID.soldOut,
  },
  {
    id: "fact-wine-glass",
    message: "რა ღირს საფერავი?",
    locale: "ka",
    mustInclude: /45|12/,
    mustId: ID.wine,
  },
  {
    id: "fact-salad-ing",
    message: "ბოსტნეულის სალათი შემადგენლობა",
    locale: "ka",
    mustInclude: /პომიდორ|კიტრ/,
    mustId: ID.salad,
  },
];

factCases.forEach((c) =>
  add(c.id, `local fact: ${c.message}`, () => {
    const reply = buildLocalChefFactReply({
      message: c.message,
      dishes: menu,
      locale: c.locale,
      serviceFeePercent: c.fee ?? 0,
    });
    assert(reply, "expected local fact reply");
    includes(reply, c.mustInclude, "content");
    includes(reply, "DISH_IDS:", "has ids line");
    if (c.mustId) includes(reply, c.mustId, "correct id");
    excludes(reply, /Do NOT/i, "no leak");
    excludes(reply, /CART &/i, "no cart");
  }),
);

add("fact-fee-included", "price fact mentions service fee", () => {
  const reply = buildLocalChefFactReply({
    message: "რა ღირს ლობიო?",
    dishes: menu,
    locale: "ka",
    serviceFeePercent: 14,
  });
  assert(reply, "fee reply");
  includes(reply, /14%|მომსახურ/, "fee");
});

add("fact-ambiguous-null", "ambiguous name does not invent", () => {
  const reply = buildLocalChefFactReply({
    message: "რა ღირს კერძი?",
    dishes: menu,
    locale: "ka",
  });
  eq(reply, null, "null when ambiguous");
});

add("fact-kind-price", "detect price kind", () => {
  eq(detectChefFactKind("რა ღირს ლობიო?"), "price", "kind");
});
add("fact-kind-ing", "detect ingredients kind", () => {
  eq(detectChefFactKind("ინგრედიენტები ლობიო"), "ingredients", "kind");
});
add("fact-kind-recommend-null", "recommend is not a fact", () => {
  eq(
    detectChefFactKind("მირჩიე სამარხვო კერძები"),
    null,
    "null",
  );
});

add("match-named-lobio", "matchNamedDishForFact finds lobio", () => {
  const d = matchNamedDishForFact(menu, "რა ღირს ლობიო?");
  eq(d?.id, ID.lobio, "id");
});

add("match-named-skips-soldout-default", "match skips unavailable by default", () => {
  const d = matchNamedDishForFact(menu, "რა ღირს კალმახი ნიგვზით?");
  // may still match if score high — with includeUnavailable false should skip
  assert(!d || d.is_available !== false, "available only");
});

// ─── Local vegetarian recommend ────────────────────────────────────────────
const vegPrompts = [
  "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
  "მირჩიე ვეგეტარიანული კერძები",
  "recommend vegetarian dishes",
  "посоветуй постные блюда",
  "მირჩიე სამარხვო",
  "suggest vegan or fasting plates",
];
vegPrompts.forEach((m, i) =>
  add(`veg-local-${i + 1}`, `local veg recommend: ${m.slice(0, 40)}`, () => {
    const reply = buildLocalChefRecommendReply({
      message: m,
      dishes: menu,
      locale: "ka",
    });
    assert(reply, "local veg reply");
    const parsed = parseChefReply(reply);
    assert(parsed.ids.length >= 1, "≥1 id");
    for (const id of parsed.ids) {
      const dish = menu.find((d) => d.id === id);
      assert(dish, `dish ${id}`);
      const tags = dishDietLabels({
        name: dish.name,
        description: dish.description,
        ingredients: dish.ingredients,
        allergens: dish.allergens,
        category: dish.category,
      }).join(" ");
      assert(
        /vegetarian|fasting|vegan|სამარხვ|ვეგეტარ/i.test(tags),
        `${dish.name} must be vegetarian/fasting, tags=${tags}`,
      );
      assert(dish.is_available !== false, "available");
      assert(
        !/ხორც|ღორ|საქონ|ქათამ|კალმახ|მწვად|ხინკალ/i.test(dish.name) ||
          /vegetarian|fasting/i.test(tags),
        "no meat name without veg tag",
      );
    }
    excludes(parsed.spoken, /Do NOT|CART &|_DISH_/i, "no leak");
    assert(parsed.ids.length <= 3, "≤3 cards");
  }),
);

add("veg-local-en", "local veg en locale", () => {
  const reply = buildLocalChefRecommendReply({
    message: "recommend vegetarian dishes on the menu",
    dishes: menu,
    locale: "en",
  });
  assert(reply, "en veg reply");
  includes(reply!, /vegetarian|fasting/i, "en copy");
});

add("veg-local-ru", "local veg ru locale", () => {
  const reply = buildLocalChefRecommendReply({
    message: "посоветуй вегетарианские блюда",
    dishes: menu,
    locale: "ru",
  });
  assert(reply, "ru veg reply");
  includes(reply!, /постн|вегетариан/i, "ru copy");
});

add("veg-local-empty-menu", "local veg empty when no veg", () => {
  const meatOnly = menu.filter((d) =>
    /მწვად|ხინკალ|ხარჩო|ნაგეტ/.test(d.name),
  );
  const reply = buildLocalChefRecommendReply({
    message: "მირჩიე ვეგეტარიანული",
    dishes: meatOnly,
    locale: "ka",
  });
  assert(reply, "empty veg reply");
  includes(reply!, "DISH_IDS: none", "none");
});

add("veg-mixed-wine-null", "wine+veg leaves Gemini path", () => {
  eq(
    buildLocalChefRecommendReply({
      message: "მირჩიე ვეგეტარიანული და ღვინო",
      dishes: menu,
      locale: "ka",
    }),
    null,
    "null",
  );
});

add("veg-dessert-null", "dessert+veg leaves Gemini", () => {
  eq(
    buildLocalChefRecommendReply({
      message: "მირჩიე ვეგეტარიანული დესერტი",
      dishes: menu,
      locale: "ka",
    }),
    null,
    "null",
  );
});

add("veg-no-meat-ids", "veg reply never returns mtsvadi/khinkali", () => {
  const reply = buildLocalChefRecommendReply({
    message: "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
    dishes: menu,
    locale: "ka",
  });
  assert(reply, "veg reply");
  excludes(reply!, ID.mtsvadi, "no mtsvadi");
  excludes(reply!, ID.khinkali, "no khinkali");
  excludes(reply!, ID.soup, "no kharcho");
  excludes(reply!, ID.kids, "no kids chicken");
});

// ─── Focus picker ──────────────────────────────────────────────────────────
add("focus-veg-only", "pickFocusedDishes prefers vegetarian", () => {
  const focused = pickFocusedDishes(
    menu,
    "მირჩიე სამარხვო ან ვეგეტარიანული კერძები",
  );
  assert(focused.length >= 1, "has focus");
  for (const dish of focused) {
    const tags = dishDietLabels({
      name: dish.name,
      description: dish.description,
      ingredients: dish.ingredients,
      allergens: dish.allergens,
      category: dish.category,
    }).join(" ");
    assert(/vegetarian|fasting|vegan/i.test(tags), `${dish.name} veg`);
  }
});

add("focus-skips-unavailable", "focus never picks sold out", () => {
  const focused = pickFocusedDishes(menu, "მირჩიე კალმახი");
  assert(
    focused.every((d) => d.is_available !== false),
    "all available",
  );
});

add("focus-prior-ids", "focus keeps prior history ids first", () => {
  const focused = pickFocusedDishes(menu, "სხვა", [ID.lobio]);
  eq(focused[0]?.id, ID.lobio, "prior first");
});

add("focus-khinkali-name", "focus finds khinkali by name", () => {
  const focused = pickFocusedDishes(menu, "ხინკალი საქონლის");
  assert(focused.some((d) => d.id === ID.khinkali), "has khinkali");
});

add("focus-wine-category", "focus wine query", () => {
  const focused = pickFocusedDishes(menu, "რა ღვინო გაქვთ?");
  assert(
    focused.some((d) => /ღვინ|საფერავ/i.test(d.name + (d.category ?? ""))),
    "wine-ish",
  );
});

add("focus-dessert", "focus dessert", () => {
  const focused = pickFocusedDishes(menu, "მირჩიე დესერტი");
  assert(
    focused.some((d) => /დესერტ|ნაყინ|ჩურჩხელ/i.test(d.name + (d.category ?? ""))),
    "dessert",
  );
});

add("focus-limit", "focus respects limit", () => {
  const focused = pickFocusedDishes(menu, "მირჩიე რამე", [], 3);
  assert(focused.length <= 3, "≤3");
});

add("history-ids", "extractHistoryDishIds from assistant", () => {
  const ids = extractHistoryDishIds([
    { role: "assistant", content: `ok\nDISH_IDS: ${ID.lobio},${ID.salad}` },
  ]);
  assert(ids.includes(ID.lobio) && ids.includes(ID.salad), "ids");
});

// ─── Alcohol suppress / chips helpers ──────────────────────────────────────
add("alcohol-asked", "guestAskedForAlcohol true", () => {
  assert(guestAskedForAlcohol("რა ღვინო შევუხამო"), "true");
});
add("alcohol-not", "guestAskedForAlcohol false", () => {
  assert(!guestAskedForAlcohol("მირჩიე სალათი"), "false");
});

add("suppress-veg", "suppress alcohol on vegetarian", () => {
  assert(
    shouldSuppressAlcohol({
      lastUser: "მირჩიე ვეგეტარიანული",
      diet: { blockedAllergens: [], vegetarian: true, vegan: false },
    }),
    "suppress",
  );
});

add("suppress-kids", "suppress alcohol on kids", () => {
  assert(
    shouldSuppressAlcohol({
      lastUser: "საბავშვო მენიუ",
      diet: { blockedAllergens: [], vegetarian: false, vegan: false },
    }),
    "suppress",
  );
});

add("suppress-budget", "suppress alcohol on budget", () => {
  assert(
    shouldSuppressAlcohol({
      lastUser: "ლანჩი",
      diet: { blockedAllergens: [], vegetarian: false, vegan: false },
      maxPrice: 25,
    }),
    "suppress",
  );
});

add("no-suppress-when-asked", "do not suppress if guest asks wine", () => {
  assert(
    !shouldSuppressAlcohol({
      lastUser: "რა ღვინო შევუხამო",
      diet: { blockedAllergens: [], vegetarian: true, vegan: false },
    }),
    "allow",
  );
});

// ─── Stock / cards ─────────────────────────────────────────────────────────
add("stock-filter", "dishesForLiveStock filters", () => {
  const live = dishesForLiveStock(chatMenu, [ID.lobio, ID.soldOut]);
  eq(live.length, 1, "only lobio");
  eq(live[0].id, ID.lobio, "id");
});

add("from-ids-order", "dishesFromIds keeps order & skips sold", () => {
  const rows = dishesFromIds(
    [ID.soldOut, ID.salad, ID.lobio, ID.mtsvadi],
    chatMenu,
    3,
  );
  eq(rows.map((d) => d.id).join(","), `${ID.salad},${ID.lobio},${ID.mtsvadi}`, "order");
});

add("from-ids-limit", "dishesFromIds limit 2", () => {
  eq(
    dishesFromIds([ID.salad, ID.lobio, ID.elarji], chatMenu, 2).length,
    2,
    "2",
  );
});

// ─── Prompts / cost invariants (static) ────────────────────────────────────
add("ttl-4h", "menu cache TTL is 4h", () => {
  const src = readFileSync(resolve("src/lib/gemini-menu-cache.ts"), "utf8");
  includes(src, "GEMINI_MENU_CACHE_TTL_SECONDS = 14_400", "ttl 4h");
});

add("turn-prompt-has-cards", "turn prompt embeds focused cards", () => {
  const focused = pickFocusedDishes(menu, "მირჩიე ვეგეტარიანული");
  const turn = buildChefTurnPrompt(menu, "ka", { vegetarian: true }, focused);
  includes(turn, "LIVE MENU FULL CARDS", "header");
  includes(turn, "[id:", "card ids");
  includes(turn, "DIET OVERRIDE", "diet override");
});

add("turn-prompt-lite-slim", "lite turn can drop cart pairing", () => {
  const turn = buildChefTurnPrompt(
    menu,
    "ka",
    { cartDishIds: [ID.lobio] },
    [menu[0]],
    { includeCartPairing: false, includeFilters: false },
  );
  excludes(turn, /CART & 3-CARD/, "no cart when slim");
});

add("cacheable-no-guest-message", "cacheable system has no guest question slot", () => {
  const sys = buildCacheableChefSystemPrompt("ქართლი", menu, "ka", {
    serviceFeePercent: 14,
  });
  excludes(sys, /GUEST QUESTION/i, "no guest question");
  includes(sys, "LIVE MENU:", "has index");
  includes(sys, "VEGETARIAN / FASTING", "veg rule");
  includes(sys, "DISH_IDS:", "id rule");
});

add("handler-cost-invariants", "handler keeps cost design", () => {
  const src = readFileSync(
    resolve("src/lib/ai-waiter-handler.ts"),
    "utf8",
  );
  includes(src, "buildLocalChefFactReply", "local facts");
  includes(src, "buildLocalChefRecommendReply", "local recommend");
  includes(src, "warmGeminiMenuCache", "warm only");
  includes(src, "null,\n            maxOutputTokensForRoute", "uncached generate");
  includes(src, 'route === "lite" ? 360 : 768', "token caps");
  includes(src, "gemini-3.6-flash", "flash model");
  includes(src, "gemini-3.5-flash-lite", "lite model");
  excludes(src, "peekGeminiMenuCache", "peek removed from generate path");
  // guest-only turns: message alone in buildConversationTurns
  includes(src, "buildConversationTurns(\n            ctx.history,\n            ctx.message", "guest-only turns");
  includes(src, "const fullSystem = `${cacheable}\\n${turnPrompt}`", "rules in system");
});

add("cache-module-ttl", "gemini-menu-cache TTL export", () => {
  const src = readFileSync(resolve("src/lib/gemini-menu-cache.ts"), "utf8");
  includes(src, "14_400", "4h");
  includes(src, "export function warmGeminiMenuCache", "warm");
  includes(src, "export function peekGeminiMenuCache", "peek still exists");
});

// ─── Recommend / fact classifiers ──────────────────────────────────────────
const recommendTrue = [
  "მირჩიე რამე",
  "recommend pairing",
  "სხვა",
  "what else",
  "посоветуй",
];
recommendTrue.forEach((m, i) =>
  add(`clf-rec-${i + 1}`, `isChefRecommendTurn ${m}`, () => {
    assert(isChefRecommendTurn(m, []), "true");
  }),
);

const factTrue = [
  "რა ფასი აქვს",
  "ingredients please",
  "allergen info",
  "macros?",
  "prep time",
];
factTrue.forEach((m, i) =>
  add(`clf-fact-${i + 1}`, `isChefFactTurn ${m}`, () => {
    assert(isChefFactTurn(m), "true");
  }),
);

// ─── Diet tags sanity on fixture ───────────────────────────────────────────
add("diet-lobio-veg", "lobio tagged vegetarian/fasting", () => {
  const tags = dishDietLabels({
    name: "ლობიო",
    description: "შებოლილი ლობიო",
    ingredients: ["ლობიო", "ქინძი"],
    allergens: [],
    category: "ცხელი",
  }).join(" ");
  assert(/vegetarian|fasting|vegan/i.test(tags), tags);
});

add("diet-mtsvadi-not-veg", "mtsvadi not vegetarian", () => {
  const tags = dishDietLabels({
    name: "მწვადი ღორის",
    ingredients: ["ღორის ხორცი"],
    allergens: [],
    category: "მწვადი",
  }).join(" ");
  assert(!/vegetarian|fasting|vegan/i.test(tags), tags);
});

add("diet-khachapuri-veg-dairy", "khachapuri vegetarian with dairy note", () => {
  const tags = dishDietLabels({
    name: "იმერული ხაჭაპური",
    ingredients: ["ფქვილი", "ყველი", "კვერცხი"],
    allergens: ["gluten", "dairy", "eggs"],
    category: "ცომეული",
  }).join(" ");
  assert(/vegetarian/i.test(tags), "veg");
  assert(!/fasting\/vegan/i.test(tags), "not fasting");
});

add("diet-wine-no-diet-tag", "wine not tagged vegetarian meal", () => {
  const tags = dishDietLabels({
    name: "საფერავი",
    ingredients: ["ყურძენი"],
    allergens: [],
    category: "ღვინო",
  });
  eq(tags.length, 0, "drinks skip diet tags");
});

// ─── End-to-end local path: chip simulation ────────────────────────────────
add("e2e-chip-veg", "vegetarian chip full local path", () => {
  const message =
    "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.";
  assert(routeChefModel(message) === "flash", "would be flash if gemini");
  const local = buildLocalChefRecommendReply({
    message,
    dishes: menu,
    locale: "ka",
  });
  assert(local, "intercepted locally $0");
  const parsed = parseChefReply(local!);
  const cards = dishesFromIds(parsed.ids, chatMenu, 3);
  eq(cards.length, parsed.ids.length, "all ids resolve");
  assert(cards.every((c) => c.is_available), "in stock");
  excludes(visibleChefText(local!), /Do NOT|DISH_IDS|_DISH_/i, "UI clean");
});

add("e2e-chip-price", "price question full local path", () => {
  const message = "რა ღირს იმერული ხაჭაპური?";
  eq(routeChefModel(message), "lite", "lite");
  const local = buildLocalChefFactReply({
    message,
    dishes: menu,
    locale: "ka",
    serviceFeePercent: 14,
  });
  assert(local, "price local");
  const parsed = parseChefReply(local!);
  eq(parsed.ids[0], ID.khachapuri, "id");
  includes(parsed.spoken, /16|₾/, "price");
});

add("e2e-bestsellers-not-local-veg", "bestsellers not captured by veg local", () => {
  eq(
    buildLocalChefRecommendReply({
      message: "რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?",
      dishes: menu,
      locale: "ka",
    }),
    null,
    "null → Gemini flash",
  );
  eq(
    routeChefModel(
      "რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?",
    ),
    "flash",
    "flash",
  );
});

// Extra edge cases to push past 100
const edgeMessages = [
  ["", "empty"],
  ["   ", "whitespace"],
  ["?", "question mark"],
  ["hello chef", "english hello"],
  ["გამარჯობა შეფო", "ka hello"],
  ["მადლობა", "thanks"],
  ["ok", "ok"],
  ["123", "numbers"],
  ["რა გაქვთ?", "what do you have"],
  ["სხვა", "other"],
  ["Other", "other en"],
  ["Другое", "other ru"],
  ["მირჩიე სალათი", "salad recommend"],
  ["მირჩიე სუპი", "soup recommend"],
  ["gluten free please", "gluten"],
  ["არ მინდა ნიგოზი", "nut free text"],
  ["dairy free", "dairy free"],
  ["lunch under 25", "budget"],
  ["dinner for two", "party"],
  ["kids menu", "kids en"],
];
edgeMessages.forEach(([m, label], i) =>
  add(`edge-${i + 1}`, `edge ${label}`, () => {
    const route = routeChefModel(String(m));
    assert(route === "flash" || route === "lite", "valid route");
    const scrubbed = scrubChefInstructionLeak(
      `${m}\nDo NOT repeat cart items in _DISH_\nDISH_IDS: none`,
    );
    excludes(scrubbed, /Do NOT repeat/i, "scrub");
    // local paths must not throw
    buildLocalChefFactReply({ message: String(m), dishes: menu, locale: "ka" });
    buildLocalChefRecommendReply({
      message: String(m),
      dishes: menu,
      locale: "ka",
    });
    pickFocusedDishes(menu, String(m) || "მირჩიე");
  }),
);

add("prompt-no-echo-phrase", "cart line rephrased away from Do not repeat", () => {
  const turn = buildChefTurnPrompt(
    menu,
    "ka",
    { cartDishIds: [ID.lobio] },
    pickFocusedDishes(menu, "მირჩიე რამე"),
  );
  excludes(turn, "Do not repeat items already in the cart", "old phrase gone");
  includes(turn, "Skip ids already listed in the cart", "new phrasing");
});

add("veg-prior-excludes-repeat-soft", "veg local with prior still vegetarian", () => {
  const reply = buildLocalChefRecommendReply({
    message: "მირჩიე ვეგეტარიანული კერძები",
    dishes: menu,
    locale: "ka",
    priorIds: [ID.lobio],
  });
  assert(reply, "prior veg reply");
  const parsed = parseChefReply(reply!);
  for (const id of parsed.ids) {
    const dish = menu.find((d) => d.id === id)!;
    const tags = dishDietLabels({
      name: dish.name,
      description: dish.description,
      ingredients: dish.ingredients,
      allergens: dish.allergens,
      category: dish.category,
    }).join(" ");
    assert(/vegetarian|fasting|vegan/i.test(tags), dish.name);
  }
});

// ─── Wave 2: push to ≥200, hunt remaining bugs ─────────────────────────────
add("fasting-only-excludes-dairy", "постные must not return khachapuri/elarji", () => {
  const reply = buildLocalChefRecommendReply({
    message: "посоветуй постные блюда",
    dishes: menu,
    locale: "ru",
  });
  assert(reply, "fasting reply");
  excludes(reply!, ID.khachapuri, "no dairy khachapuri");
  excludes(reply!, ID.elarji, "no elarji");
  excludes(reply!, ID.dessert, "no ice cream");
  const parsed = parseChefReply(reply!);
  assert(parsed.ids.length >= 1, "has fasting dishes");
  for (const id of parsed.ids) {
    const dish = menu.find((d) => d.id === id)!;
    const tags = dishDietLabels({
      name: dish.name,
      description: dish.description,
      ingredients: dish.ingredients,
      allergens: dish.allergens,
      category: dish.category,
    }).join(" ");
    assert(/fasting|vegan/i.test(tags), `${dish.name} fasting`);
  }
});

add("fasting-ka-only", "სამარხვო alone is fasting-only", () => {
  const reply = buildLocalChefRecommendReply({
    message: "მირჩიე სამარხვო კერძები",
    dishes: menu,
    locale: "ka",
  });
  assert(reply, "ka fasting");
  excludes(reply!, ID.khachapuri, "no khachapuri");
});

add("veg-or-fasting-allows-dairy", "chip OR allows khachapuri", () => {
  const reply = buildLocalChefRecommendReply({
    message:
      "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
    dishes: menu,
    locale: "ka",
  });
  assert(reply, "mixed chip");
  // dairy veg is allowed; not required, but meat still forbidden
  excludes(reply!, ID.mtsvadi, "no meat");
  excludes(reply!, ID.khinkali, "no khinkali");
});

add("infer-fasting-sets-vegan", "inferDietFromText fasting → vegan", () => {
  const d = inferDietFromText("მინდა სამარხვო");
  assert(d.vegan && d.vegetarian, "vegan+veg");
});

add("infer-vegetarian-only", "inferDietFromText vegetarian", () => {
  const d = inferDietFromText("vegetarian please");
  assert(d.vegetarian && !d.vegan, "veg only");
});

add("infer-gluten", "inferDietFromText gluten", () => {
  assert(
    inferDietFromText("გლუტენი მაქვს").blockedAllergens.includes("gluten"),
    "gluten",
  );
});

add("infer-nuts", "inferDietFromText nuts", () => {
  assert(
    inferDietFromText("არ მინდა ნიგოზი").blockedAllergens.includes("nuts"),
    "nuts",
  );
});

add("infer-dairy", "inferDietFromText dairy", () => {
  assert(
    inferDietFromText("dairy free").blockedAllergens.includes("dairy"),
    "dairy",
  );
});

add("diet-match-nuts-blocks-pkhali", "dishMatchesDiet nuts", () => {
  const diet = {
    ...emptyDietFilter(),
    blockedAllergens: ["nuts"],
  };
  assert(!dishMatchesDiet(menu.find((d) => d.id === ID.pkhali)!, diet), "block");
  assert(dishMatchesDiet(menu.find((d) => d.id === ID.lobio)!, diet), "allow");
});

add("diet-match-gluten-blocks-khachapuri", "dishMatchesDiet gluten", () => {
  const diet = { ...emptyDietFilter(), blockedAllergens: ["gluten"] };
  assert(
    !dishMatchesDiet(menu.find((d) => d.id === ID.khachapuri)!, diet),
    "block",
  );
});

add("diet-match-veg-blocks-meat", "dishMatchesDiet vegetarian", () => {
  const diet = { ...emptyDietFilter(), vegetarian: true };
  assert(!dishMatchesDiet(menu.find((d) => d.id === ID.mtsvadi)!, diet), "meat");
  assert(dishMatchesDiet(menu.find((d) => d.id === ID.salad)!, diet), "salad");
});

add("diet-match-vegan-blocks-dairy", "dishMatchesDiet vegan", () => {
  const diet = { ...emptyDietFilter(), vegetarian: true, vegan: true };
  assert(
    !dishMatchesDiet(menu.find((d) => d.id === ID.khachapuri)!, diet),
    "dairy",
  );
  assert(dishMatchesDiet(menu.find((d) => d.id === ID.lobio)!, diet), "lobio");
});

const moreFacts: Array<{ msg: string; locale: "ka" | "en" | "ru"; id: string }> =
  [
    { msg: "ელარჯი რა ღირს?", locale: "ka", id: ID.elarji },
    { msg: "how much is Elarji?", locale: "en", id: ID.elarji },
    { msg: "ნაყინი ვანილი ინგრედიენტები", locale: "ka", id: ID.dessert },
    { msg: "ingredients in Vanilla ice cream", locale: "en", id: ID.dessert },
    { msg: "მწვადი ღორის ალერგენები?", locale: "ka", id: ID.mtsvadi },
    { msg: "calories in Pork mtsvadi", locale: "en", id: ID.mtsvadi },
    { msg: "ლობიო რამდენ ხანში მზადდება?", locale: "ka", id: ID.lobio },
    { msg: "prep time for Lobio", locale: "en", id: ID.lobio },
    { msg: "არის თუ არა საფერავი?", locale: "ka", id: ID.wine },
    { msg: "is Saperavi available?", locale: "en", id: ID.wine },
    { msg: "ტარხუნის ლიმონათი რა ღირს?", locale: "ka", id: ID.lemonade },
    { msg: "ბადრიჯანი ნიგვზით ალერგენები", locale: "ka", id: ID.badrijani },
    { msg: "ფხალის ალერგენები?", locale: "ka", id: ID.pkhali },
    { msg: "ხინკალის კალორიები", locale: "ka", id: ID.khinkali },
    { msg: "сколько калорий в Лобио?", locale: "ru", id: ID.lobio },
  ];
moreFacts.forEach((c, i) =>
  add(`fact2-${i + 1}`, `fact2 ${c.msg.slice(0, 36)}`, () => {
    const reply = buildLocalChefFactReply({
      message: c.msg,
      dishes: menu,
      locale: c.locale,
      serviceFeePercent: 14,
    });
    assert(reply, "local fact");
    includes(reply!, c.id, "id");
    excludes(reply!, /Do NOT|CART &|_DISH_/i, "clean");
  }),
);

const geminiOnlyChips = [
  "რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?",
  "მირჩიეთ სწრაფი ლანჩი — კერძი, რომელიც სწრაფად მზადდება და ნოყიერია.",
  "რა არის დღეს ყველაზე პოპულარული კერძები მენიუში?",
  "რა ღვინო შევუხამო ხინკალს? თუ ხინკალი არ არის, მირჩიე ღვინო ძირითად კერძებთან.",
  "მირჩიე საფირმო დესერტი",
  "მირჩიე საბავშვო კერძები",
  "სხვა რამე მირჩიე მენიუდან",
  "recommend spicy food",
  "what's good for dinner for two?",
  "lunch under 25 gel please",
];
geminiOnlyChips.forEach((m, i) =>
  add(`gemini-chip-${i + 1}`, `gemini path chip ${i + 1}`, () => {
    eq(
      buildLocalChefRecommendReply({ message: m, dishes: menu, locale: "ka" }),
      null,
      "not local veg",
    );
    eq(
      buildLocalChefFactReply({ message: m, dishes: menu, locale: "ka" }),
      null,
      "not local fact",
    );
    eq(routeChefModel(m), "flash", "flash");
  }),
);

add("quiz-veg-hearty", "pickQuizDishes veg hearty", () => {
  const picked = pickQuizDishes(
    chatMenu,
    { vegetarian: true, hearty: true },
    emptyDietFilter(),
  );
  assert(picked.length >= 1, "picked");
  for (const d of picked) {
    assert(
      dishMatchesDiet(d, { ...emptyDietFilter(), vegetarian: true }),
      d.name,
    );
  }
});

add("quiz-meat-light", "pickQuizDishes meat light", () => {
  const picked = pickQuizDishes(
    chatMenu,
    { vegetarian: false, hearty: false },
    emptyDietFilter(),
  );
  assert(picked.length >= 1, "picked");
});

add("quiz-budget", "pickQuizDishes respects budget+fee", () => {
  const picked = pickQuizDishes(
    chatMenu,
    { vegetarian: true, hearty: false },
    emptyDietFilter(),
    15,
    14,
  );
  for (const d of picked) {
    const withFee = Math.round(d.price * 1.14 * 100) / 100;
    assert(withFee <= 15, `${d.name} ${withFee}`);
  }
});

add("quiz-nut-filter", "pickQuizDishes nut allergy", () => {
  const picked = pickQuizDishes(
    chatMenu,
    { vegetarian: true, hearty: false },
    { ...emptyDietFilter(), blockedAllergens: ["nuts"], vegetarian: true },
  );
  assert(
    picked.every((d) => !/ნიგვზ|ნიგოზ|walnut/i.test(`${d.name} ${(d.ingredients ?? []).join(" ")}`)),
    "no nuts",
  );
});

add("toggle-allergen", "toggleAllergen add/remove", () => {
  const a = toggleAllergen(emptyDietFilter(), "gluten");
  assert(a.blockedAllergens.includes("gluten"), "add");
  const b = toggleAllergen(a, "gluten");
  assert(!b.blockedAllergens.includes("gluten"), "remove");
});

add("menu-flags", "menuHas* helpers", () => {
  assert(menuHasDrink(chatMenu), "drink");
  assert(menuHasDessert(chatMenu), "dessert");
  assert(menuHasKids(chatMenu), "kids");
  assert(menuHasKhinkali(chatMenu), "khinkali");
});

add("pairing-khinkali", "pairingLine for khinkali", () => {
  const kh = chatMenu.find((d) => d.id === ID.khinkali)!;
  includes(pairingLine(kh, "pair-k", (p) => `with ${p}`), "საფერავი", "listed");
  eq(pairingLine(kh, "pair-k", (p) => p, true), "", "skip alcohol");
});

add("match-reply-names", "matchDishesInReply finds names", () => {
  const found = matchDishesInReply(
    "გირჩევთ ლობიოს და ბოსტნეულის სალათს",
    chatMenu,
    3,
  );
  assert(found.some((d) => d.id === ID.lobio), "lobio");
  assert(found.some((d) => d.id === ID.salad), "salad");
});

add("turn-diet-override-vegan", "turn prompt vegan override", () => {
  const turn = buildChefTurnPrompt(
    menu,
    "ka",
    { vegan: true, vegetarian: true, noAlcohol: true },
    pickFocusedDishes(menu, "მირჩიე სამარხვო"),
  );
  includes(turn, "DIET OVERRIDE", "override");
  includes(turn, "GUEST FILTERS", "filters");
});

add("system-no-invent", "system forbids invented dishes", () => {
  const sys = buildCacheableChefSystemPrompt("ქართლი", menu, "ka");
  includes(sys, /STRICTLY FORBIDDEN to invent/i, "no invent");
  includes(sys, "REAL-MENU-ONLY", "menu only");
});

add("parse-malformed-ids", "parse ignores junk tokens", () => {
  const parsed = parseChefReply(`ok\nDISH_IDS: foo, ${ID.lobio}, bar`);
  assert(parsed.ids.includes(ID.lobio), "uuid kept");
  assert(!parsed.ids.includes("foo"), "junk dropped");
});

add("parse-multiline-ids", "parse multiline DISH_IDS", () => {
  const parsed = parseChefReply(
    `ok\nDISH_IDS:\n${ID.lobio}\n${ID.salad}`,
  );
  assert(parsed.ids.length >= 2, "2 ids");
});

add("visible-keeps-ka", "visibleChefText keeps Georgian", () => {
  includes(
    visibleChefText(`გირჩევთ ლობიოს\nDo NOT repeat cart items in _DISH_`),
    "ლობიოს",
    "ka",
  );
});

add("scrub-role-line", "scrub ROLE-like echoes", () => {
  excludes(
    scrubChefInstructionLeak("Never invent wine names\nგამარჯობა"),
    /Never invent/i,
    "scrub never",
  );
});

add("focus-empty-query-browse", "empty-ish browse still returns dishes", () => {
  assert(pickFocusedDishes(menu, "მირჩიე").length >= 1, "focus");
});

add("focus-soldout-query", "query for sold-out does not surface it", () => {
  const focused = pickFocusedDishes(menu, "კალმახი ნიგვზით");
  assert(
    focused.every((d) => d.id !== ID.soldOut),
    "no sold out",
  );
});

add("stock-null-available", "dishesForLiveStock without ids", () => {
  const live = dishesForLiveStock(chatMenu, null);
  assert(live.every((d) => d.is_available), "available only");
  assert(!live.some((d) => d.id === ID.soldOut), "no sold");
});

add("from-ids-dupes", "dishesFromIds dedupes", () => {
  const rows = dishesFromIds([ID.lobio, ID.lobio, ID.lobio], chatMenu, 3);
  eq(rows.length, 1, "dedupe");
});

add("history-empty", "extractHistoryDishIds empty", () => {
  eq(extractHistoryDishIds([]).length, 0, "empty");
});

add("history-user-ignored", "extractHistoryDishIds ignores user", () => {
  const ids = extractHistoryDishIds([
    { role: "user", content: `DISH_IDS: ${ID.lobio}` },
  ]);
  eq(ids.length, 0, "user ids ignored");
});

add("veg-gluten-free-local", "gluten-free vegetarian excludes khachapuri", () => {
  const reply = buildLocalChefRecommendReply({
    message: "gluten-free vegetarian please",
    dishes: menu,
    locale: "en",
  });
  assert(reply, "reply");
  excludes(reply!, ID.khachapuri, "no gluten");
  excludes(reply!, ID.khinkali, "no khinkali");
  excludes(reply!, ID.mtsvadi, "no meat");
});

add("veg-nut-free-local", "nut-free vegetarian excludes pkhali", () => {
  const reply = buildLocalChefRecommendReply({
    message: "არ მინდა ნიგოზი, მირჩიე ვეგეტარიანული",
    dishes: menu,
    locale: "ka",
  });
  // may be null if message fails clear-veg gate due to phrasing — accept either
  // filtered local or null (Gemini). If local, must exclude nuts.
  if (reply) {
    excludes(reply, ID.pkhali, "no pkhali");
    excludes(reply, ID.badrijani, "no badrijani");
    excludes(reply, ID.churchkhela, "no churchkhela");
  }
});

add("sse-replace-result", "SSE result replaces partial leak", async () => {
  const body = [
    `data: ${JSON.stringify({ text: "Do NOT repeat cart items in _DISH_\n" })}\n\n`,
    `data: ${JSON.stringify({ text: "გირჩევთ ლობიოს\n" })}\n\n`,
    `data: ${JSON.stringify({
      result: `გირჩევთ ლობიოს\nDISH_IDS: ${ID.lobio}`,
      done: true,
      availableIds: [ID.lobio],
    })}\n\n`,
  ].join("");
  const res = new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
  const out = await readAiWaiterReply(res);
  assert(out.ok, "ok");
  excludes(out.result, /Do NOT/i, "final clean if polished upstream");
  // client stores raw result; parseChefReply cleans for UI
  const parsed = parseChefReply(out.result);
  excludes(parsed.spoken, /Do NOT/i, "spoken clean");
  eq(parsed.ids[0], ID.lobio, "id");
});

add("sse-error", "SSE error marks failed", async () => {
  const body = `data: ${JSON.stringify({ error: "Failed to generate AI response" })}\n\n`;
  const res = new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
  const out = await readAiWaiterReply(res);
  assert(!out.ok, "not ok");
});

add("sse-json-fallback", "JSON non-stream reply", async () => {
  const res = new Response(
    JSON.stringify({ result: `ok\nDISH_IDS: ${ID.salad}`, availableIds: [ID.salad] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  const out = await readAiWaiterReply(res);
  assert(out.ok, "ok");
  includes(out.result, ID.salad, "id");
});

const stressMsgs = [
  "მირჩიე რამე ნოყიერი",
  "მირჩიე მსუბუქი",
  "რა ღირს ბოსტნეულის სალათი?",
  "სალათის ინგრედიენტები",
  "ხარჩო რა ღირს?",
  "არის თუ არა ხარჩო?",
  "recommend fasting dishes",
  "suggest vegan plates",
  "მირჩიე ვეგანური",
  "посоветуй вегетарианские",
  "what allergens in Eggplant with walnuts?",
  "how much is Tarragon lemonade?",
  "Churchkhela ingredients?",
  "is Kids nuggets available?",
  "რა ღირს ჩურჩხელა?",
  "მირჩიე ღორის მწვადი",
  "მირჩიე ხინკალი",
  "pair wine with mtsvadi",
  "gluten-free vegetarian please",
  "no nuts, vegetarian options",
  "do you have lemonade?",
  "საფერავი ჭიქით რა ღირს?",
  "bottle price of Saperavi",
  "macros for Vegetable salad",
  "protein in Lobio",
  "fat in Pkhali",
  "carbs in khachapuri",
  "რამდენი ცილაა ლობიოში?",
  "იმერული ხაჭაპური რა ღირს?",
  "ხაჭაპურის შემადგენლობა",
];
stressMsgs.forEach((m, i) =>
  add(`stress-${i + 1}`, `stress ${m.slice(0, 32)}`, () => {
    const route = routeChefModel(m);
    assert(route === "lite" || route === "flash", "route");
    const fact = buildLocalChefFactReply({
      message: m,
      dishes: menu,
      locale: "ka",
      serviceFeePercent: 14,
    });
    const veg = buildLocalChefRecommendReply({
      message: m,
      dishes: menu,
      locale: "ka",
    });
    if (fact) {
      includes(fact, "DISH_IDS:", "fact ids");
      excludes(fact, /Do NOT repeat|_DISH_|CART &/i, "fact clean");
      const parsed = parseChefReply(fact);
      if (parsed.ids[0]) {
        assert(
          menu.some((d) => d.id === parsed.ids[0]),
          "known id",
        );
      }
    }
    if (veg) {
      const parsed = parseChefReply(veg);
      for (const id of parsed.ids) {
        const dish = menu.find((d) => d.id === id)!;
        assert(dish.is_available !== false, "available");
        assert(
          matchesPlantCheck(dish, m),
          `${dish.name} matches plant intent for ${m}`,
        );
      }
      excludes(veg, /Do NOT|_DISH_/i, "veg clean");
    }
    const focused = pickFocusedDishes(menu, m);
    assert(
      focused.every((d) => d.is_available !== false),
      "focus available",
    );
  }),
);

function matchesPlantCheck(dish: AssistantDish, message: string) {
  const tags = dishDietLabels({
    name: dish.name,
    description: dish.description,
    ingredients: dish.ingredients,
    allergens: dish.allergens,
    category: dish.category,
  }).join(" ");
  const fastingOnly =
    /(?:სამარხვ|მარხვ|vegan|fasting|постн|веган)/i.test(message) &&
    !/ვეგეტარ|vegetarian|вегетариан/i.test(message);
  if (fastingOnly) return /fasting|vegan/i.test(tags);
  return /vegetarian|fasting|vegan/i.test(tags);
}

add("cost-local-before-gemini", "handler still short-circuits local first", () => {
  const src = readFileSync(resolve("src/lib/ai-waiter-handler.ts"), "utf8");
  const factIdx = src.indexOf("buildLocalChefFactReply");
  const vegIdx = src.indexOf("buildLocalChefRecommendReply");
  const geminiIdx = src.indexOf("completeChefReply");
  assert(factIdx > 0 && vegIdx > 0 && geminiIdx > 0, "symbols");
  assert(factIdx < geminiIdx && vegIdx < geminiIdx, "local before gemini");
});

add("cost-warm-not-blocking-generate", "generate passes null cache", () => {
  const src = readFileSync(resolve("src/lib/ai-waiter-handler.ts"), "utf8");
  includes(src, "completeChefReply(\n            turnContents,\n            fullSystem,", "call");
  includes(src, "null,\n            maxOutputTokensForRoute(route)", "null cache");
});

// Run (supports async scenarios)
console.log(`Running ${scenarios.length} chef-chat scenarios…`);
(async () => {
  for (const s of scenarios) {
    try {
      await Promise.resolve(s.run());
      passes.push(s.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fails.push(`${s.id} — ${s.name}: ${msg}`);
    }
  }

  console.log(`PASS ${passes.length} / ${scenarios.length}`);
  if (fails.length) {
    console.log(`FAIL ${fails.length}`);
    for (const f of fails) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("All chef-chat scenarios passed.");
})();
