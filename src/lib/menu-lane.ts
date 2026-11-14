export type MenuLane = "food" | "bar";
export type DrinkPour = "glass" | "bottle";

const BAR_NAME_RE =
  /სასმელ|ღვინ|ლუდ|კოქტეილ|bar|drink|beverage|wine|beer|cocktail|spirit|напит|бар|вино|пиво|коктейл/i;

export function isBarCategory(meta: {
  station?: string | null;
  menu_role?: string | null;
  name?: string | null;
}) {
  const role = String(meta.menu_role ?? "").trim().toLowerCase();
  const station = String(meta.station ?? "").trim().toLowerCase();
  if (role === "drink") return true;
  if (station === "bar") return true;
  return BAR_NAME_RE.test(String(meta.name ?? ""));
}

export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function canonicalDishPrice(input: {
  price?: number | null;
  glass_price?: number | null;
  bottle_price?: number | null;
}) {
  const glass = parseMoney(input.glass_price);
  const bottle = parseMoney(input.bottle_price);
  if (glass != null && glass > 0) return glass;
  if (bottle != null && bottle > 0) return bottle;
  return Math.max(0, Number(input.price) || 0);
}

export function parseDrinkPour(value: unknown): DrinkPour | undefined {
  return value === "glass" || value === "bottle" ? value : undefined;
}

export function priceForPour(
  dish: {
    price?: number | null;
    glass_price?: number | null;
    bottle_price?: number | null;
  },
  pour?: DrinkPour | null,
) {
  if (pour === "glass") {
    const glass = parseMoney(dish.glass_price);
    if (glass != null) return glass;
  }
  if (pour === "bottle") {
    const bottle = parseMoney(dish.bottle_price);
    if (bottle != null) return bottle;
  }
  return canonicalDishPrice(dish);
}

export function availablePours(dish: {
  glass_price?: number | null;
  bottle_price?: number | null;
}): DrinkPour[] {
  const pours: DrinkPour[] = [];
  if (parseMoney(dish.glass_price) != null) pours.push("glass");
  if (parseMoney(dish.bottle_price) != null) pours.push("bottle");
  return pours;
}
