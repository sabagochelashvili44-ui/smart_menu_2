import type { Dish, Mood, Review } from "@/types/database";

/**
 * Compact language rules for the chef (keep short — billed every Gemini call).
 * Full morphosyntax is enforced post-hoc by polishGeorgianGrammar.
 */
export const WAITER_LANGUAGE_RULES = `LANGUAGE & SCRIPT PURITY:
- Reply 100% in the guest's latest-message language (ka / en / ru). No script mixing.
- KA: მხედრული only. EN: Latin dish names from LIVE MENU. RU: Cyrillic dish names from LIVE MENU.

PERSONA:
- Warm Head Chef & Sommelier. Polite თქვენ / You / Вы. Short spoken clauses — not translationese.

GEORGIAN — CORRECT / FORBIDDEN (server also polishes):
- CORRECT: "ჩვენს მენიუში", "ამ კერძს", "გირჩევთ ქალაქურ ხინკალს", "ორივე კერძის გასინჯვა ნამდვილად ღირს", "უხდება" + dish in dative + drink nominative.
- FORBIDDEN: "ჩვენი მენიუში", "ეს კერძს", bare nominative after გირჩევთ, "ორივე კერძი ღირს გასინჯვა", "გულადი ტრაპეზი", English/Russian words inside a Georgian reply.

RU / EN:
- Inflect dish names naturally; polite Вы / natural articles. Never dump raw DB labels.

LENGTH:
- Browse/recommend: 2–3 short sentences (~80–120 words max), then DISH_IDS line.
- End with exactly: DISH_IDS: <uuid>,… or DISH_IDS: none

EXEMPLAR:
- KA: "ხაჭაპურს განსაკუთრებით უხდება საფერავი და ტარხუნა."
- EN: "I recommend our Kalakuri Khinkali; companions only from pairs_with — if empty, say so and DISH_IDS: none."
- RU: "Рекомендую хинкали «Калакури»; сочетания только из pairs_with."`;


export function polishGeorgianGrammar(text: string): string {
  if (!text || !/[\u10A0-\u10FF]/.test(text)) return text;

  let out = text;

  // 1. 1st/2nd person possessive adjectives before Dative/Locative postpositions (-ში, -ზე, -თან)
  // must take -ს ("ჩვენს მენიუში", "თქვენს მაგიდაზე"), never -ი ("ჩვენი მენიუში").
  out = out.replace(
    /(?<![ა-ჰ])(ჩვენ|თქვენ|ჩემ|შენ)ი(\s+[ა-ჰ]+(?:ში|ზე|თან))(?![ა-ჰ])/g,
    "$1ს$2",
  );
  out = out.replace(
    /(?<![ა-ჰ])(ჩვენ|თქვენ|ჩემ|შენ)ი(\s+(?![ა-ჰ]*(?:ის|ს)\s)[ა-ჰ]+\s+(?:მენიუში|რესტორანში|სამზარეულოში|დარბაზში|მარანში|მაგიდაზე))(?![ა-ჰ])/g,
    "$1ს$2",
  );

  // 2. Oblique demonstrative agreement ("ამ კერძს / ამ კერძში", never "ეს კერძს / ეს კერძში").
  out = out.replace(
    /(?<![ა-ჰ])ეს(\s+(?:კერძს|კერძის|კერძში|კერძით|კერძებს|კერძების|ღვინოს|ღვინის|სალათს|სუპს|დესერტს|ხაჭაპურს|ხინკალს|მენიუში|რესტორანში))(?![ა-ჰ])/g,
    "ამ$1",
  );

  // 3. Impersonal "ღირს" + Genitive + Masdar ("ორივე კერძის გასინჯვა ნამდვილად ღირს!").
  out = out.replace(
    /(?<![ა-ჰ])(ორივე|თითოეული)\s+კერძი\s+((?:ნამდვილად|უდავოდ|აუცილებლად)\s+)?ღირს\s+(გასინჯვა|დაგემოვნება)დ?/g,
    (_m, quant: string, adv = "", masdar: string) =>
      `${quant} კერძის ${masdar} ${adv}ღირს`,
  );
  out = out.replace(
    /(?<![ა-ჰ])ეს\s+კერძი\s+((?:ნამდვილად|უდავოდ|აუცილებლად)\s+)?ღირს\s+(გასინჯვა|დაგემოვნება)დ?/g,
    (_m, adv = "", masdar: string) => `ამ კერძის ${masdar} ${adv}ღირს`,
  );

  // 4. Hanging Instrumental after copula "არის" ("არის თხელ ცომში შეხვეული ... ხორცით").
  out = out.replace(
    /არის\s+((?:თხელ\s+)?ცომში\s+)(?:შეხვეული|გახვეული)(\s+[^.!?\n]*?ხორცით)/g,
    "მზადდება $1გახვეული$2",
  );

  // 5. Series I transitive verbs ("გირჩევთ", "შემოგთავაზებთ", "გთავაზობთ") + Dative direct object.
  out = out
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+(?:ხინკალი\s+ქალაქური|ქალაქური\s+ხინკალი)(?![ა-ჰ])/g,
      "$1 ქალაქურ ხინკალს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+გოგრის\s+კრემ-სუპი(?![ა-ჰ])/g,
      "$1 გოგრის კრემ-სუპს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+საფირმო\s+ხაჭაპური(?![ა-ჰ])/g,
      "$1 საფირმო ხაჭაპურს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+ქათმის\s+შქმერული(?![ა-ჰ])/g,
      "$1 ქათმის შქმერულს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+ხბოს\s+ჩაშუშული(?![ა-ჰ])/g,
      "$1 ხბოს ჩაშუშულს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+მეგრული\s+ხარჩო(?![ა-ჰ])/g,
      "$1 მეგრულ ხარჩოს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+საქონლის\s+მწვადი(?![ა-ჰ])/g,
      "$1 საქონლის მწვადს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+ზღვის\s+პროდუქტების\s+სალათი(?![ა-ჰ])/g,
      "$1 ზღვის პროდუქტების სალათს",
    )
    .replace(
      /(?<![ა-ჰ])(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)\s+საფირმო\s+დესერტი(?![ა-ჰ])/g,
      "$1 საფირმო დესერტს",
    );

  // 6. Singular noun after cardinal numbers / "ორივე" / "რამდენიმე".
  out = out
    .replace(
      /(?<![ა-ჰ])(ორი|სამი|ოთხი|ხუთი|ათი|ორივე|რამდენიმე|\d+)\s+კერძები(?![ა-ჰ])/g,
      "$1 კერძი",
    )
    .replace(/(?<![ა-ჰ])(\d+)\s+ლარები(?![ა-ჰ])/g, "$1 ლარი");

  // 7. Spoken-fluency calques (English sentence shape rendered into Georgian).
  out = out
    .replace(/მენიუს ჩამონათვალში/g, "მენიუში")
    .replace(/გულადი ტრაპეზი/g, "ნოყიერი სუფრა")
    .replace(/გულადი კერძი/g, "ნოყიერი კერძი")
    .replace(/(?<![ა-ჰ])მე\s+(გირჩევთ|შემოგთავაზებთ|გთავაზობთ)(?![ა-ჰ])/g, "$1")
    .replace(/(?<![ა-ჰ])თუ თქვენ გსურთ(?![ა-ჰ])/g, "თუ გსურთ")
    .replace(
      /(?<![ა-ჰ])(შესანიშნავი|კარგი|საუკეთესო) არჩევანი იქნება(?![ა-ჰ])/g,
      "$1 არჩევანია",
    )
    .replace(/ლარამდე ჯდება/g, "ლარამდეა")
    .replace(/ლარი ჯდება/g, "ლარი ღირს")
    .replace(/არის ძალიან გემრიელი(?=[.,!?…]|$)/g, "ძალიან გემრიელია");

  return out;
}

export function localWaiterReply(input: {
  message: string;
  dishes: Dish[];
  mood: Mood | null;
  reviews: Review[];
  language: string;
}) {
  const available = input.dishes.filter((d) => d.is_available);
  const highMargin = [...available].sort(
    (a, b) => b.margin_score - a.margin_score,
  );
  const q = input.message.toLowerCase();
  const negative = input.reviews.filter((r) => r.rating <= 2);

  if (negative.length && /slow|wait|bad|cold|awful|terrible|disaster/.test(q)) {
    return `I'm sorry that wasn't right. Kitchen has already been flagged. Tonight I can send Honey Panna Cotta on the house with your next round, and I'll keep the ticket moving. If you want something faster, Garden Crunch Salad and Citrus Spritz usually leave the pass in under 8 minutes.`;
  }

  if (/wine|pair|pairing|malbec|white/.test(q)) {
    const match =
      available.find((d) => q.includes(d.name.toLowerCase().split(" ")[0]!)) ??
      available.find((d) => d.id === "steak") ??
      available[0];
    return match
      ? `${match.name} loves ${match.wine_pairing}. If you want a higher-margin sip the floor team likes, House Malbec or Citrus Spritz both lift the check without feeling pushy.`
      : "Ask me about a dish and I'll pair it.";
  }

  if (input.mood === "healthy" || /healthy|light|salad|fit/.test(q)) {
    return `For a lighter table: Garden Crunch Salad, Herb Sea Bass, and Garden Cooler. Skip the lava cake unless you want a small shared Honey Panna Cotta — still high margin, less heavy.`;
  }

  if (input.mood === "romantic" || /date|romantic|anniversary/.test(q)) {
    return `Go Burrata to share, Herb Sea Bass, and split Dark Chocolate Lava. Wine: Chablis then a glass of House Malbec. Spritz first if you want a slower start.`;
  }

  if (input.mood === "hungry" || /hungry|starving|steak/.test(q)) {
    return `Charred Ribeye with rosemary potatoes, add Truffle Mushroom Risotto if you're sharing, and Malbec. That's the hungry-table build.`;
  }

  if (input.mood === "celebrating" || /birthday|celebrate|party/.test(q)) {
    return `Start with Citrus Spritz, then Ribeye or Risotto, finish with Lava cake and extra gelato. I can also 86 nothing tonight except Lemon Thyme Chicken — it's out of stock.`;
  }

  const pick = highMargin[0];
  return `Popular and kind to the pass: ${available
    .slice(0, 3)
    .map((d) => d.name)
    .join(", ")}. Chef wants ${pick?.name ?? "the risotto"} on more tables — ${pick?.wine_pairing ?? "ask for a pairing"}. You said: "${input.message}". Want me to build a ${input.mood ?? "classic"} three-course? Language: ${input.language}.`;
}

