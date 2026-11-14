import { DISH_I18N } from "@/lib/georgian-house-i18n";
import { INGREDIENT_I18N } from "@/lib/ingredient-i18n";

export type MenuLocale = "ka" | "en" | "ru";

type LocaleMap = Partial<Record<MenuLocale, string>>;

function aliasLocaleMap(
  maps: Record<string, LocaleMap>,
  entry: LocaleMap,
  ...keys: Array<string | undefined>
) {
  for (const key of keys) {
    if (!key) continue;
    maps[key] = { ...maps[key], ...entry };
  }
}

const DISH_NAMES: Record<string, LocaleMap> = {};
const DISH_DESCRIPTIONS: Record<string, LocaleMap> = {};

for (const [ka, translated] of Object.entries(DISH_I18N)) {
  const names: LocaleMap = {
    ka,
    en: translated.en.name,
    ru: translated.ru.name,
  };
  const descriptions: LocaleMap = {
    en: translated.en.description,
    ru: translated.ru.description,
  };
  aliasLocaleMap(DISH_NAMES, names, ka, translated.en.name, translated.ru.name);
  aliasLocaleMap(
    DISH_DESCRIPTIONS,
    descriptions,
    ka,
    translated.en.name,
    translated.ru.name,
  );
}

const CATEGORY_NAMES: Record<string, LocaleMap> = {};
const CATEGORY_I18N: Record<string, { ka: string; ru: string }> = {
  "Cold Starters": { ka: "ცივი საუზმეები", ru: "Холодные закуски" },
  Salads: { ka: "სალათები", ru: "Салаты" },
  Soups: { ka: "სუპები", ru: "Супы" },
  Soup: { ka: "სუპი", ru: "Супы" },
  Khachapuri: { ka: "ხაჭაპური", ru: "Хачапури" },
  Pastries: { ka: "ცომეული", ru: "Выпечка" },
  Khinkali: { ka: "ხინკალი", ru: "Хинкали" },
  "Main Dishes": { ka: "ძირითადი კერძები", ru: "Основные блюда" },
  "Hot Dishes": { ka: "ცხელი კერძები", ru: "Горячие блюда" },
  Grill: { ka: "მწვადი", ru: "Мангал" },
  Fish: { ka: "თევზი", ru: "Рыба" },
  Seafood: { ka: "ზღვის პროდუქტები", ru: "Морепродукты" },
  Vegetarian: { ka: "ვეგეტარიანული", ru: "Вегетарианское" },
  Sides: { ka: "გარნირები", ru: "Гарниры" },
  Bread: { ka: "პური", ru: "Хлеб" },
  Desserts: { ka: "დესერტები", ru: "Десерты" },
  Dessert: { ka: "დესერტი", ru: "Десерты" },
  "Soft Drinks": { ka: "უალკოჰოლო სასმელები", ru: "Безалкогольные" },
  Wine: { ka: "ღვინო", ru: "Вино" },
  "Beer & Spirits": { ka: "ლუდი და სპირტიანი", ru: "Пиво и крепкие" },
  Drinks: { ka: "სასმელები", ru: "Напитки" },
  Other: { ka: "სხვა", ru: "Другое" },
  "Cold meats": { ka: "ცივი ხორცი", ru: "Холодное мясо" },
  "Pickled dishes": { ka: "წნელი კერძები", ru: "Маринованные блюда" },
  "Rib cuts": { ka: "რიბს ნაჭრები", ru: "Рёбра" },
  Tolma: { ka: "ტოლმა", ru: "Толма" },
  "Grilled meats": { ka: "მწვადეული", ru: "Мангал" },
  Kebab: { ka: "ქაბაბი", ru: "Кебаб" },
};

for (const [en, translated] of Object.entries(CATEGORY_I18N)) {
  const entry: LocaleMap = { en, ka: translated.ka, ru: translated.ru };
  aliasLocaleMap(
    CATEGORY_NAMES,
    entry,
    en,
    en.toLowerCase(),
    translated.ka,
    translated.ru,
  );
}

aliasLocaleMap(
  CATEGORY_NAMES,
  CATEGORY_NAMES["Cold Starters"] ?? {
    en: "Cold Starters",
    ka: "ცივი საუზმეები",
    ru: "Холодные закуски",
  },
  "ცივი საუზმე",
);

const ALLERGENS: Record<string, Record<MenuLocale, string>> = {
  gluten: { ka: "გლუტენი", en: "gluten", ru: "глютен" },
  "გლუტენი": { ka: "გლუტენი", en: "gluten", ru: "глютен" },
  "გლუტენი (ხორბლის ფქვილი)": {
    ka: "გლუტენი (ხორბლის ფქვილი)",
    en: "gluten (wheat flour)",
    ru: "глютен (пшеничная мука)",
  },
  dairy: { ka: "რძის პროდუქტი", en: "dairy", ru: "молочные продукты" },
  "რძე და რძის ნაწარმი": {
    ka: "რძე და რძის ნაწარმი",
    en: "milk & dairy",
    ru: "молоко и молочные продукты",
  },
  "რძე და რძის": {
    ka: "რძე და რძის ნაწარმი",
    en: "milk & dairy",
    ru: "молоко и молочные продукты",
  },
  "რძე და რძის ნაწარმი (კარაქი, ნაყინი)": {
    ka: "რძე და რძის ნაწარმი (კარაქი, ნაყინი)",
    en: "dairy (butter, ice cream)",
    ru: "молочные продукты (масло, мороженое)",
  },
  eggs: { ka: "კვერცხი", en: "eggs", ru: "яйца" },
  "კვერცხი": { ka: "კვერცხი", en: "eggs", ru: "яйца" },
  nuts: { ka: "თხილეული", en: "tree nuts", ru: "орехи" },
  "თხილეული და კაკლოვნები (ნიგოზი)": {
    ka: "თხილეული და კაკლოვნები (ნიგოზი)",
    en: "tree nuts (walnuts)",
    ru: "орехи (грецкий орех)",
  },
  sulfites: { ka: "სულფიტები", en: "sulfites", ru: "сульфиты" },
  "სულფიტები": { ka: "სულფიტები", en: "sulfites", ru: "сульфиты" },
  "სულფიტები (გოგირდის დიოქსიდი $so_2$)": {
    ka: "სულფიტები (SO₂)",
    en: "sulfites (SO₂)",
    ru: "сульфиты (SO₂)",
  },
  "სულფიტები (ბუნებრივად წარმოქმნილი და/ან ამატებული გოგირდის დიოქსიდი $so_2$)": {
    ka: "სულფიტები (SO₂)",
    en: "sulfites (SO₂)",
    ru: "сульфиты (SO₂)",
  },
  fish: { ka: "თევზი", en: "fish", ru: "рыба" },
  shellfish: { ka: "ზღვის პროდუქტი", en: "shellfish", ru: "морепродукты" },
  "კიბოსნაირნი (კრევეტები)": {
    ka: "კიბოსნაირნი (კრევეტები)",
    en: "crustaceans (shrimp)",
    ru: "ракообразные (креветки)",
  },
  "მოლუსკები (მიდიები, კალმარი)": {
    ka: "მოლუსკები (მიდიები, კალმარი)",
    en: "mollusks (mussels, calamari)",
    ru: "моллюски (мидии, кальмар)",
  },
  "ნიახური": { ka: "ნიახური", en: "celery", ru: "сельдерей" },
  "სოია (შოკოლადის ემულგატორი — სოიოს ლეციტინი)": {
    ka: "სოია (სოიოს ლეციტინი)",
    en: "soy (soy lecithin)",
    ru: "соя (соевый лецитин)",
  },
  "არ შეიცავს 14 ძირითად ალერგენს": {
    ka: "არ შეიცავს 14 ძირითად ალერგენს",
    en: "free from the 14 major allergens",
    ru: "не содержит 14 основных аллергенов",
  },
  "არ შეიცავს 14 ძირითად ალერგენს (შეიცავს ქინინს)": {
    ka: "არ შეიცავს 14 ძირითად ალერგენს (შეიცავს ქინინს)",
    en: "free from the 14 major allergens (contains quinine)",
    ru: "не содержит 14 основных аллергенов (содержит хинин)",
  },
};

const TABLE_NUMBER_PREFIX =
  /^(მაგიდა|table|стол|طاولة)\s+/i;

export function formatGuestTableLabel(
  label: string,
  tableNumber: string | null | undefined,
) {
  const raw = tableNumber?.trim();
  if (!raw) return "—";
  const number = raw.replace(TABLE_NUMBER_PREFIX, "").trim() || raw;
  return `${label} ${number}`;
}

export const ui = {
  ka: {
    all: "ყველა",
    table: "მაგიდა",
    language: "ენა",
    addToCart: "კალათაში დამატება",
    priceBottle: "ბოთლის ფასი",
    priceGlass: "ჭიქის ფასი",
    addBottle: "ბოთლი",
    addGlass: "ჭიქა",
    decreaseQty: "რაოდენობის შემცირება",
    increaseQty: "რაოდენობის გაზრდა",
    soldOut: "ამოიწურა",
    remove: "წაშლა",
    unavailable: "მიუწვდომელია",
    ingredients: "ინგრედიენტები",
    nutritionHeading: "კვებითი ღირებულება",
    nutritionEnergy: "კალორიები",
    nutritionKcal: "კკალ",
    nutritionProtein: "ცილები",
    nutritionCarbs: "ნახშირწყლები",
    nutritionFat: "ცხიმები",
    nutritionGram: "გ",
    prepTime: "საშუალო მომზადება",
    prepMinutes: "წთ",
    emptyCategory: "ამ კატეგორიაში კერძები ჯერ არ არის.",
    menuEmpty: "მენიუ ცარიელია 🍽️",
    searchPlaceholder: "მოძებნეთ კერძი, ინგრედიენტი...",
    searchAria: "კერძის ძიება",
    hostAskCta: "ჰკითხე შეფ-ასისტენტს ✨",
    hostCloudDish: "გინდა დაგეხმარო კერძის შერჩევაში? ✨",
    hostCloudWine: "გსურს შესაბამისი ღვინო შევუხამოთ თქვენს შეკვეთას? 🍷",
    hostCloudDiet: "გაქვთ სპეციალური დიეტური მოთხოვნა? 🛡️",
    searchClear: "ძიების გასუფთავება",
    searchEmpty: "კერძი ვერ მოიძებნა 🍽️",
    translatingMenu: "მენიუ ითარგმნება…",
    cartEmpty: "კალათა ცარიელია",
    cartHint: "დაამატეთ კერძები, შემდეგ გამოიძახეთ მიმტანი. ეს ჯერ არ არის დადასტურებული შეკვეთა.",
    items: (n: number) => `${n} პოზიცია`,
    aiAssistant: "შეფ-ასისტენტი",
    checkout: "მიმტანის გამოძახება",
    yourOrder: "თქვენი არჩევანი",
    addFromMenu: "დაამატეთ კერძები მენიუდან.",
    cartEmptyLong: "სია ცარიელია — მიმტანი მაინც მოვა.",
    cartSent: "უკვე მიმტანთანაა",
    cartJustAdded: "ახლად დამატებული",
    cartDraft: "ჯერ არ გაგზავნილა",
    cartShared: "ეს სია საერთოა ამ მაგიდისთვის.",
    total: "ჯამი",
    dishesSubtotal: "კერძების ჯამი",
    serviceFee: (percent: number) => `მომსახურება (${percent}%)`,
    grandTotalDue: "სულ გადასახდელი",
    placeOrder: "მიმტანის გამოძახება",
    sending: "იგზავნება…",
    callWaiter: "მიმტანის გამოძახება",
    callWaiterWithItems: "მიმტანის გამოძახება არჩეული კერძებით",
    requestTitle: "როგორ დაგეხმაროთ?",
    requestHint: "აირჩიეთ მოთხოვნა — მიმტანი მიიღებს შეტყობინებას.",
    requestSent: "მოთხოვნა გაგზავნილია!",
    lineNote: "სპეციალური მოთხოვნა",
    lineNotePlaceholder: "მაგ.: ხახვის გარეშე, ნაკლებად ცხარე",
    ticketSent: "გაგზავნილია",
    ticketSeen: "მიმტანმა ნახა",
    ticketReady: "გამზადდა — მიართვით",
    ticketDone: "შესრულებულია",
    closedTitle: "ახლა დახურულია",
    closedHours: (range: string) => `სამუშაო საათები: ${range}`,
    closedHint: "გთხოვთ, შემოგვიერთდეთ გახსნისას.",
    offlineBanner:
      "Wi-Fi გათიშულია. კერძებს ხედავთ, მაგრამ შეკვეთა და ჩატი ინტერნეტს საჭიროებს.",
    boughtTogether: "ხშირად უკვეთავენ ერთად 🍷",
    chefTip: "შეფ-მზარეულის რჩევა 👨‍🍳",
    addUpsell: "➕ დამატება",
    flavorWhyCutRich:
      "მჟავე ან სუფთა გემო აბალანსებს არჩეული კერძის სიმდიდრეს.",
    flavorWhyCoolSpice: "ცხარე გემოს აცივებს და პირში სიმშვიდეს აბრუნებს.",
    flavorWhyGrill: "გრილსა და წითელ ხორცს კლასიკურად უხდება.",
    flavorWhySeafood: "თევზსა და ფრინველს სიმსუბუქით და ციტრუსით ერწყმის.",
    flavorWhyDairy: "ყველიან/ნაღებიან გემოს სალათი ან მჟავე ნოტა უსუფთავებს.",
    flavorWhyDessert: "ტკბილი დასასრული მაგიდისთვის.",
    flavorWhyDrink: "გემოს ავსებს და პირის გემოს განაახლებს.",
    flavorWhyWine: "ღვინის შეხამება პირდაპირ ამ კერძის პროფილს მიჰყვება.",
    flavorWhyShare: "ინგრედიენტებითა და გემოთი ერწყმის არჩეულ კერძებს.",
    summaryHint:
      "აჩვენეთ ეს სია მიმტანს, როცა მოვა. შეკვეთა სამზარეულოში არ იგზავნება.",
    callSent: "მიმტანი გამოძახებულია. აჩვენეთ ეს სია, როცა მოვა.",
    callFail: "გამოძახება ვერ გაიგზავნა. სცადეთ თავიდან.",
    each: "ცალი",
    noTable: "მაგიდა არ არის",
    chefAssistant: "შეფ-ასისტენტი",
    chefWidgetBubble:
      "გინდა დაგეხმარო კერძის არჩევაში? მკითხე რაც მოგესურვება!",
    waiterTitle: "შეფ-ასისტენტი",
    waiterIntro: (name: string) =>
      `კეთილი იყოს თქვენი მობრძანება ${name}-ში. მე ვარ თქვენი შეფ-ასისტენტი — სიამოვნებით დაგეხმარებით მენიუში, ალერგენებსა და ქვევრის ღვინის შეხამებაში.`,
    hostBannerBefore: "გამარჯობა! მე ვარ თქვენი ",
    hostBannerName: "შეფ-ასისტენტი",
    hostBannerAfter:
      ". დაგეხმარებით კერძის, ალერგენების ან შესაბამისი ღვინის შერჩევაში ✨",
    waiterPlaceholder: "ჰკითხე შეფს: რა შევუკვეთოთ დღეს?...",
    thinking: "ვფიქრობ…",
    sendChat: "გაგზავნა",
    apiError:
      "შეფ-ასისტენტი ამჟამად მიუწვდომელია. გთხოვთ სცადოთ ოდნავ მოგვიანებით.",
    vegetarian: "🌱 მირჩიე სამარხვო/ვეგეტარიანული",
    wine: "🍷 რა ღვინო შევუხამო ხინკალს?",
    spicy: "🌶️ რა არის ყველაზე პოპულარული?",
    vegetarianPrompt:
      "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
    winePrompt:
      "რა ღვინო შევუხამო ხინკალს? თუ ხინკალი არ არის, მირჩიე ღვინო ძირითად კერძებთან.",
    wineMains: "🍷 რა ღვინო შევუხამო კერძებს?",
    wineMainsPrompt:
      "რა ღვინო ან სასმელი შევუხამო ამ მენიუს ძირითად კერძებს? მხოლოდ ის, რაც ამ მენიუშია.",
    spicyPrompt: "რა არის დღეს ყველაზე პოპულარული კერძები მენიუში?",
    chipQuickLunch: "⚡ სწრაფი ლანჩი",
    chipQuickLunchPrompt:
      "მირჩიეთ სწრაფი ლანჩი — კერძი, რომელიც სწრაფად მზადდება და ნოყიერია.",
    chipBestsellers: "🔥 ტოპ 3 ბესტსელერი",
    chipBestsellersPrompt:
      "რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?",
    chipDessert: "🍰 საფირმო დესერტი",
    chipDessertPrompt: "მირჩიეთ საფირმო დესერტი ამ მენიუდან.",
    chipKids: "👶 საბავშვო მენიუ",
    chipKidsPrompt:
      "რომელი კერძი გამოდგება ბავშვისთვის ამ მენიუდან — მსუბუქი და არაცხარე?",
    chipOther: "🍽️ სხვა",
    chipOtherPrompt:
      "კიდევ რა განსხვავებულ კერძებს მირჩევდით ჩვენი მენიუს სხვა კატეგორიებიდან (მაგალითად, სალათები, ზღვის პროდუქტები, წვნიანები ან დესერტი)?",
    quizChip: "🎲 დამეხმარე არჩევაში (3 წამი)",
    quizQ1: "ხორციანი კერძი გირჩევნიათ თუ ვეგეტარიანული?",
    quizMeat: "🥩 ხორციანი",
    quizVeg: "🌱 ვეგეტარიანული",
    quizQ2: "მსუბუქი წახემსება გსურთ თუ ნოყიერი კერძი?",
    quizLight: "🥗 მსუბუქი",
    quizHearty: "🍲 ნოყიერი",
    quizPicked: "დიდი სიამოვნებით გირჩევთ:",
    filterGluten: "🚫 გლუტენის გარეშე",
    filterDairy: "🚫 რძის ნაწარმის გარეშე",
    filterNuts: "🥜 თხილის/ნიგვზის გარეშე",
    budgetLunch: "💰 ლანჩი 25 ₾-მდე",
    budgetLunchPrompt:
      "მირჩიეთ ლანჩი 25 ლარამდე (მომსახურების საკომისიოს ჩათვლით) — სწრაფი და გემრიელი.",
    budgetDinner: "✨ ვახშამი 2 ადამიანზე",
    budgetDinnerPrompt:
      "შეადგინეთ ვახშამი ორი სტუმრისთვის ამ მენიუდან (წასახემსებელი და ძირითადი კერძები) და დამითვალეთ ჯამური ღირებულება მომსახურების პროცენტის ჩათვლით.",
    addFromChat: "➕ დამატება",
    detailsFromChat: "დეტალურად",
    allergens: "ალერგენები",
    addedFromChat: "დაემატა",
    removeFromChat: "🗑️ ამოღება",
    allergenSafety:
      "⚠️ გთხოვთ, თქვენი ალერგიის შესახებ შეკვეთის გაფორმებისას მიმტანსაც გადაუმოწმოთ.",
    pairKhinkali: "ხინკალს განსაკუთრებით უხდება ჩვენი ქვევრის საფერავი!",
    pairWith: (pairing: string) => `შეხამება: ${pairing}`,
    dietNote: (label: string) => `გავითვალისწინებ: ${label}.`,
    dietRemovedNote: (label: string) => `ფილტრი მოიხსნა: ${label}.`,
    noCategoryDish: "ჩვენს მენიუში ამ კატეგორიის კერძი ამჟამად არ არის.",
    menuEmptyChat: "ჩვენს მენიუში ამჟამად კერძები არ არის.",
    orderOk: (table: string, id: string) =>
      `შეკვეთა მიღებულია, ${table}. სამზარეულოს ბილეთი #${id}.`,
    orderFail: "შეკვეთა ვერ გაიგზავნა. სცადეთ თავიდან.",
    feedbackTitle: "როგორ შეაფასებდით დღევანდელ მომსახურებას?",
    feedbackPositive:
      "მადლობა შეფასებისთვის! ძალიან დაგვეხმარებით, თუ თქვენს შთაბეჭდილებას Google-ზეც გაგვიზიარებთ ✨",
    feedbackGoogle: "შეფასება Google-ზე",
    feedbackGoogleMissing:
      "Google-ის შეფასების ბმული ჯერ დამატებული არ არის",
    feedbackNegativePrompt:
      "გთხოვთ გვითხრათ, რა არ მოგეწონათ, რომ გამოსწორება შევძლოთ:",
    feedbackCommentPrompt: "გთხოვთ, დაწეროთ თქვენი აზრი:",
    feedbackCommentPlaceholder: "დაწერეთ კომენტარი…",
    feedbackSubmit: "გაგზავნა",
    feedbackSending: "იგზავნება…",
    feedbackThanks:
      "მადლობა გამოხმაურებისთვის! თქვენი შენიშვნა მიღებულია და გადაეცემა ადმინისტრაციას მომსახურების გაუმჯობესების მიზნით.",
    feedbackSkip: "ახლა არა",
    feedbackStarLabel: (n: number) => `${n}/5`,
    feedbackRatingHint: (n: number) =>
      [
        "",
        "გასაუმჯობესებელია",
        "სუსტი",
        "საშუალო",
        "კარგი",
        "შესანიშნავი!",
      ][n] ?? "",
    feedbackStaffAlert: (table: string, rating: number, note: string) =>
      `⚠️ ყურადღება! მაგიდა ${table}-ზე დაბალი შეფასებაა (${rating}/5): ${note}`,
  },
  en: {
    all: "All",
    table: "Table",
    language: "Language",
    addToCart: "Add to Cart",
    priceBottle: "Bottle",
    priceGlass: "Glass",
    addBottle: "Bottle",
    addGlass: "Glass",
    decreaseQty: "Decrease quantity",
    increaseQty: "Increase quantity",
    soldOut: "Sold out",
    remove: "Remove",
    unavailable: "Unavailable",
    ingredients: "Ingredients",
    nutritionHeading: "Nutritional value",
    nutritionEnergy: "Calories",
    nutritionKcal: "kcal",
    nutritionProtein: "Protein",
    nutritionCarbs: "Carbohydrates",
    nutritionFat: "Fat",
    nutritionGram: "g",
    prepTime: "Average prep",
    prepMinutes: "min",
    emptyCategory: "No dishes in this category yet.",
    menuEmpty: "The menu is empty 🍽️",
    searchPlaceholder: "Search a dish, ingredient...",
    searchAria: "Search dishes",
    hostAskCta: "Ask the Chef Assistant ✨",
    hostCloudDish: "Would you like help choosing a dish? ✨",
    hostCloudWine: "Shall we pair a wine with your order? 🍷",
    hostCloudDiet: "Do you have any dietary requirements? 🛡️",
    searchClear: "Clear search",
    searchEmpty: "No dishes found 🍽️",
    translatingMenu: "Translating menu…",
    cartEmpty: "Cart is empty",
    cartHint: "Add dishes, then call the waiter. This is not a confirmed order.",
    items: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
    aiAssistant: "Chef Assistant",
    checkout: "Call Waiter",
    yourOrder: "Your selection",
    addFromMenu: "Add dishes from the menu.",
    cartEmptyLong: "No dishes selected yet — the waiter can still come by.",
    cartSent: "Already with the waiter",
    cartJustAdded: "Just added",
    cartDraft: "Not sent yet",
    cartShared: "This list is shared by everyone at the table.",
    total: "Total",
    dishesSubtotal: "Dishes subtotal",
    serviceFee: (percent: number) => `Service (${percent}%)`,
    grandTotalDue: "Amount due",
    placeOrder: "Call Waiter",
    sending: "Calling…",
    callWaiter: "Call waiter",
    callWaiterWithItems: "Call waiter with selected items",
    requestTitle: "How can we help?",
    requestHint: "Choose a request — the waiter will be notified.",
    requestSent: "Request sent!",
    lineNote: "Special request",
    lineNotePlaceholder: "e.g. no onion, less spicy, extra khinkali",
    ticketSent: "Sent",
    ticketSeen: "Waiter has seen it",
    ticketReady: "Ready to serve",
    ticketDone: "Done",
    closedTitle: "We're closed right now",
    closedHours: (range: string) => `Hours: ${range}`,
    closedHint: "Please come back during opening hours.",
    offlineBanner:
      "Wi-Fi is down. You can still browse dishes. Orders and chat need a connection.",
    boughtTogether: "Frequently ordered together 🍷",
    chefTip: "Chef's tip 👨‍🍳",
    addUpsell: "➕ Add",
    flavorWhyCutRich:
      "Bright acidity balances the richness of what you already chose.",
    flavorWhyCoolSpice: "Cools the heat and resets the palate.",
    flavorWhyGrill: "A classic match for grilled and red-meat dishes.",
    flavorWhySeafood: "Stays light with citrus notes beside fish or poultry.",
    flavorWhyDairy: "Cuts through creamy cheese with a cleaner contrast.",
    flavorWhyDessert: "A sweet finish for the table.",
    flavorWhyDrink: "Lifts the flavors and refreshes the palate.",
    flavorWhyWine: "Follows the printed wine pairing for this dish.",
    flavorWhyShare: "Ingredients and taste profiles complement the cart.",
    summaryHint:
      "Show this list to the waiter when they arrive. Nothing is sent to the kitchen from here.",
    callSent: "Waiter called. Show this list when they arrive.",
    callFail: "Could not call the waiter. Try again.",
    each: "each",
    noTable: "No table",
    chefAssistant: "Chef Assistant",
    chefWidgetBubble:
      "Need help choosing a dish? Ask me anything you like!",
    waiterTitle: "Chef Assistant",
    waiterIntro: (name: string) =>
      `Welcome to ${name}. I am your Chef Assistant — here to guide you through the menu, allergens, and a glass of qvevri wine.`,
    hostBannerBefore: "Hello! I am your ",
    hostBannerName: "Chef Assistant",
    hostBannerAfter:
      ". I can help you choose dishes, check allergens, or pair wine ✨",
    waiterPlaceholder: "Ask the chef: what should we order today?...",
    thinking: "Thinking…",
    sendChat: "Send",
    apiError:
      "შეფ-ასისტენტი ამჟამად მიუწვდომელია. გთხოვთ სცადოთ ოდნავ მოგვიანებით.",
    vegetarian: "🌱 Suggest fasting / vegetarian",
    wine: "🍷 What wine pairs with khinkali?",
    spicy: "🌶️ What's most popular?",
    vegetarianPrompt:
      "Suggest fasting or vegetarian dishes that are on the menu now.",
    winePrompt:
      "What wine should I pair with khinkali? If there is no khinkali, pair wine with the mains.",
    wineMains: "🍷 What wine pairs with the mains?",
    wineMainsPrompt:
      "What wine or drink from this menu pairs with the mains? Only recommend items printed on this menu.",
    spicyPrompt: "What are the most popular dishes on the menu today?",
    chipQuickLunch: "⚡ Quick lunch",
    chipQuickLunchPrompt: "Suggest a quick lunch — something filling that arrives fast.",
    chipBestsellers: "🔥 Top 3 bestsellers",
    chipBestsellersPrompt: "What are your top 3 bestsellers today?",
    chipDessert: "🍰 House dessert",
    chipDessertPrompt: "Recommend the house dessert from this menu.",
    chipKids: "👶 Kids' menu",
    chipKidsPrompt: "What works as a kids' dish — milder and easy to eat?",
    chipOther: "🍽️ Something else",
    chipOtherPrompt:
      "What other dishes would you recommend from different sections of this menu (such as salads, seafood, soups, or desserts)?",
    quizChip: "🎲 Help me choose (3 seconds)",
    quizQ1: "Meat or vegetarian?",
    quizMeat: "🥩 Meat",
    quizVeg: "🌱 Vegetarian",
    quizQ2: "Light meal or hearty feast?",
    quizLight: "🥗 Light",
    quizHearty: "🍲 Hearty",
    quizPicked: "I would be delighted to recommend:",
    filterGluten: "🚫 Gluten-free",
    filterDairy: "🚫 Dairy-free",
    filterNuts: "🥜 Nut-free",
    budgetLunch: "💰 Lunch under 25 ₾",
    budgetLunchPrompt:
      "Suggest a lunch under 25 GEL (including the service fee) — quick and tasty.",
    budgetDinner: "✨ Dinner for 2",
    budgetDinnerPrompt:
      "Build a dinner for two from this menu (starter and mains) and calculate the total including the service fee.",
    addFromChat: "➕ Add",
    detailsFromChat: "Details",
    allergens: "Allergens",
    addedFromChat: "Added",
    removeFromChat: "🗑️ Remove",
    allergenSafety:
      "⚠️ Please also double-check with your waiter regarding any severe allergies when placing your order.",
    pairKhinkali: "Khinkali pairs beautifully with our qvevri Saperavi!",
    pairWith: (pairing: string) => `Pairs with: ${pairing}`,
    dietNote: (label: string) => `Noted: ${label}.`,
    dietRemovedNote: (label: string) => `Filter removed: ${label}.`,
    noCategoryDish: "We do not currently have a dish in that category on our menu.",
    menuEmptyChat: "There are no dishes on this menu yet.",
    orderOk: (table: string, id: string) =>
      `Order confirmed for ${table}. Kitchen ticket #${id}.`,
    orderFail: "Could not send the order. Try again.",
    feedbackTitle: "How would you rate today's service?",
    feedbackPositive:
      "Thank you for your rating! We would greatly appreciate it if you could also leave us a review on Google ✨",
    feedbackGoogle: "Review on Google",
    feedbackGoogleMissing: "Google review link is not configured yet",
    feedbackNegativePrompt:
      "Please tell us what didn't work so we can make it right:",
    feedbackCommentPrompt: "Please share your thoughts:",
    feedbackCommentPlaceholder: "Write a comment…",
    feedbackSubmit: "Submit",
    feedbackSending: "Sending…",
    feedbackThanks:
      "Thank you for your feedback! Your comments have been sent to management to help us improve our service.",
    feedbackSkip: "Not now",
    feedbackStarLabel: (n: number) => `${n}/5`,
    feedbackRatingHint: (n: number) =>
      ["", "Needs improvement", "Fair", "Okay", "Good", "Excellent!"][n] ?? "",
    feedbackStaffAlert: (table: string, rating: number, note: string) =>
      `⚠️ Attention! Table ${table} left a low rating (${rating}/5): ${note}`,
  },
  ru: {
    all: "Все",
    table: "Стол",
    language: "Язык",
    addToCart: "В корзину",
    priceBottle: "Бутылка",
    priceGlass: "Бокал",
    addBottle: "Бутылка",
    addGlass: "Бокал",
    decreaseQty: "Уменьшить количество",
    increaseQty: "Увеличить количество",
    soldOut: "Нет в наличии",
    remove: "Удалить",
    unavailable: "Недоступно",
    ingredients: "Ингредиенты",
    nutritionHeading: "Пищевая ценность",
    nutritionEnergy: "Калории",
    nutritionKcal: "ккал",
    nutritionProtein: "Белки",
    nutritionCarbs: "Углеводы",
    nutritionFat: "Жиры",
    nutritionGram: "г",
    prepTime: "Среднее приготовление",
    prepMinutes: "мин",
    emptyCategory: "В этой категории пока нет блюд.",
    menuEmpty: "Меню пусто 🍽️",
    searchPlaceholder: "Найти блюдо, ингредиент...",
    searchAria: "Поиск блюд",
    hostAskCta: "Спросить шеф-помощника ✨",
    hostCloudDish: "Помочь вам с выбором блюда? ✨",
    hostCloudWine: "Подобрать подходящее вино к вашему заказу? 🍷",
    hostCloudDiet: "Есть ли у вас особые диетические пожелания? 🛡️",
    searchClear: "Очистить поиск",
    searchEmpty: "Блюдо не найдено 🍽️",
    translatingMenu: "Перевод меню…",
    cartEmpty: "Корзина пуста",
    cartHint: "Добавьте блюда и позовите официанта. Это ещё не подтверждённый заказ.",
    items: (n: number) => `${n} поз.`,
    aiAssistant: "Шеф-помощник",
    checkout: "Позвать официанта",
    yourOrder: "Ваш выбор",
    addFromMenu: "Добавьте блюда из меню.",
    cartEmptyLong: "Список пуст — официант всё равно подойдёт.",
    cartSent: "Уже у официанта",
    cartJustAdded: "Только что добавлено",
    cartDraft: "Ещё не отправлено",
    cartShared: "Этот список общий для всех за этим столом.",
    total: "Итого",
    dishesSubtotal: "Сумма блюд",
    serviceFee: (percent: number) => `Обслуживание (${percent}%)`,
    grandTotalDue: "К оплате",
    placeOrder: "Позвать официанта",
    sending: "Вызов…",
    callWaiter: "Позвать официанта",
    callWaiterWithItems: "Позвать официанта с выбранными блюдами",
    requestTitle: "Чем помочь?",
    requestHint: "Выберите запрос — официант получит уведомление.",
    requestSent: "Запрос отправлен!",
    lineNote: "Особое пожелание",
    lineNotePlaceholder: "напр. без лука, менее остро",
    ticketSent: "Отправлено",
    ticketSeen: "Официант видел",
    ticketReady: "Готово к подаче",
    ticketDone: "Готово",
    closedTitle: "Сейчас закрыто",
    closedHours: (range: string) => `Часы работы: ${range}`,
    closedHint: "Пожалуйста, приходите в часы работы.",
    offlineBanner:
      "Wi-Fi недоступен. Блюда видны, но заказ и чат требуют сеть.",
    boughtTogether: "Часто заказывают вместе 🍷",
    chefTip: "Совет шефа 👨‍🍳",
    addUpsell: "➕ Добавить",
    flavorWhyCutRich:
      "Кислинка уравновешивает насыщенность выбранного блюда.",
    flavorWhyCoolSpice: "Снимает остроту и освежает вкус.",
    flavorWhyGrill: "Классическое сочетание к грилю и красному мясу.",
    flavorWhySeafood: "Легко и с цитрусом рядом с рыбой или птицей.",
    flavorWhyDairy: "Салат или кислинка очищают сливочный сырный вкус.",
    flavorWhyDessert: "Сладкое завершение стола.",
    flavorWhyDrink: "Дополняет вкус и освежает нёбо.",
    flavorWhyWine: "Следует винной паре, указанной к блюду.",
    flavorWhyShare: "По ингредиентам и вкусу сочетается с заказом.",
    summaryHint:
      "Покажите этот список официанту. На кухню заказ отсюда не уходит.",
    callSent: "Официант вызван. Покажите список, когда подойдёт.",
    callFail: "Не удалось вызвать официанта. Попробуйте ещё раз.",
    each: "шт.",
    noTable: "Нет стола",
    chefAssistant: "Шеф-помощник",
    chefWidgetBubble:
      "Нужна помощь с выбором блюда? Спросите меня о чём угодно!",
    waiterTitle: "Шеф-помощник",
    waiterIntro: (name: string) =>
      `Добро пожаловать в ${name}. Я ваш Шеф-помощник — с радостью помогу с меню, аллергенами и вином из квеври.`,
    hostBannerBefore: "Здравствуйте! Я ваш ",
    hostBannerName: "Шеф-помощник",
    hostBannerAfter:
      ". Помогу выбрать блюдо, проверить аллергены или подобрать вино ✨",
    waiterPlaceholder: "Спросите шефа: что закажем сегодня?...",
    thinking: "Думаю…",
    sendChat: "Отправить",
    apiError:
      "შეფ-ასისტენტი ამჟამად მიუწვდომელია. გთხოვთ სცადოთ ოდნავ მოგვიანებით.",
    vegetarian: "🌱 Постный / вегетарианский",
    wine: "🍷 Какое вино к хинкали?",
    spicy: "🌶️ Что самое популярное?",
    vegetarianPrompt:
      "Посоветуй постные или вегетарианские блюда, которые сейчас в меню.",
    winePrompt:
      "Какое вино подойдёт к хинкали? Если хинкали нет — к основным блюдам.",
    wineMains: "🍷 Какое вино к основным блюдам?",
    wineMainsPrompt:
      "Какое вино или напиток из этого меню подойдёт к основным блюдам? Только то, что есть в меню.",
    spicyPrompt: "Какие блюда сегодня самые популярные?",
    chipQuickLunch: "⚡ Быстрый ланч",
    chipQuickLunchPrompt: "Посоветуй быстрый ланч — сытный и без долгого ожидания.",
    chipBestsellers: "🔥 Топ-3 бестселлера",
    chipBestsellersPrompt: "Какие у вас топ-3 бестселлера сегодня?",
    chipDessert: "🍰 Фирменный десерт",
    chipDessertPrompt: "Посоветуй фирменный десерт из этого меню.",
    chipKids: "👶 Детское меню",
    chipKidsPrompt: "Что подойдёт ребёнку — мягкое и простое блюдо?",
    chipOther: "🍽️ Другое",
    chipOtherPrompt:
      "Какие ещё блюда из других разделов этого меню вы посоветуете (например, салаты, морепродукты, супы или десерты)?",
    quizChip: "🎲 Помоги выбрать (3 секунды)",
    quizQ1: "Мясо или вегетарианское?",
    quizMeat: "🥩 Мясо",
    quizVeg: "🌱 Вегетарианское",
    quizQ2: "Лёгкое блюдо или сытный ужин?",
    quizLight: "🥗 Лёгкое",
    quizHearty: "🍲 Сытное",
    quizPicked: "С удовольствием посоветую вам:",
    filterGluten: "🚫 Без глютена",
    filterDairy: "🚫 Без молочного",
    filterNuts: "🥜 Без орехов",
    budgetLunch: "💰 Ланч до 25 ₾",
    budgetLunchPrompt:
      "Посоветуйте ланч до 25 лари (с учётом сервисного сбора) — быстро и вкусно.",
    budgetDinner: "✨ Ужин на двоих",
    budgetDinnerPrompt:
      "Соберите ужин на двоих из этого меню (закуска и основные блюда) и посчитайте итоговую сумму с учётом сервисного сбора.",
    addFromChat: "➕ Добавить",
    detailsFromChat: "Подробнее",
    allergens: "Аллергены",
    addedFromChat: "Добавлено",
    removeFromChat: "🗑️ Убрать",
    allergenSafety:
      "⚠️ Пожалуйста, также уточните информацию об аллергенах у официанта при оформлении заказа.",
    pairKhinkali: "Хинкали прекрасно сочетаются с нашим квеври Саперави!",
    pairWith: (pairing: string) => `К блюду: ${pairing}`,
    dietNote: (label: string) => `Учту: ${label}.`,
    dietRemovedNote: (label: string) => `Фильтр снят: ${label}.`,
    noCategoryDish: "В нашем меню сейчас нет блюда этой категории.",
    menuEmptyChat: "В этом меню пока нет блюд.",
    orderOk: (table: string, id: string) =>
      `Заказ принят, ${table}. Кухня #${id}.`,
    orderFail: "Не удалось отправить заказ. Попробуйте ещё раз.",
    feedbackTitle: "Как вы оцените сегодняшнее обслуживание?",
    feedbackPositive:
      "Спасибо за вашу оценку! Мы будем очень благодарны, если вы также оставите отзыв о нас на Google ✨",
    feedbackGoogle: "Оценить на Google",
    feedbackGoogleMissing: "Ссылка на отзыв Google ещё не добавлена",
    feedbackNegativePrompt:
      "Расскажите, что не понравилось — мы постараемся исправить:",
    feedbackCommentPrompt: "Поделитесь своим мнением:",
    feedbackCommentPlaceholder: "Напишите комментарий…",
    feedbackSubmit: "Отправить",
    feedbackSending: "Отправка…",
    feedbackThanks:
      "Спасибо за ваш отзыв! Замечания переданы администрации для улучшения качества обслуживания.",
    feedbackSkip: "Не сейчас",
    feedbackStarLabel: (n: number) => `${n}/5`,
    feedbackRatingHint: (n: number) =>
      ["", "Нужно улучшить", "Слабо", "Нормально", "Хорошо", "Отлично!"][n] ??
      "",
    feedbackStaffAlert: (table: string, rating: number, note: string) =>
      `⚠️ Внимание! Стол ${table} оставил низкую оценку (${rating}/5): ${note}`,
  },
} as const;

const INGREDIENT_NAMES: Record<string, LocaleMap> = {};
for (const [key, entry] of Object.entries(INGREDIENT_I18N)) {
  const mapped: LocaleMap = { ...entry, ka: entry.ka ?? key };
  aliasLocaleMap(INGREDIENT_NAMES, mapped, key, entry.ka, entry.en, entry.ru);
}

const runtimeOverlay: Record<"en" | "ru", Record<string, string>> = {
  en: {},
  ru: {},
};

const CACHE_KEY = "smart-ai-menu-tx-v3";
const STALE_CACHE_KEYS = ["smart-ai-menu-tx-v1", "smart-ai-menu-tx-v2"];
let storedTranslationsLoaded = false;

export function hasGeorgianScript(text: string) {
  return /[\u10A0-\u10FF]/.test(text);
}

function usableTranslation(value: string | undefined, locale: MenuLocale) {
  if (!value?.trim()) return undefined;
  if (locale !== "ka" && hasGeorgianScript(value)) return undefined;
  return value;
}

export function loadStoredMenuTranslations() {
  if (storedTranslationsLoaded || typeof window === "undefined") return;
  storedTranslationsLoaded = true;
  try {
    for (const key of STALE_CACHE_KEYS) {
      window.localStorage.removeItem(key);
    }
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<typeof runtimeOverlay>;
    for (const locale of ["en", "ru"] as const) {
      const incoming = parsed[locale] ?? {};
      for (const [source, translated] of Object.entries(incoming)) {
        if (usableTranslation(translated, locale)) {
          runtimeOverlay[locale][source] = translated;
        }
      }
    }
  } catch {
    /* ignore */
  }
}

export function applyMenuTranslations(
  locale: "en" | "ru",
  map: Record<string, string>,
) {
  const next = { ...runtimeOverlay[locale] };
  for (const [source, translated] of Object.entries(map)) {
    if (usableTranslation(translated, locale)) next[source] = translated;
  }
  runtimeOverlay[locale] = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(runtimeOverlay));
  } catch {
    /* ignore quota */
  }
}

function overlayLookup(original: string, locale: MenuLocale) {
  if (locale === "ka") return undefined;
  const table = runtimeOverlay[locale];
  return usableTranslation(
    table[original] || table[original.trim()],
    locale,
  );
}

function dictLookup(
  original: string,
  locale: MenuLocale,
  dictionary: Record<string, LocaleMap>,
) {
  const trimmed = original.trim();
  const entry =
    dictionary[original] ||
    dictionary[trimmed] ||
    dictionary[trimmed.toLowerCase()];
  return entry?.[locale];
}

export function localizeName(
  original: string,
  locale: MenuLocale,
  dictionary: Record<string, Partial<Record<MenuLocale, string>>>,
) {
  const fromDict = dictLookup(original, locale, dictionary);
  if (fromDict) return fromDict;
  const fromOverlay = overlayLookup(original, locale);
  if (fromOverlay) return fromOverlay;
  return original;
}

export function dishLabel(name: string, locale: MenuLocale) {
  return localizeName(name, locale, DISH_NAMES);
}

export function dishDescription(
  name: string,
  fallback: string,
  locale: MenuLocale,
) {
  const entry =
    DISH_DESCRIPTIONS[name] ||
    DISH_DESCRIPTIONS[name.trim()] ||
    DISH_DESCRIPTIONS[fallback] ||
    DISH_DESCRIPTIONS[fallback.trim()];
  if (locale === "ka") {
    return fallback || entry?.ka || name;
  }
  if (entry?.[locale]) return entry[locale];
  const fromOverlay =
    overlayLookup(fallback, locale) || overlayLookup(name, locale);
  if (fromOverlay) return fromOverlay;
  return "";
}

export function categoryLabel(name: string, locale: MenuLocale) {
  return localizeName(name, locale, CATEGORY_NAMES);
}

export function storedLocaleText(
  locale: MenuLocale,
  en?: string | null,
  ru?: string | null,
) {
  if (locale === "en") return en?.trim() || "";
  if (locale === "ru") return ru?.trim() || "";
  return "";
}

export function dishNameFromFields(
  dish: { name: string; name_en?: string | null; name_ru?: string | null },
  locale: MenuLocale,
) {
  return (
    storedLocaleText(locale, dish.name_en, dish.name_ru) ||
    dishLabel(dish.name, locale)
  );
}

export function dishDescriptionFromFields(
  dish: {
    name: string;
    description: string;
    description_en?: string | null;
    description_ru?: string | null;
  },
  locale: MenuLocale,
) {
  return (
    storedLocaleText(locale, dish.description_en, dish.description_ru) ||
    dishDescription(dish.name, dish.description, locale)
  );
}

export function categoryNameFromFields(
  category: { name: string; name_en?: string | null; name_ru?: string | null },
  locale: MenuLocale,
) {
  return (
    storedLocaleText(locale, category.name_en, category.name_ru) ||
    categoryLabel(category.name, locale)
  );
}

export function allergenLabel(name: string, locale: MenuLocale) {
  const clean = name.trim().replace(/\.\s*$/, "");
  return (
    ALLERGENS[clean]?.[locale] ||
    ALLERGENS[clean.toLowerCase()]?.[locale] ||
    overlayLookup(name, locale) ||
    overlayLookup(clean, locale) ||
    clean
  );
}

export function ingredientLabel(name: string, locale: MenuLocale) {
  const clean = name.trim().replace(/\.\s*$/, "");
  return localizeName(clean, locale, INGREDIENT_NAMES);
}

export function staticMenuTranslation(text: string, locale: MenuLocale) {
  const value = text.trim();
  const clean = value.replace(/\.\s*$/, "");
  if (!value || locale === "ka") return null;
  return (
    usableTranslation(dictLookup(value, locale, DISH_NAMES), locale) ||
    usableTranslation(dictLookup(clean, locale, DISH_NAMES), locale) ||
    usableTranslation(dictLookup(value, locale, CATEGORY_NAMES), locale) ||
    usableTranslation(dictLookup(clean, locale, CATEGORY_NAMES), locale) ||
    usableTranslation(dictLookup(value, locale, INGREDIENT_NAMES), locale) ||
    usableTranslation(dictLookup(clean, locale, INGREDIENT_NAMES), locale) ||
    usableTranslation(ALLERGENS[clean]?.[locale], locale) ||
    usableTranslation(ALLERGENS[clean.toLowerCase()]?.[locale], locale) ||
    overlayLookup(value, locale) ||
    overlayLookup(clean, locale) ||
    null
  );
}

export function needsLiveTranslation(text: string, locale: MenuLocale) {
  const value = text.trim();
  if (!value || locale === "ka") return false;
  if (staticMenuTranslation(value, locale)) return false;
  if (hasGeorgianScript(value)) return true;
  if (locale === "en" && /^[\x00-\x7F]+$/.test(value)) return false;
  if (locale === "ru" && /[\u0400-\u04FF]/.test(value)) return false;
  return true;
}

export function formatGel(amount: number) {
  return `₾${Number(amount).toFixed(2)}`;
}
