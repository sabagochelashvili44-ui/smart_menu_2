export type DietFilter = {
  blockedAllergens: string[];
  vegan: boolean;
  vegetarian: boolean;
};

const EMPTY: DietFilter = {
  blockedAllergens: [],
  vegan: false,
  vegetarian: false,
};

const ALLERGEN_HINTS: Array<{ tag: string; pattern: RegExp }> = [
  {
    tag: "nuts",
    pattern:
      /nut allerg|walnut|ნიგვზ|თხილ|орех|без орех|nut[- ]free|არ მინდა ნიგოზ/i,
  },
  {
    tag: "gluten",
    pattern: /gluten|გლუტენ|глютен|celiac|ცელიაკ/i,
  },
  {
    tag: "dairy",
    pattern: /dairy|lactose|რძის|რძე|лактоз|молочн|არ მინდა ყველ/i,
  },
  {
    tag: "eggs",
    pattern: /egg allerg|კვერცხის ალერგ|аллерг.*яиц/i,
  },
  {
    tag: "fish",
    pattern: /fish allerg|თევზის ალერგ|аллерг.*рыб/i,
  },
  {
    tag: "shellfish",
    pattern: /shellfish|კრევეტ|моллюск/i,
  },
];

export function emptyDietFilter(): DietFilter {
  return { ...EMPTY, blockedAllergens: [] };
}

export function inferDietFromText(text: string, current = emptyDietFilter()) {
  const next: DietFilter = {
    vegan: current.vegan,
    vegetarian: current.vegetarian,
    blockedAllergens: [...current.blockedAllergens],
  };
  const blob = text.trim();
  if (!blob) return next;

  if (/vegan|ვეგან|веган|სამარხვ|მარხვ|fasting|постн|постан/i.test(blob)) {
    next.vegan = true;
    next.vegetarian = true;
  }
  if (/vegetarian|ვეგეტარ|вегетариан/i.test(blob)) {
    next.vegetarian = true;
  }

  for (const hint of ALLERGEN_HINTS) {
    if (hint.pattern.test(blob) && !next.blockedAllergens.includes(hint.tag)) {
      next.blockedAllergens.push(hint.tag);
    }
  }
  return next;
}

function dishBlob(dish: {
  name: string;
  description?: string | null;
  ingredients?: string[] | null;
  category?: string | null;
}) {
  return `${dish.name} ${dish.description ?? ""} ${(dish.ingredients ?? []).join(" ")} ${dish.category ?? ""}`.toLowerCase();
}

function allergenBlocked(blob: string, blocked: string[]) {
  if (blocked.includes("nuts") && /ნიგვზ|walnut|орех|ნიგოზ|hazelnut|pistachio/.test(blob)) {
    return true;
  }
  if (
    blocked.includes("gluten") &&
    /ხაჭაპურ|ხინკალ|პური|შოთი|khachapuri|khinkali|bread|gluten|мук|тесто/.test(blob)
  ) {
    return true;
  }
  if (
    blocked.includes("dairy") &&
    /ყველ|სულგუნ|რძ|ხაჭაპურ|matsoni|nadughi|elarji|dairy|cheese|sulguni|yogurt|cream|масло|сыр|молоч/.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
}

function plantBasedBlocked(blob: string, diet: DietFilter) {
  if (
    (diet.vegan || diet.vegetarian) &&
    /მწვად|ხინკალ|ქაბაბ|სტეიკ|ჩაშუშულ|შქმერულ|ხარჩო|ჩაქაფულ|ოჯახურ|ჩანახ|ოსტრ|კუპატ|კუბდარ|chashushuli|shkmeruli|kharcho|chakapuli|ojakhuri|chanakhi|ostri|kupati|kubdari|მწვადი|mtsvadi|pork|beef|veal|lamb|chicken|turkey|meat|ხორც|საქონლ|ღორ|ხბო|ცხვრ|ქათამ|ქათმ|ინდაურ|სუკ|ბეკონ|ლორ|говяд|свин|баран|телят|куриц|курин|мяс/.test(
      blob,
    )
  ) {
    return true;
  }
  if (
    diet.vegan &&
    /ყველ|სულგუნ|რძ|კვერცხ|ხაჭაპურ|ერბო|კარაქ|ნაღებ|ნაყინ|მაწონ|ნადუღ|ელარჯ|გებჟალი|თაფლ|dairy|cheese|egg|butter|cream|ice cream|honey|sulguni|matsoni|nadughi|elarji|йогурт|сыр|масло|сливк|яйц|морожен/.test(
      blob,
    )
  ) {
    return true;
  }
  return (
    (diet.vegetarian || diet.vegan) &&
    /თევზ|კალმახ|ორაგულ|კრევეტ|მიდი|კალმარ|ზღვის პროდუქტ|fish|trout|salmon|shrimp|mussel|calamari|seafood|рыб|форел|лосос|кревет|миди|кальмар|морепродукт/.test(
      blob,
    )
  );
}

export function dishDietLabels(dish: {
  name: string;
  description?: string | null;
  allergens?: string[] | null;
  ingredients?: string[] | null;
  category?: string | null;
}) {
  const blob = dishBlob(dish);
  const isDrink =
    /ღვინ|საფერავ|რქაწითელ|ქინძმარაულ|კოქტეილ|ჯინ|ლიმონათ|სასმელ|wine|cocktail|lemonade|drink|вино|коктейл|лимонад|напит/.test(
      blob,
    );
  const isFasting = !plantBasedBlocked(blob, {
    blockedAllergens: [],
    vegan: true,
    vegetarian: true,
  });
  const isVegetarian = !plantBasedBlocked(blob, {
    blockedAllergens: [],
    vegan: false,
    vegetarian: true,
  });
  const tags: string[] = [];
  if (!isDrink) {
    if (isFasting) {
      tags.push("fasting/vegan (სამარხვო / ვეგანური)");
      tags.push("vegetarian (ვეგეტარიანული)");
    } else if (isVegetarian) {
      tags.push("vegetarian (ვეგეტარიანული - შეიცავს რძის ნაწარმს/კვერცხს)");
    }
  }
  return tags;
}

export function dishMatchesDiet(
  dish: {
    name: string;
    description?: string | null;
    allergens?: string[] | null;
    ingredients?: string[] | null;
    category?: string | null;
  },
  diet: DietFilter,
) {
  const listed = (dish.allergens ?? []).map((item) => item.toLowerCase());
  if (diet.blockedAllergens.some((blocked) => listed.includes(blocked))) {
    return false;
  }
  const blob = dishBlob(dish);
  if (allergenBlocked(blob, diet.blockedAllergens)) return false;
  return !plantBasedBlocked(blob, diet);
}
