import { polishGeorgianGrammar } from "@/lib/ai/waiter";
import { dishMatchesDiet, type DietFilter } from "@/lib/guest-diet";
import { dishLabel } from "@/lib/menu-copy";

export type ChatSuggestDish = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string | null;
  allergens: string[] | null;
  is_available: boolean;
  category?: string;
  category_id?: string;
  ingredients?: string[] | null;
  wine_pairing?: string | null;
  pairing_dish_ids?: string[] | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  prep_minutes?: number | null;
  pairReason?: string;
};

export function isChefRecommendTurn(userText: string, ids: string[]) {
  if (ids.length >= 2) return true;
  return /recommend|suggest|pairing|მირჩიე|შეათავაზ|რა გაქვთ|სხვა|посовет|что ещё|what'?s good|what else/i.test(
    userText,
  );
}

/** Open / multi-constraint recommend — Flash. Simple browse stays Lite. */
export function isComplexChefRecommend(message: string) {
  const text = message.trim();
  if (!text) return false;
  return /მირჩიე|მირჩიეთ|recommend|suggest|ბესტსელ|bestseller|ტოპ\s*\d|top\s*\d|სხვა\s*რამე|what else|посовет|ლანჩ|lunch|ბიუჯეტ|budget|under\s*₾|under\s*\$|ორი\s*სტუმრ|dinner for|party|რა\s*შევუკვეთოთ|choose for me|სამარხვ|ვეგეტარ|vegetarian|vegan|გლუტენ|gluten|რძის|dairy|allergen/i.test(
    text,
  );
}

const CHEF_FACT_RE =
  /რა ღირს|რა ფასი|ფასი|how much|what(?:'s| is) (?:in|the price)|price of|сколько стоит|сколько|цена|стоит|ingredients?|ингредиент|состав|из чего|ინგრედიენტ|შემადგენლ|allergen|аллерг|ალერგენ|ალერგი|calories?|калор|ккал|კალორ|macros?|protein|белк|prep(?: time)?|готов|რამდენ ხან|მზადდება|available|в наличии|есть ли|არის თუ არა|გაქვთ თუ/i;

export function isChefFactTurn(userText: string) {
  return CHEF_FACT_RE.test(userText.trim());
}

/**
 * Lite is primary for standard turns (facts, simple browse).
 * Flash only for complex open recommend / multi-constraint prompts.
 */
export function routeChefModel(message: string): "flash" | "lite" {
  const text = message.trim();
  if (isComplexChefRecommend(text)) return "flash";
  return "lite";
}

const LIGHT_RE = /სალათ|სუპ|salad|soup|салат|суп|cold starter|ცივი/i;
const HEARTY_RE =
  /ხინკალ|მწვად|ქაბაბ|ხაჭაპურ|ხორც|khinkali|mtsvadi|kebab|khachapuri|grill|main|хинкал|мангал|хачапур/i;
const DESSERT_RE = /დესერტ|ტკბილ|ნაყინ|ფელამუშ|churchkhela|dessert|сладк|десерт/i;
const KIDS_RE = /საბავშვ|კარტოფილ|ნაგეტ|child|kids|детск|картофел/i;
const DRINK_RE =
  /ლიმონათ|lemonade|напит|ღვინ|wine|beer|ლუდ|სასმელ|drink|juice|წვენ|soda|компот/i;
const WINE_RE =
  /ღვინ|wine|beer|ლუდ|вино|пиво|საფერავ|qvevri|სასმელ|drink|напит/i;
const KHINKALI_RE = /ხინკალ|khinkali|хинкал/i;

function dishSearchBlob(dish: ChatSuggestDish) {
  return `${dish.name} ${dish.category ?? ""} ${dish.description ?? ""}`;
}

export function menuHasMatch(
  dishes: ChatSuggestDish[],
  pattern: RegExp,
) {
  return dishes.some(
    (dish) => dish.is_available !== false && pattern.test(dishSearchBlob(dish)),
  );
}

export function menuHasDrink(dishes: ChatSuggestDish[]) {
  return menuHasMatch(dishes, WINE_RE) || menuHasMatch(dishes, DRINK_RE);
}

export function menuHasDessert(dishes: ChatSuggestDish[]) {
  return menuHasMatch(dishes, DESSERT_RE);
}

export function menuHasKids(dishes: ChatSuggestDish[]) {
  return menuHasMatch(dishes, KIDS_RE);
}

export function menuHasKhinkali(dishes: ChatSuggestDish[]) {
  return menuHasMatch(dishes, KHINKALI_RE);
}

export function guestAskedForAlcohol(text: string) {
  return /ღვინ|ლუდ|wine|beer|вино|пиво|alcohol|ალკოჰოლ|საფერავ|pair(ing)?/i.test(
    text,
  );
}

export function shouldSuppressAlcohol(options: {
  lastUser: string;
  diet: DietFilter;
  maxPrice?: number;
}) {
  if (guestAskedForAlcohol(options.lastUser)) return false;
  if (
    options.diet.blockedAllergens.length ||
    options.diet.vegetarian ||
    options.diet.vegan
  ) {
    return true;
  }
  if (options.maxPrice != null && options.maxPrice <= 25) return true;
  return /საბავშვ|kids['’]?s?\s*menu|детск|სწრაფი ლანჩ|quick lunch|fast lunch|быстр\w*\s*ланч/i.test(
    options.lastUser,
  );
}

export function pairingLine(
  dish: ChatSuggestDish,
  _pairKhinkali: string,
  pairWith: (pairing: string) => string,
  skipAlcohol = false,
) {
  if (skipAlcohol) return "";
  // Only admin/printed wine_pairing — never invent khinkali→saperavi defaults.
  const listed = dish.wine_pairing?.trim();
  if (listed) return pairWith(listed);
  return "";
}

const CHEF_LEAK_LINE =
  /^(do not|don't|never|output exactly|when recommending|turn[_ ]?(data|context)|guest question|live menu|cart &|active mix|flavor pairing|specific-dish|browse \/|mandatory when|internal —|reply only to|wait,?\s+if the guest|a pairing\/drink)/i;

/** Trailing English instruction dumps (not whole-line headers before guest prose). */
const CHEF_LEAK_TAIL =
  /(?:\n|^)\s*(?:\.{0,3}\s*)?(?:When recommending|Wait,?\s+if the guest|output EXACTLY\s+\d+\s+ids|CART &\s*3-CARD PAIRING)[\s\S]*$/i;

/** True when the model echoed system/turn rules instead of guest prose. */
export function chefReplyLooksLeaked(text: string) {
  const value = text.trim();
  if (!value) return false;
  if (CHEF_LEAK_TAIL.test(value)) return true;
  if (
    /output EXACTLY\s+\d+\s+ids|CART &\s*3-CARD|systemInstruction|LIVE MENU FULL CARDS|regular adult meal/i.test(
      value,
    )
  ) {
    return true;
  }
  // English-only text: flag instruction echoes, not normal EN guest prose
  // ("I recommend our Khinkali from the menu" must remain acceptable).
  const hasGuestScript = /[\u10A0-\u10FFА-Яа-яЁё]/.test(value);
  if (!hasGuestScript) {
    if (
      /\b(output EXACTLY|systemInstruction|LIVE MENU FULL|When recommending|CART &\s*3-CARD|do not invent|pairs_with|mandatory whenever)\b/i.test(
        value,
      )
    ) {
      return true;
    }
    const lines = value
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const instructionish = lines.filter((line) => CHEF_LEAK_LINE.test(line));
    if (
      lines.length >= 2 &&
      instructionish.length >= Math.ceil(lines.length * 0.6)
    ) {
      return true;
    }
  }
  return false;
}

/** Strip leaked system/turn instructions the model sometimes echoes. */
export function scrubChefInstructionLeak(text: string) {
  return text
    .replace(/\n?\s*\*?\*?DISH_IDS?\*?\*?:\s*[\s\S]*$/i, "\n")
    .replace(/\[id:[^\]]*\]?/gi, "")
    .replace(/\bdo not repeat[^.!\n]*_?dish_?[^.!\n]*/gi, "")
    .replace(/\bdo not repeat[^.!\n]*(cart|items)[^.!\n]*/gi, "")
    .replace(CHEF_LEAK_TAIL, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (CHEF_LEAK_LINE.test(trimmed)) return false;
      if (/repeat (items |cart )/i.test(trimmed)) return false;
      if (/_?DISH_?/i.test(trimmed) && /repeat|cart|do not/i.test(trimmed)) {
        return false;
      }
      if (/^DISH_?I?D?S?\b/i.test(trimmed)) return false;
      if (
        /when recommending|output exactly|cart &\s*3-card|wait,?\s+if the guest|regular adult meal/i.test(
          trimmed,
        )
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Recover or append DISH_IDS so truncation does not force a second model bill. */
export function ensureChefDishIdsTrailer(raw: string) {
  const text = String(raw ?? "").trim();
  if (!text) return text;
  if (/DISH_IDS:\s*\S+/i.test(text)) return text;
  const spoken = scrubChefInstructionLeak(text);
  if (!spoken || spoken.length < 12) return text;
  const ids = text.match(UUID_IN_TEXT_RE);
  if (ids?.length) {
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
    return `${spoken.trim()}\nDISH_IDS: ${unique.join(",")}`;
  }
  return `${spoken.trim()}\nDISH_IDS: none`;
}

/** Guest-facing reply that finished with DISH_IDS and is not an instruction leak. */
export function isAcceptableChefReply(raw: string) {
  const withIds = ensureChefDishIdsTrailer(raw);
  if (!/DISH_IDS:\s*\S+/i.test(withIds)) return false;
  if (chefReplyLooksLeaked(withIds)) return false;
  const spoken = scrubChefInstructionLeak(withIds);
  if (!spoken || spoken.length < 12) return false;
  if (chefReplyLooksLeaked(spoken)) return false;
  return true;
}

export function parseChefReply(raw: string) {
  const match = raw.match(/\n?\s*\*?\*?DISH_IDS?\*?\*?:\s*([\s\S]*)$/i);
  const listed = match?.[1]?.trim() ?? "";
  const uuidMatches = listed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  );
  const ids =
    !listed || /^none\b/i.test(listed)
      ? []
      : uuidMatches && uuidMatches.length > 0
        ? uuidMatches.map((id) => id.toLowerCase())
        : listed
            .split(/[\n,\s]+/)
            .map((id) => id.replace(/^\[?(?:id:)?|\]?$/gi, "").trim())
            .filter((id) => id.length > 8);
  const spoken = polishGeorgianGrammar(scrubChefInstructionLeak(raw));
  return { spoken, ids };
}

export function visibleChefText(raw: string) {
  const cleaned = polishGeorgianGrammar(scrubChefInstructionLeak(raw));
  if (
    /\n\s*\*?\*?DISH_?I?D?S?\*?\*?\s*:?\s*$/i.test(cleaned) ||
    /\n\s*\*?\*?DISH\s*$/i.test(cleaned)
  ) {
    return cleaned.replace(/\n\s*\*?\*?DISH_?I?D?S?\*?\*?\s*:?\s*$/i, "");
  }
  return cleaned;
}

export function dishesForLiveStock(
  dishes: ChatSuggestDish[],
  availableIds?: string[] | null,
) {
  if (Array.isArray(availableIds)) {
    const allowed = new Set(
      availableIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
    );
    return dishes.filter(
      (dish) =>
        allowed.has(dish.id.toLowerCase()) && dish.is_available !== false,
    );
  }
  return dishes.filter((dish) => dish.is_available !== false);
}

export function dishesFromIds(
  ids: string[],
  dishes: ChatSuggestDish[],
  limit = 3,
) {
  const byId = new Map(
    dishes.map((dish) => [dish.id.toLowerCase(), dish] as const),
  );
  const out: ChatSuggestDish[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const dish = byId.get(id.toLowerCase());
    if (!dish || dish.is_available === false || seen.has(dish.id)) continue;
    seen.add(dish.id);
    out.push(dish);
    if (out.length >= limit) break;
  }
  return out;
}

const STOP_TOKENS = new Set([
  "ცალი",
  "ც",
  "პერს",
  "მლ",
  "ლ",
  "და",
  "ან",
  "pcs",
  "pc",
  "ml",
  "with",
  "and",
  "in",
  "the",
  "of",
  "for",
  "шт",
  "перс",
  "мл",
  "из",
  "на",
  "со",
  "с",
  "и",
  "в",
]);

function normalizeQuotesAndPunct(input: string): string {
  return input
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[„“”"«»'’`(),.!?;:—–/\\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordStem(rawWord: string): string {
  const word = rawWord.trim();
  if (word.length < 3) return word;

  if (/[\u10A0-\u10FF]/.test(word)) {
    let stem = word;
    if (stem.length >= 4) {
      const stripped = stem.replace(
        /(?:ებისა|ების|ებს|ებით|ებში|ებზე|ისა|ის|ითა|ით|ში|ზე|თან|სა|ს|მა|ად|ი)$/u,
        "",
      );
      if (stripped.length >= 3) stem = stripped;
    }
    stem = stem
      .replace(/^კალაკურ/, "ქალაქურ")
      .replace(/^ხინკლ/, "ხინკალ")
      .replace(/^საქონლ/, "საქონელ")
      .replace(/^ბადრიჯნ/, "ბადრიჯან")
      .replace(/^ჭარხლ/, "ჭარხალ");
    return stem;
  }

  if (/[\u0400-\u04FF]/.test(word)) {
    if (word.length >= 5) {
      const stripped = word.replace(
        /(?:ого|его|ому|ему|ыми|ими|ами|ями|ой|ей|ую|юю|ом|ем|ах|ях|ам|ям|ов|ев|ий|ый|ая|яя|ое|ее|ые|ие|а|я|у|ю|е|и|ы|о)$/u,
        "",
      );
      if (stripped.length >= 3) return stripped;
    }
    return word;
  }

  if (word.length >= 5 && word.endsWith("s")) {
    return word.slice(0, -1);
  }
  return word;
}

function tokenizeForMatch(input: string) {
  const clean = normalizeQuotesAndPunct(input);
  const rawTokens = clean.split(" ").filter(Boolean);
  const stems: string[] = [];
  const numbers: string[] = [];

  for (const tok of rawTokens) {
    if (STOP_TOKENS.has(tok)) continue;
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      numbers.push(tok);
      continue;
    }
    const stem = wordStem(tok);
    if (stem.length >= 3) {
      stems.push(stem);
    }
  }
  return { clean, stems, numbers };
}

export function matchDishesInReply(
  text: string,
  dishes: ChatSuggestDish[],
  limit = 3,
) {
  const replyTokens = tokenizeForMatch(text);
  if (!replyTokens.clean) return [];

  const ranked: { dish: ChatSuggestDish; score: number; firstPos: number }[] =
    [];

  for (const dish of dishes) {
    if (dish.is_available === false) continue;
    const labels = [
      dish.name,
      dishLabel(dish.name, "ka"),
      dishLabel(dish.name, "en"),
      dishLabel(dish.name, "ru"),
    ];
    let bestScore = 0;
    let bestPos = Number.MAX_SAFE_INTEGER;

    for (const label of labels) {
      const { clean, stems, numbers } = tokenizeForMatch(label);
      if (!clean || clean.length < 4) continue;

      // 1. Direct normalized substring match
      const directIdx = replyTokens.clean.indexOf(clean);
      if (directIdx !== -1) {
        bestScore = Math.max(bestScore, clean.length + 20);
        bestPos = Math.min(bestPos, directIdx);
        continue;
      }

      if (!stems.length) continue;

      // 2. Stem & word-order-independent match (handles "ქალაქური ხინკალი",
      // "ქალაქურ ხინკალს", "საფირმო ხაჭაპური „სამეფო“", etc.)
      let matchedStems = 0;
      let matchedChars = 0;
      let earliestStemPos = Number.MAX_SAFE_INTEGER;

      for (const stem of stems) {
        const idx = replyTokens.stems.findIndex(
          (rStem) =>
            rStem === stem ||
            (stem.length >= 4 && rStem.startsWith(stem)) ||
            (rStem.length >= 4 && stem.startsWith(rStem)),
        );
        if (idx !== -1) {
          matchedStems += 1;
          matchedChars += stem.length;
          earliestStemPos = Math.min(earliestStemPos, idx);
        }
      }

      const allStemsMatched = matchedStems === stems.length;
      const highPartialMatch =
        stems.length >= 3 &&
        matchedStems >= stems.length - 1 &&
        matchedChars >= 10;

      if (!allStemsMatched && !highPartialMatch) continue;
      if (stems.length === 1 && matchedChars < 4) continue;

      let numberBonus = 0;
      if (numbers.length > 0) {
        const hasNumber = numbers.every((num) =>
          replyTokens.numbers.includes(num),
        );
        if (hasNumber) {
          numberBonus = 4;
        } else if (stems.length === 1) {
          continue;
        }
      }

      const candidateScore = matchedChars + matchedStems * 3 + numberBonus;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestPos = Math.min(bestPos, earliestStemPos);
      }
    }

    if (bestScore > 0) {
      ranked.push({ dish, score: bestScore, firstPos: bestPos });
    }
  }

  ranked.sort((a, b) => a.firstPos - b.firstPos || b.score - a.score);
  const seen = new Set<string>();
  const out: ChatSuggestDish[] = [];
  for (const row of ranked) {
    if (seen.has(row.dish.id)) continue;
    seen.add(row.dish.id);
    out.push(row.dish);
    if (out.length >= limit) break;
  }
  return out;
}

export function pickQuizDishes(
  dishes: ChatSuggestDish[],
  answers: { vegetarian: boolean; hearty: boolean },
  diet: DietFilter,
  maxPrice?: number,
  serviceFeePercent = 0,
) {
  const feeRate = Math.max(0, Number(serviceFeePercent) || 0) / 100;
  const priceWithFee = (price: number) =>
    Math.round(price * (1 + feeRate) * 100) / 100;
  const nextDiet: DietFilter = {
    ...diet,
    vegetarian: diet.vegetarian || answers.vegetarian,
    vegan: diet.vegan,
    blockedAllergens: [...diet.blockedAllergens],
  };

  const scored = dishes
    .filter((dish) => dish.is_available !== false)
    .filter((dish) => dishMatchesDiet(dish, nextDiet))
    .filter((dish) =>
      maxPrice ? priceWithFee(dish.price) <= maxPrice : true,
    )
    .map((dish) => {
      const blob = `${dish.name} ${dish.category ?? ""} ${dish.description}`;
      let score = 1;
      if (DRINK_RE.test(blob)) score -= 8;
      if (!answers.vegetarian && HEARTY_RE.test(blob)) score += 5;
      if (answers.hearty && HEARTY_RE.test(blob)) score += 4;
      if (!answers.hearty && LIGHT_RE.test(blob)) score += 4;
      if (answers.hearty && LIGHT_RE.test(blob)) score -= 2;
      if (!answers.hearty && HEARTY_RE.test(blob)) score -= 1;
      if (DESSERT_RE.test(blob) || KIDS_RE.test(blob)) score -= 2;
      return { dish, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.dish.price - b.dish.price);

  return scored.slice(0, 2).map((row) => row.dish);
}

export function toggleAllergen(diet: DietFilter, tag: string): DietFilter {
  const has = diet.blockedAllergens.includes(tag);
  return {
    ...diet,
    blockedAllergens: has
      ? diet.blockedAllergens.filter((item) => item !== tag)
      : [...diet.blockedAllergens, tag],
  };
}
