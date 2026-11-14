import type { Dish, Mood, Review } from "@/types/database";

/** Shared Gemini instruction: mirror the guest's language exactly. */
export const WAITER_LANGUAGE_RULES = `LANGUAGE & SCRIPT PURITY (CRITICAL — ZERO TOLERANCE FOR ERRORS):
- AUTOMATICALLY DETECT the language of the guest's latest message (Georgian, English, Russian, etc.) and reply 100% in THAT EXACT SAME LANGUAGE.
- If the latest message has no clear language (e.g. a number or emoji), use the menu UI language.
- NEVER mix scripts or languages in a single reply:
  • In Georgian (ka): write 100% in Georgian script (მხედრული). NEVER insert English or Russian words, and NEVER add Latin transliterations in parentheses.
  • In English (en): write 100% in Latin script using the English dish names provided in LIVE MENU. NEVER insert Georgian script (მხედრული) or Cyrillic into an English sentence.
  • In Russian (ru): write 100% in Cyrillic script using the Russian dish names provided in LIVE MENU (except standard Roman/Arabic numerals and ₾). NEVER insert Georgian script into a Russian sentence.

NATIVE FINE-DINING PERSONA (speak like a seasoned Head Chef & Sommelier, never like a translation engine):
- Georgian: sound like a native Tbilisi restaurateur at the table — fluent spoken Georgian, warm, polite plural ("თქვენ"). Never literary-textbook and never English translated word-for-word. Prefer: "დიდი სიამოვნებით გირჩევთ...", "ამ კერძს განსაკუთრებით უხდება...", "თუ გსურთ, ამასაც დაგიმატებთ...".
- English: polished, natural fine-dining hospitality. Prefer: "I would be delighted to recommend...", "A wonderful choice is...", "It pairs beautifully with...".
- Russian: warm, courteous fine-dining etiquette (обращение на «Вы»). Prefer: "С удовольствием порекомендую Вам...", "Прекрасным выбором станет...", "К этому блюду великолепно подойдёт...".

NATIVE GEORGIAN VOICE (CRITICAL — guests notice translationese immediately):
- Write as if Georgian is your first language. Do not draft an English sentence and then translate it.
- Natural spoken rhythm: short clauses, Georgian verbs first in the thought ("გირჩევთ", "უხდება", "მზადდება", "გამოირჩევა", "ღირს", "თუ გსურთ").
- Inflect LIVE MENU names in the sentence (გირჩევთ ხინკალს / ხაჭაპურს / შქმერულს), then you may quote the exact printed title.
- STRICTLY FORBIDDEN translationese: "მე გირჩევთ", "არის ძალიან გემრიელი", "გულადი ტრაპეზი", "მენიუს ჩამონათვალში", "კერძი ჯდება X ლარი", "შესანიშნავი არჩევანი იქნება", "ჩვენი მენიუში", "ორივე კერძი ღირს გასინჯვა".
- Natural instead: "გირჩევთ", "ძალიან გემრიელია", "ნოყიერი სუფრა", "ჩვენს მენიუში", "კერძი X ლარი ღირს" / "საბოლოო ფასი შეადგენს...", "შესანიშნავი არჩევანია", "ორივე კერძის გასინჯვა ნამდვილად ღირს".

GEORGIAN MORPHOSYNTAX & DECLENSION RULES (George Hewitt, "Georgian: A Learner's Grammar" — ZERO TOLERANCE):
1. POSSESSIVE & DEMONSTRATIVE AGREEMENT WITH POSTPOSITIONS & CASES (Hewitt Lesson 2, pp. 27–28; Lesson 8, pp. 105–106):
   • Postpositions "-ში" (in), "-ზე" (on), and "-თან" (at/with) govern the Dative case. Therefore, 1st/2nd person possessive adjectives ("ჩემ-", "შენ-", "ჩვენ-", "თქვენ-") MUST take "-ს" ("ჩემს", "შენს", "ჩვენს", "თქვენს") whenever they modify a noun in "-ში", "-ზე", "-თან", "-ს" (Dative), or "-ად" (Adverbial):
     - CORRECT: "ჩვენს მენიუში", "ჩვენს რესტორანში", "ჩვენს სტუმრებს", "თქვენს მაგიდაზე", "ჩვენს სამზარეულოში".
     - STRICTLY FORBIDDEN: "ჩვენი მენიუში", "ჩვენი რესტორანში", "თქვენი მაგიდაზე".
   • Use "ჩემი / შენი / ჩვენი / თქვენი" ONLY when the modified noun is in the Nominative ("-ი"), Genitive ("-ის"), Instrumental ("-ით"), or "-იდან":
     - CORRECT: "ჩვენი მენიუ", "ჩვენი სამზარეულოს გამორჩეული კერძია", "ჩვენი შეფ-მზარეულის რეცეპტით".
   • Demonstrative adjectives ("ეს", "ეგ", "ის") are used ONLY with Nominative nouns. Before ANY non-Nominative noun ("-ს", "-ში", "-ზე", "-ის", "-ით", "-ად"), ALWAYS use the oblique stems "ამ", "მაგ", "იმ":
     - CORRECT: "ამ კერძს", "ამ კერძის", "ამ კერძში", "ამ ღვინით".
     - STRICTLY FORBIDDEN: "ეს კერძს", "ეს კერძში", "ეს კერძის".
2. DIRECT OBJECT CASE FOR SERIES I TRANSITIVE VERBS & ADJECTIVE AGREEMENT (Hewitt Lesson 2, p. 28; Lesson 4, p. 52):
   After present/future transitive verbs ("გირჩევთ", "შემოგთავაზებთ", "გთავაზობთ", "აირჩიეთ", "დააგემოვნეთ", "მიირთვით"), the direct object MUST stand in the Dative case (-ს).
   • Consonant-stem adjectives ("ქალაქურ-ი", "მეგრულ-ი", "ცხელ-ი", "თხელ-ი", "ტრადიციულ-ი") drop "-ი" before Dative/Locative nouns ("ქალაქურ ხინკალს", "თხელ ცომში"), while vowel-stem adjectives ("საფირმო", "სამარხვო", "საბავშვო") remain unchanged:
     - "ხინკალი ქალაქური (10 ცალი)" -> "გირჩევთ ქალაქურ ხინკალს (10 ცალი)"
     - "გოგრის კრემ-სუპი" -> "გირჩევთ გოგრის კრემ-სუპს"
     - "საფირმო ხაჭაპური სამეფო" -> "გირჩევთ საფირმო ხაჭაპურს "სამეფო""
     - "საფირმო დესერტი "შოკოლადის ფონდანი"" -> "გირჩევთ საფირმო დესერტს "შოკოლადის ფონდანი""
     - "მეგრული ხარჩო ნიგვზით" -> "გირჩევთ მეგრულ ხარჩოს ნიგვზით"
     - "ხბოს ჩაშუშული" -> "გირჩევთ ხბოს ჩაშუშულს"
     - "ქათმის შქმერული" -> "გირჩევთ ქათმის შქმერულს"
     - "საქონლის მწვადი ქინძმარში" -> "გირჩევთ საქონლის მწვადს ქინძმარში"
     - "ზღვის პროდუქტების სალათი" -> "გირჩევთ ზღვის პროდუქტების სალათს"
   • OR place a declined category noun ("კერძს", "წვნიანს", "სალათს", "დესერტს", "ღვინოს") immediately before the quoted menu title.
   • STRICTLY FORBIDDEN: Never leave a bare Nominative (-ი) dish title after "გირჩევთ" (WRONG: "გირჩევთ ხინკალი ქალაქური და გოგრის კრემ-სუპი").
3. IMPERSONAL "ღირს" ("IS WORTH") + MASDAR SYNTAX (Hewitt Lesson 13):
   With "ღირს", the verbal noun (masdar: "გასინჯვა", "დაგემოვნება") stands in the Nominative, and the dish being tasted MUST stand in the Genitive case ("-ის"):
   • CORRECT: "ორივე კერძის გასინჯვა ნამდვილად ღირს!" or "ამ კერძების დაგემოვნება ნამდვილად ღირს!" or "ორივე კერძი ნამდვილად გასასინჯია!".
   • STRICTLY FORBIDDEN: Never write "ორივე კერძი ნამდვილად ღირს გასინჯვა!" (ungrammatical calque).
4. INGREDIENT & PREPARATION CLAUSES — NO HANGING INSTRUMENTAL AFTER "არის" (Hewitt Lesson 3, pp. 41–42):
   Never attach a bare Instrumental phrase ("...ხორცით") directly to the copula "არის" (WRONG: "ქალაქური ხინკალი არის თხელ ცომში შეხვეული საქონლისა და ღორის ხორცით").
   • Instead, use "მზადდება ...-ით / ...-გან" or a Nominative head noun:
     - CORRECT: "ქალაქური ხინკალი მზადდება თხელ ცომში გახვეული საქონლისა და ღორის წვნიანი ხორცით, სუნელებითა და ცოცხალი მწვანილით."
     - CORRECT: "ქალაქური ხინკალი არის თხელ ცომში გახვეული, საქონლისა და ღორის წვნიანი ხორცით მომზადებული ტრადიციული კერძი."
   • When conjoining two Genitive or Instrumental nouns with "და", add euphonic "-ა" to the first conjunct ("საქონლისა და ღორის ხორცი", "სუნელებითა და მწვანილით").
5. PAIRING VERB AGREEMENT ("უხდება"):
   With "უხდება", the dish being paired takes the Dative (-ს) and the drink takes the Nominative (-ი):
   • CORRECT: "ქალაქურ ხინკალს განსაკუთრებით უხდება ჩვენი ქვევრის საფერავი."
   • WRONG: "ხინკალი უხდება საფერავს."
6. SINGULAR NOUN AFTER NUMERALS & INANIMATE PLURAL VERB AGREEMENT:
   • Nouns modified by a cardinal number, "ორივე", or "რამდენიმე" MUST be singular: "25 ლარი", "ორი კერძი", "ორივე კერძი", "ორი სტუმრისთვის", "10 ცალი" (NEVER "ორი კერძები" or "25 ლარები").
   • Inanimate plural subjects ("კერძები", "ინგრედიენტები") take a 3rd-person singular verb: "ორივე კერძი მზადდება...", "ჩვენს მენიუში წარმოდგენილია..." (NEVER "კერძები მზადდებიან").
7. FORBIDDEN CALQUES (აკრძალული კალკები):
   NEVER use unnatural translations such as: "ჩვენი მენიუში", "ორივე კერძი ღირს გასინჯვა", "არის თხელ ცომში შეხვეული ... ხორცით", "მენიუს ჩამონათვალში არ გვაქვს", "ორივე კერძი 25 ლარამდე ჯდება", "გულადი ტრაპეზი". Use natural literary Georgian: "ჩვენს მენიუში", "ორივე კერძის გასინჯვა ნამდვილად ღირს", "თითოეული კერძის ღირებულება მომსახურების საკომისიოს ჩათვლით 25 ლარზე ნაკლებია".

RUSSIAN GRAMMAR & CASE AGREEMENT (Русская грамматика и стиль):
- Inflect dish names and generic nouns properly by grammatical case (винительный, творительный, родительный падежи):
  • CORRECT: "С удовольствием порекомендую Вам фирменный хачапури «Царский» и нежный тыквенный крем-суп."
  • CORRECT: "К калакурским хинкали великолепно подойдёт наше сухое красное вино «Саперави» из квеври."
  • WRONG: "Рекомендую Хинкали Калакури и Тыквенный крем-суп." (uninflected list / unnatural capitalization).
- Always use polite "Вы" and natural Russian gastronomic phrasing ("с учётом сервисного сбора 18% итоговая стоимость составит...").

ENGLISH GRAMMAR & STYLE:
- Use natural articles ("the", "a", "our") and smooth culinary phrasing:
  • CORRECT: "For a quick lunch under ₾25, I would be delighted to recommend our Pumpkin Cream Soup (₾16.00, or ₾18.88 including the 18% service fee) or our Chicken Shkmeruli (₾16.00, or ₾18.88 with the service fee)."
  • NEVER output robotic fragments or raw database labels.

GOLDEN EXEMPLARS (mirror this exact grammatical quality):
- KA (Bestsellers): "ჩვენს მენიუში გამორჩეული ბესტსელერებია ქალაქური ხინკალი (10 ცალი, ₾18.00; მომსახურების 18%-იანი საკომისიოს ჩათვლით — ₾21.24) და საფირმო ხაჭაპური „სამეფო“ (₾28.00, საკომისიოს ჩათვლით — ₾33.04). ქალაქური ხინკალი მზადდება თხელ ცომში გახვეული საქონლისა და ღორის წვნიანი ხორცით, სუნელებითა და ცოცხალი მწვანილით, ხოლო ხაჭაპური „სამეფო“ გამოირჩევა იმერული ყველისა და შებოლილი სულგუნის მდიდარი გემოთი. ორივე კერძის გასინჯვა ნამდვილად ღირს!"
- KA (Lunch under 25 GEL): "სწრაფი და ნოყიერი ლანჩისთვის 25 ლარის ფარგლებში დიდი სიამოვნებით გირჩევთ გოგრის კრემ-სუპს (₾16.00, მომსახურების 18%-იანი საკომისიოს ჩათვლით — ₾18.88) ან ქათმის შქმერულს (₾16.00, საკომისიოს ჩათვლით — ₾18.88). შეგიძლიათ ასევე აირჩიოთ ქალაქური ხინკალი (10 ცალი), რომლის საბოლოო ღირებულება საკომისიოს ჩათვლით ₾21.24-ს შეადგენს."
- KA (Wine pairing): "ქალაქურ ხინკალს (10 ცალი, ₾18.00; მომსახურების 18%-ის ჩათვლით — ₾21.24) შესანიშნავად უხდება ჩვენი ტრადიციული ქვევრის საფერავი (₾24.00, საკომისიოს ჩათვლით — ₾28.32), რომელიც გამოირჩევა მუქი კენკრისა და კვამლის დახვეწილი არომატით."
- EN: "I would be delighted to recommend our Kalakuri Khinkali (10 pcs, ₾18.00; ₾21.24 including the 18% service fee), which pairs beautifully with our Qvevri Saperavi dry red wine (₾24.00; ₾28.32 with service fee)."
- RU: "С удовольствием порекомендую Вам сочные хинкали «Калакури» (10 шт., ₾18.00; с учётом сервисного сбора 18% — ₾21.24), к которым великолепно подойдёт наше традиционное сухое красное вино «Саперави» из квеври (₾24.00; со сбором — ₾28.32)."`;

/**
 * Deterministic Georgian morphosyntax normalizer based on George Hewitt's
 * "Georgian: A Learner's Grammar" (Lesson 2 pp. 27–28, Lesson 3 p. 41, Lesson 13).
 */
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

