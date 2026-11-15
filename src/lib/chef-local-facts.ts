import {
  pickFocusedDishes,
  type AssistantDish,
} from "@/lib/ai-assistant";
import { isChefFactTurn, isChefRecommendTurn } from "@/lib/chat-suggestions";
import {
  dishDietLabels,
  dishMatchesDiet,
  inferDietFromText,
} from "@/lib/guest-diet";
import {
  formatMacro,
  hasDishNutrition,
  parseNutritionInput,
  parsePrepMinutes,
} from "@/lib/dish-nutrition";
import {
  allergenLabel,
  dishNameFromFields,
  formatGel,
  ingredientLabel,
  ui,
  type MenuLocale,
} from "@/lib/menu-copy";
import { repairParenthesizedTokens } from "@/lib/menu-list-normalize";
import { polishGeorgianGrammar } from "@/lib/ai/waiter";

export type ChefFactKind =
  | "price"
  | "ingredients"
  | "allergens"
  | "macros"
  | "prep"
  | "availability";

function stripKaEnding(word: string) {
  if (word.length < 4 || !/[\u10A0-\u10FF]/.test(word)) return word;
  const stripped = word.replace(
    /(?:ებისა|ების|ებს|ებით|ებში|ებზე|ისა|ის|ითა|ით|ში|ზე|თან|სა|ს|მა|ად|ი)$/u,
    "",
  );
  return stripped.length >= 3 ? stripped : word;
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

function queryTokens(raw: string) {
  return queryKey(raw)
    .split(" ")
    .filter((word) => word.length >= 3)
    .flatMap((word) => {
      const stem = stripKaEnding(word);
      return stem === word ? [word] : [word, stem];
    });
}

function scoreDishMatch(dish: AssistantDish, needles: string[]) {
  const names = [dish.name, dish.name_en, dish.name_ru]
    .map((value) => queryKey(String(value ?? "")))
    .filter(Boolean);
  const nameTokens = names.flatMap((name) => queryTokens(name));
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
  const blobTokens = new Set(queryTokens(blob));
  let score = 0;
  for (const needle of needles) {
    for (const name of names) {
      if (name === needle) score += 20;
      else if (name.includes(needle)) score += 12;
      else if (needle.includes(name) && name.length >= 4) score += 10;
    }
    for (const token of nameTokens) {
      if (token === needle) score += 14;
    }
    if (blob.includes(needle) || blobTokens.has(needle)) score += 4;
  }
  return score;
}

export function detectChefFactKind(message: string): ChefFactKind | null {
  const text = message.trim();
  if (!text || isChefRecommendTurn(text, []) || !isChefFactTurn(text)) {
    return null;
  }
  if (
    /რა ღირს|რა ფასი|ფასი|how much|price of|what(?:'s| is) the price|сколько стоит|цена/i.test(
      text,
    )
  ) {
    return "price";
  }
  if (
    /ingredients?|ინგრედიენტ|შემადგენლ|what(?:'s| is) in|из чего|состав/i.test(
      text,
    )
  ) {
    return "ingredients";
  }
  if (/allergen|ალერგენ|ალერგი|аллерг/i.test(text)) {
    return "allergens";
  }
  if (
    /calories?|კალორ|macros?|protein|ცილ|carb|ნახშირწყ|fat\b|ცხიმ/i.test(text)
  ) {
    return "macros";
  }
  if (/prep(?: time)?|რამდენ ხან|მზადდება|готов/i.test(text)) {
    return "prep";
  }
  if (/available|არის თუ არა|გაქვთ თუ|есть ли|в наличии/i.test(text)) {
    return "availability";
  }
  return "price";
}

export function matchNamedDishForFact(
  dishes: AssistantDish[],
  message: string,
  options?: { includeUnavailable?: boolean },
): AssistantDish | null {
  const pool = options?.includeUnavailable
    ? dishes
    : dishes.filter((dish) => dish.is_available !== false);
  if (!pool.length) return null;
  const full = queryKey(message);
  const words = queryTokens(message);
  const needles = [...new Set([full, ...words].filter(Boolean))];
  if (!needles.length) return null;

  const ranked = pool
    .map((dish) => ({ dish, score: scoreDishMatch(dish, needles) }))
    .filter((row) => row.score >= 10)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top) return null;
  const second = ranked[1];
  if (second && second.score >= top.score - 2 && second.score >= 12) {
    return null;
  }
  return top.dish;
}

function displayName(dish: AssistantDish, locale: MenuLocale) {
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

function withDishIds(spoken: string, dish: AssistantDish) {
  const id = String(dish.id ?? "").trim();
  return `${spoken.trim()}\nDISH_IDS: ${id || "none"}`;
}

function confirmKitchen(locale: MenuLocale) {
  if (locale === "en") {
    return "I will confirm the details with the kitchen for you.";
  }
  if (locale === "ru") {
    return "Уточню детали на кухне для Вас.";
  }
  return "დეტალებს სამზარეულოსთან გადავამოწმებ.";
}

function buildPriceReply(
  dish: AssistantDish,
  locale: MenuLocale,
  serviceFeePercent: number,
) {
  const name = displayName(dish, locale);
  const price = Number(dish.price);
  if (!Number.isFinite(price)) {
    return confirmKitchen(locale);
  }
  const fee = Math.max(0, Math.min(100, Number(serviceFeePercent) || 0));
  const withFee =
    fee > 0 ? Math.round(price * (1 + fee / 100) * 100) / 100 : price;
  if (locale === "en") {
    return fee > 0
      ? `${name} is ${formatGel(price)}, or ${formatGel(withFee)} including the ${fee}% service fee.`
      : `${name} is ${formatGel(price)}.`;
  }
  if (locale === "ru") {
    return fee > 0
      ? `${name} стоит ${formatGel(price)}, а с учётом сервисного сбора ${fee}% — ${formatGel(withFee)}.`
      : `${name} стоит ${formatGel(price)}.`;
  }
  return fee > 0
    ? `${name} ${formatGel(price)} ღირს, მომსახურების ${fee}%-იანი საკომისიოს ჩათვლით — ${formatGel(withFee)}.`
    : `${name} ${formatGel(price)} ღირს.`;
}

function buildIngredientsReply(dish: AssistantDish, locale: MenuLocale) {
  const name = displayName(dish, locale);
  const items = repairParenthesizedTokens(dish.ingredients ?? []).map((item) =>
    ingredientLabel(item, locale),
  );
  if (!items.length) return confirmKitchen(locale);
  if (locale === "en") {
    return `${name} is prepared with: ${items.join(", ")}.`;
  }
  if (locale === "ru") {
    return `${name} готовится из: ${items.join(", ")}.`;
  }
  return `${name} მზადდება შემდეგი ინგრედიენტებით: ${items.join(", ")}.`;
}

function buildAllergensReply(dish: AssistantDish, locale: MenuLocale) {
  const name = displayName(dish, locale);
  const items = repairParenthesizedTokens(dish.allergens ?? []).map((item) =>
    allergenLabel(item, locale),
  );
  if (!items.length) {
    if (locale === "en") {
      return `No allergens are printed for ${name} on our menu. Please also confirm with your waiter.`;
    }
    if (locale === "ru") {
      return `В меню для ${name} аллергены не указаны. Пожалуйста, также уточните у официанта.`;
    }
    return `${name}-ისთვის მენიუში ალერგენები მითითებული არ არის. გთხოვთ, მიმტანსაც გადაუმოწმოთ.`;
  }
  if (locale === "en") {
    return `${name} may contain: ${items.join(", ")}. Please also confirm with your waiter.`;
  }
  if (locale === "ru") {
    return `${name} может содержать: ${items.join(", ")}. Пожалуйста, также уточните у официанта.`;
  }
  return `${name} შეიძლება შეიცავდეს: ${items.join(", ")}. გთხოვთ, მიმტანსაც გადაუმოწმოთ.`;
}

function buildMacrosReply(dish: AssistantDish, locale: MenuLocale) {
  const name = displayName(dish, locale);
  if (!hasDishNutrition(dish)) return confirmKitchen(locale);
  const parts: string[] = [];
  const calories = parseNutritionInput(dish.calories);
  const protein = parseNutritionInput(dish.protein);
  const carbs = parseNutritionInput(dish.carbs);
  const fat = parseNutritionInput(dish.fat);
  if (calories != null) {
    parts.push(
      locale === "ru"
        ? `${formatMacro(calories)} ккал`
        : locale === "en"
          ? `${formatMacro(calories)} kcal`
          : `${formatMacro(calories)} კკალ`,
    );
  }
  if (protein != null) {
    parts.push(
      locale === "ru"
        ? `белки ${formatMacro(protein)} г`
        : locale === "en"
          ? `protein ${formatMacro(protein)}g`
          : `ცილა ${formatMacro(protein)}გ`,
    );
  }
  if (carbs != null) {
    parts.push(
      locale === "ru"
        ? `углеводы ${formatMacro(carbs)} г`
        : locale === "en"
          ? `carbs ${formatMacro(carbs)}g`
          : `ნახშირწყლები ${formatMacro(carbs)}გ`,
    );
  }
  if (fat != null) {
    parts.push(
      locale === "ru"
        ? `жиры ${formatMacro(fat)} г`
        : locale === "en"
          ? `fat ${formatMacro(fat)}g`
          : `ცხიმი ${formatMacro(fat)}გ`,
    );
  }
  if (locale === "en") return `For ${name}: ${parts.join(", ")}.`;
  if (locale === "ru") return `Для ${name}: ${parts.join(", ")}.`;
  return `${name}-ისთვის: ${parts.join(", ")}.`;
}

function buildPrepReply(dish: AssistantDish, locale: MenuLocale) {
  const name = displayName(dish, locale);
  const minutes = parsePrepMinutes(dish.prep_minutes);
  if (minutes == null) return confirmKitchen(locale);
  if (locale === "en") {
    return `${name} usually takes about ${minutes} minutes to prepare.`;
  }
  if (locale === "ru") {
    return `${name} обычно готовится около ${minutes} минут.`;
  }
  return `${name} დაახლოებით ${minutes} წუთში მზადდება.`;
}

function buildAvailabilityReply(dish: AssistantDish, locale: MenuLocale) {
  const name = displayName(dish, locale);
  const available = dish.is_available !== false;
  if (locale === "en") {
    return available
      ? `Yes — ${name} is currently available.`
      : `${name} is not available right now.`;
  }
  if (locale === "ru") {
    return available
      ? `Да — ${name} сейчас есть в меню.`
      : `${name} сейчас недоступно.`;
  }
  return available
    ? `დიახ — ${name} ამჟამად ხელმისაწვდომია.`
    : `${name} ამჟამად ხელმისაწვდომი არ არის.`;
}

export function buildLocalChefFactReply(input: {
  message: string;
  dishes: AssistantDish[];
  locale: MenuLocale;
  serviceFeePercent?: number;
}): string | null {
  const kind = detectChefFactKind(input.message);
  if (!kind) return null;
  const dish = matchNamedDishForFact(input.dishes, input.message, {
    includeUnavailable: kind === "availability",
  });
  if (!dish) return null;

  let spoken = "";
  switch (kind) {
    case "price":
      spoken = buildPriceReply(
        dish,
        input.locale,
        input.serviceFeePercent ?? 0,
      );
      break;
    case "ingredients":
      spoken = buildIngredientsReply(dish, input.locale);
      break;
    case "allergens":
      spoken = buildAllergensReply(dish, input.locale);
      break;
    case "macros":
      spoken = buildMacrosReply(dish, input.locale);
      break;
    case "prep":
      spoken = buildPrepReply(dish, input.locale);
      break;
    case "availability":
      spoken = buildAvailabilityReply(dish, input.locale);
      break;
  }

  return withDishIds(polishGeorgianGrammar(spoken), dish);
}

const VEGETARIAN_RECOMMEND_RE =
  /ვეგეტარ|სამარხვ|მარხვ|vegetarian|vegan|fasting|вегетариан|постн|постан|веган/i;

/** Strict fasting/vegan only — not the broader "vegetarian OR fasting" chip. */
const FASTING_ONLY_RE =
  /სამარხვ|მარხვ|vegan|fasting|постн|постан|веган/i;
const VEGETARIAN_WORD_RE =
  /ვეგეტარ|vegetarian|вегетариан/i;

function isClearVegetarianRecommend(message: string) {
  const text = message.trim();
  if (!VEGETARIAN_RECOMMEND_RE.test(text)) return false;
  if (
    !isChefRecommendTurn(text, []) &&
    !/მირჩი|შეათავაზ|recommend|suggest|посовет|please|მინდა|хочу|want|options|კერძ|блюд|dishes|plates|მენიუ|меню|menu/i.test(
      text,
    )
  ) {
    return false;
  }
  // Leave mixed requests (wine + veg, kids + veg) to Gemini.
  if (
    /ღვინ|wine|beer|ლუდ|საბავშვ|kids|spicy|ცხარ|ბესტსელ|bestseller|დესერტ|dessert/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

function dietTagsFor(dish: AssistantDish) {
  return dishDietLabels({
    name: dish.name,
    description: dish.description,
    ingredients: dish.ingredients,
    allergens: dish.allergens,
    category: dish.category,
  });
}

function wantsFastingOnly(message: string) {
  const text = message.trim();
  // Chip "სამარხვო ან ვეგეტარიანული" explicitly allows dairy vegetarian.
  if (VEGETARIAN_WORD_RE.test(text)) return false;
  return FASTING_ONLY_RE.test(text);
}

function matchesPlantIntent(dish: AssistantDish, message: string) {
  const tags = dietTagsFor(dish).join(" ");
  if (wantsFastingOnly(message)) {
    return /fasting|vegan|სამარხვ|ვეგან/i.test(tags);
  }
  return /vegetarian|fasting|vegan|სამარხვ|ვეგეტარ|ვეგან/i.test(tags);
}

function withManyDishIds(spoken: string, dishes: AssistantDish[]) {
  const ids = dishes
    .map((dish) => String(dish.id ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return `${spoken.trim()}\nDISH_IDS: ${ids.length ? ids.join(",") : "none"}`;
}

function buildVegetarianRecommendSpoken(
  dishes: AssistantDish[],
  locale: MenuLocale,
) {
  const names = dishes.map((dish) => displayName(dish, locale));
  if (locale === "en") {
    return `From tonight's vegetarian and fasting plates I recommend ${names.join(", ")}. All are printed on our live menu — tell me if you want dairy-free only.`;
  }
  if (locale === "ru") {
    return `Из постных и вегетарианских блюд меню рекомендую: ${names.join(", ")}. Если нужен полностью без молочных продуктов — скажите.`;
  }
  return `სამარხვო და ვეგეტარიანული კერძებიდან გირჩევთ: ${names.join(", ")}. თუ მხოლოდ რძის პროდუქტების გარეშე გსურთ, მითხარით.`;
}

/** True when this message itself asks what goes with a dish/drink. */
export function isOfficialPairingQuestion(message: string) {
  const text = message.trim();
  if (!text) return false;
  return /რა\s*შევუკვეთ|რა\s*შევუ?ს?ა?ბ?ამ|რა\s*შევუხამ|რა\s*შეუხამ|რა\s*უხდ|რასთან|შევუსაბამ|შევუხამ|შეუხამ|შეხამ|უხამო|pairing|pairs?\s+with|goes\s+with|what\s+(should|to)?\s*(i\s+)?(order|pair|drink)|с\s*чем|что\s*(заказать|сочета|подоб)|сочета|подобь|подобрать|напит.*к\b|ღვინ.*კერძ|wine.*with/i.test(
    text,
  );
}

/** Browse / category / recommend — never treat as pairing follow-up. */
export function isMenuBrowseQuestion(message: string) {
  const text = message.trim();
  if (!text || isOfficialPairingQuestion(text)) return false;
  return /რა\s*გაქვთ|რა\s*არის|მენიუში|მირჩიე|მირჩიეთ|recommend|suggest|show\s+me|დესერტ|dessert|десерт|სალათ|წვნიან|soup|salad|სასმელ|drink|напит|kids|საბავშვ|ვეგეტარ|სამარხვ|ვეგან|გლუტენ|რძის|dairy|bestseller|ბესტსელ|რა\s*ღირს|ინგრედიენტ|ალერგ|calories?|კალორ|what\s+do\s+you\s+have|что\s+есть|какие/i.test(
    text,
  );
}

/**
 * Short follow-up that only names a dish after a pairing ask
 * (e.g. "ხინკალზე?", "ხინკალს?", "and khinkali?").
 */
export function isPairingDishFollowUp(message: string) {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (isOfficialPairingQuestion(trimmed) || isMenuBrowseQuestion(trimmed)) {
    return false;
  }
  const bare = trimmed.replace(/[?!।.…]+$/g, "").trim();
  const words = bare.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  // Interrogatives that aren't a bare dish name.
  if (/^(რა|რომელ|როგორ|what|which|how|что|какие|какой)\b/i.test(bare)) {
    return false;
  }
  return /[\u10A0-\u10FF]{3,}|\b[a-zA-Zа-яА-ЯёЁ]{3,}/.test(bare);
}

/** Recent chat already established a "what pairs with …" thread. */
export function historyHasPairingIntent(
  history: Array<{ role?: string; content?: string }>,
) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (!item || item.role !== "user") continue;
    const text = String(item.content ?? "").trim();
    if (isOfficialPairingQuestion(text)) return true;
    // A browse/recommend turn ends the pairing thread.
    if (isMenuBrowseQuestion(text)) break;
    // Stop at the previous distinct topic after a few user turns.
    if (text.length > 40) break;
  }
  return false;
}

/**
 * Pairing intent from this message OR follow-up dish name after a pairing ask
 * (e.g. "რა შევუსაბამო ხაჭაპურს?" → "ხინკალზე?").
 */
export function hasPairingIntent(
  message: string,
  history: Array<{ role?: string; content?: string }> = [],
) {
  if (isOfficialPairingQuestion(message)) return true;
  if (isMenuBrowseQuestion(message)) return false;
  if (!historyHasPairingIntent(history)) return false;
  return isPairingDishFollowUp(message);
}

/** Resolve which menu dish the guest wants companions for. */
export function resolvePairingSubject(
  dishes: AssistantDish[],
  message: string,
): AssistantDish | null {
  return matchNamedDishForFact(dishes, message, { includeUnavailable: true });
}

/**
 * Admin-curated companions only. Understands follow-ups in a pairing thread.
 * If the named dish has no pairs_with list, refuse to invent a pairing answer.
 */
export function buildLocalChefPairingReply(input: {
  message: string;
  dishes: AssistantDish[];
  locale: MenuLocale;
  history?: Array<{ role?: string; content?: string }>;
}): string | null {
  const history = input.history ?? [];
  if (!hasPairingIntent(input.message, history)) return null;

  const copy = ui[input.locale];
  const subject = resolvePairingSubject(input.dishes, input.message);
  if (!subject) {
    // Explicit pairing ask without a dish → ask for a name.
    // Ambiguous follow-ups fall through to Gemini (e.g. category browse).
    if (!isOfficialPairingQuestion(input.message)) return null;
    const ask =
      input.locale === "en"
        ? "Which dish or drink should I check companions for? Name one item from this menu."
        : input.locale === "ru"
          ? "Для какого блюда или напитка проверить сочетания? Назовите позицию из этого меню."
          : "რომელ კერძს ან სასმელს შევუსაბამო? მითხარით მენიუდან ერთი პოზიციის სახელი.";
    return `${polishGeorgianGrammar(ask)}\nDISH_IDS: none`;
  }

  const subjectName = displayName(subject, input.locale);
  const byId = new Map(
    input.dishes
      .filter((dish) => dish.id)
      .map((dish) => [String(dish.id).toLowerCase(), dish] as const),
  );
  const companionIds = (subject.pairing_dish_ids ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  const companions = companionIds
    .map((id) => byId.get(id.toLowerCase()))
    .filter((dish): dish is AssistantDish => Boolean(dish))
    .filter((dish) => dish.is_available !== false);

  if (!companionIds.length || !companions.length) {
    return `${polishGeorgianGrammar(copy.noOfficialPairing(subjectName))}\nDISH_IDS: none`;
  }

  const names = companions.map((dish) => displayName(dish, input.locale));
  const list =
    names.length <= 1
      ? names[0] ?? ""
      : input.locale === "en"
        ? `${names.slice(0, -1).join(", ")}${names.length > 2 ? "," : ""} and ${names[names.length - 1]}`
        : input.locale === "ru"
          ? `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`
          : `${names.slice(0, -1).join(", ")} და ${names[names.length - 1]}`;
  const spoken = polishGeorgianGrammar(
    `${copy.officialPairingIntro(subjectName)} ${list}.`,
  );
  const ids = companions
    .map((dish) => String(dish.id ?? "").trim())
    .filter(Boolean);
  return `${spoken}\nDISH_IDS: ${ids.join(",")}`;
}

type LocalCategoryKind = "dessert" | "drink" | "salad" | "soup" | "kids";

function detectBrowseCategory(message: string): LocalCategoryKind | null {
  const text = message.trim();
  if (!text || isOfficialPairingQuestion(text)) return null;
  // Require a browse/list intent so bare "დესერტი" after pairing still pairs.
  const browse =
    /რა\s*გაქვთ|რა\s*არის|მენიუში|მირჩიე|მირჩიეთ|recommend|suggest|show|what\s+do\s+you\s+have|какие|что\s+есть/i.test(
      text,
    ) || /დესერტ|dessert|десерт|სალათ|salad|салат|წვნიან|სუპ|soup|суп|სასმელ|drink|напит|ღვინ|wine|საბავშვ|kids|детск/i.test(
      text,
    );
  if (!browse) return null;
  if (/დესერტ|ტკბილ|ნაყინ|dessert|десерт|сладк/i.test(text)) return "dessert";
  if (/სალათ|salad|салат/i.test(text)) return "salad";
  if (/წვნიან|სუპ|soup|суп/i.test(text)) return "soup";
  if (/საბავშვ|kids|child|детск/i.test(text)) return "kids";
  if (/სასმელ|ღვინ|wine|drink|напит|ლიმონათ|lemonade/i.test(text)) return "drink";
  return null;
}

function dishMatchesBrowseCategory(
  dish: AssistantDish,
  kind: LocalCategoryKind,
) {
  const blob = `${dish.name} ${dish.category ?? ""} ${dish.description ?? ""}`.toLowerCase();
  if (kind === "dessert") {
    return /დესერტ|ტკბილ|ნაყინ|ფელამუშ|churchkhela|dessert|десерт|сладк|თაფლ|ნამცხვ|cake|торт/.test(
      blob,
    );
  }
  if (kind === "salad") return /სალათ|salad|салат/.test(blob);
  if (kind === "soup") return /სუპ|წვნიან|soup|суп|ხარჩო|lobio|ლობიო/.test(blob);
  if (kind === "kids") return /საბავშვ|kids|child|детск|ნაგეტ|nugget/.test(blob);
  return /ღვინ|საფერავ|რქაწითელ|ლიმონათ|ტარხუნ|სასმელ|wine|drink|lemonade|напит|вино|пиво|ლუდ/.test(
    blob,
  );
}

/** Instant $0 path for clear category browse ("დესერტი რა გაქვთ?"). */
export function buildLocalChefCategoryReply(input: {
  message: string;
  dishes: AssistantDish[];
  locale: MenuLocale;
}): string | null {
  const kind = detectBrowseCategory(input.message);
  if (!kind) return null;
  // Don't steal complex multi-constraint recommends from Gemini/Flash.
  if (
    /სამარხვ|ვეგეტარ|vegetarian|vegan|გლუტენ|gluten|რძის|dairy|ბიუჯეტ|budget|ლანჩ|lunch/i.test(
      input.message,
    )
  ) {
    return null;
  }

  const matches = input.dishes
    .filter((dish) => dish.is_available !== false)
    .filter((dish) => dishMatchesBrowseCategory(dish, kind))
    .slice(0, 5);
  const labels =
    input.locale === "en"
      ? {
          dessert: "desserts",
          drink: "drinks",
          salad: "salads",
          soup: "soups",
          kids: "kids' dishes",
          empty: (k: string) =>
            `We do not currently have ${k} on this menu.`,
          intro: (k: string, names: string) =>
            `On our menu for ${k}: ${names}.`,
        }
      : input.locale === "ru"
        ? {
            dessert: "десерты",
            drink: "напитки",
            salad: "салаты",
            soup: "супы",
            kids: "детские блюда",
            empty: (k: string) => `В меню сейчас нет позиции: ${k}.`,
            intro: (k: string, names: string) =>
              `В нашем меню из раздела «${k}»: ${names}.`,
          }
        : {
            dessert: "დესერტები",
            drink: "სასმელები",
            salad: "სალათები",
            soup: "წვნიანები",
            kids: "საბავშვო კერძები",
            empty: (k: string) =>
              `ჩვენს მენიუში ${k} ამჟამად არ არის.`,
            intro: (k: string, names: string) =>
              `ჩვენს მენიუში ${k}: ${names}.`,
          };

  const label = labels[kind];
  if (!matches.length) {
    return `${polishGeorgianGrammar(labels.empty(label))}\nDISH_IDS: none`;
  }
  const names = matches.map((dish) => displayName(dish, input.locale));
  const list =
    names.length <= 1
      ? names[0] ?? ""
      : input.locale === "en"
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : input.locale === "ru"
          ? `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`
          : `${names.slice(0, -1).join(", ")} და ${names[names.length - 1]}`;
  const spoken = polishGeorgianGrammar(labels.intro(label, list));
  const ids = matches
    .map((dish) => String(dish.id ?? "").trim())
    .filter(Boolean);
  return `${spoken}\nDISH_IDS: ${ids.join(",")}`;
}

/** Instant $0 path for clear vegetarian/fasting recommend chips. */
export function buildLocalChefRecommendReply(input: {
  message: string;
  dishes: AssistantDish[];
  locale: MenuLocale;
  priorIds?: string[];
}): string | null {
  if (!isClearVegetarianRecommend(input.message)) return null;
  const diet = inferDietFromText(input.message);
  if (wantsFastingOnly(input.message)) {
    diet.vegan = true;
    diet.vegetarian = true;
  } else if (!diet.vegetarian && !diet.vegan) {
    diet.vegetarian = true;
  }
  const focused = pickFocusedDishes(
    input.dishes,
    input.message,
    input.priorIds ?? [],
    8,
  )
    .filter((dish) => matchesPlantIntent(dish, input.message))
    .filter((dish) => dishMatchesDiet(dish, diet))
    .slice(0, 3);
  if (!focused.length) {
    const empty =
      input.locale === "en"
        ? "We do not currently have a vegetarian or fasting dish on our menu."
        : input.locale === "ru"
          ? "В нашем меню сейчас нет постного или вегетарианского блюда."
          : "ჩვენს მენიუში სამარხვო ან ვეგეტარიანული კერძი ამჟამად არ არის.";
    return `${polishGeorgianGrammar(empty)}\nDISH_IDS: none`;
  }
  return withManyDishIds(
    polishGeorgianGrammar(
      buildVegetarianRecommendSpoken(focused, input.locale),
    ),
    focused,
  );
}
