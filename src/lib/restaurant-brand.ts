export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

export const DEFAULT_BRAND = {
  primary_color: "#6d0808",
  secondary_color: "#757d6f",
  bg_color: "#eeead7",
  font: "noto-sans-georgian",
} as const;

export const BRAND_FONTS = [
  {
    id: "noto-sans-georgian",
    label: "Noto Sans Georgian",
    css: "var(--font-noto-sans-georgian), var(--font-noto-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "noto-sans",
    label: "Noto Sans",
    css: "var(--font-noto-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "georgia",
    label: "Georgia",
    css: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "system",
    label: "System UI",
    css: "ui-sans-serif, system-ui, sans-serif",
  },
] as const;

export type BrandFontId = (typeof BRAND_FONTS)[number]["id"];

export type BrandExtendedColors = {
  text_color?: string | null;
  muted_text_color?: string | null;
  primary_text_color?: string | null;
  secondary_text_color?: string | null;
  price_color?: string | null;
  card_color?: string | null;
  border_color?: string | null;
};

export type RestaurantBrandFields = BrandExtendedColors & {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  bg_color?: string | null;
  font?: string | null;
  subscription_status?: string | null;
  manager_email?: string | null;
  google_review_url?: string | null;
  google_maps_review_url?: string | null;
  service_fee_percent?: number | null;
  hours_enabled?: boolean | null;
  hours_open?: string | null;
  hours_close?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  customization_extra_minutes?: number | null;
};

export const RESTAURANT_BRAND_SELECT =
  "id, name, slug, logo, logo_url, primary_color, secondary_color, bg_color, font, subscription_status, manager_email, google_review_url, google_maps_review_url, service_fee_percent";

export function restaurantLogo(row: {
  logo?: string | null;
  logo_url?: string | null;
}) {
  return row.logo_url || row.logo || null;
}

export function restaurantPublicKey(row: {
  id: string;
  slug?: string | null;
}) {
  const slug = row.slug?.trim();
  return slug || row.id;
}

export function isSubscriptionSuspended(status: string | null | undefined) {
  return (status ?? "").toLowerCase() === "suspended";
}

function trimChars(value: string, code: number) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === code) start += 1;
  while (end > start && value.charCodeAt(end - 1) === code) end -= 1;
  return value.slice(start, end);
}

export function slugifyRestaurant(input: string) {
  const lower = input.trim().toLowerCase();
  let ascii = "";
  let pendingDash = false;
  for (const char of lower) {
    const code = char.codePointAt(0) ?? 0;
    const isDigit = code >= 48 && code <= 57;
    const isLetter = code >= 97 && code <= 122;
    if (isDigit || isLetter) {
      ascii += char;
      pendingDash = false;
    } else if (ascii && !pendingDash) {
      ascii += "-";
      pendingDash = true;
    }
  }
  return trimChars(ascii, 45).slice(0, 64);
}

const DARK_INK = "#1c1917";
const LIGHT_INK = "#f8f6f0";
const WCAG_AA_TEXT = 4.5;
const WCAG_AA_MUTED = 3;

export function normalizeHex(value: string | null | undefined, fallback: string) {
  const raw = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.slice(1).toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [
    Number.parseInt(n.slice(0, 2), 16) || 0,
    Number.parseInt(n.slice(2, 4), 16) || 0,
    Number.parseInt(n.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Mixes `colorA` (weight 0..1) with `colorB` (1 - weight) and returns a 6-digit hex. */
export function mixHex(colorA: string, colorB: string, weightA = 0.5): string {
  const w = Math.max(0, Math.min(1, weightA));
  const [r1, g1, b1] = hexToRgb(normalizeHex(colorA, "#000000"));
  const [r2, g2, b2] = hexToRgb(normalizeHex(colorB, "#ffffff"));
  return rgbToHex(
    r1 * w + r2 * (1 - w),
    g1 * w + g2 * (1 - w),
    b1 * w + b2 * (1 - w),
  );
}

/** WCAG 2.1 relative luminance of a HEX color (0 = black, 1 = white). */
export function relativeLuminance(hex: string) {
  const [r8, g8, b8] = hexToRgb(normalizeHex(hex, "#000000"));
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r8) + 0.7152 * toLinear(g8) + 0.0722 * toLinear(b8);
}

/** WCAG contrast ratio between two HEX colors (1–21). */
export function contrastRatio(hexA: string, hexB: string) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastOn(hex: string) {
  return bestInkOn(hex, WCAG_AA_TEXT);
}

function bestInkOn(background: string, minRatio = WCAG_AA_TEXT) {
  const bg = normalizeHex(background, DEFAULT_BRAND.bg_color);
  const darkRatio = contrastRatio(DARK_INK, bg);
  const lightRatio = contrastRatio(LIGHT_INK, bg);
  const darkOk = darkRatio >= minRatio;
  const lightOk = lightRatio >= minRatio;
  if (darkOk && !lightOk) return DARK_INK;
  if (lightOk && !darkOk) return LIGHT_INK;
  return darkRatio >= lightRatio ? DARK_INK : LIGHT_INK;
}

function mutedInkOn(background: string, ink: string, minRatio = WCAG_AA_MUTED) {
  const bg = normalizeHex(background, DEFAULT_BRAND.bg_color);
  let low = 0;
  let high = 1;
  let best = ink;
  for (let i = 0; i < 14; i += 1) {
    const mid = (low + high) / 2;
    const mixed = mixHex(ink, bg, mid);
    if (contrastRatio(mixed, bg) >= minRatio) {
      best = mixed;
      high = mid;
    } else {
      low = mid;
    }
  }
  return contrastRatio(best, bg) >= minRatio ? best : ink;
}

function readableOn(background: string, preferred: string, minRatio = WCAG_AA_TEXT) {
  const bg = normalizeHex(background, DEFAULT_BRAND.bg_color);
  const candidate = normalizeHex(preferred, DARK_INK);
  if (contrastRatio(candidate, bg) >= minRatio) return candidate;
  return bestInkOn(bg, minRatio);
}

export function autoBrandPalette(input: {
  primary_color?: string | null;
  secondary_color?: string | null;
  bg_color?: string | null;
}) {
  const primary = normalizeHex(input.primary_color, DEFAULT_BRAND.primary_color);
  const secondary = normalizeHex(
    input.secondary_color,
    DEFAULT_BRAND.secondary_color,
  );
  const background = normalizeHex(input.bg_color, DEFAULT_BRAND.bg_color);
  const text_color = bestInkOn(background, WCAG_AA_TEXT);
  const muted_text_color = mutedInkOn(background, text_color, WCAG_AA_MUTED);
  const primary_text_color = bestInkOn(primary, WCAG_AA_TEXT);
  const secondary_text_color = bestInkOn(secondary, WCAG_AA_TEXT);
  const isLightBg = relativeLuminance(background) > 0.45;
  const card_color = isLightBg
    ? mixHex("#ffffff", background, 0.32)
    : mixHex("#ffffff", background, 0.08);
  const price_color = readableOn(card_color, primary, WCAG_AA_TEXT);
  const border_color = mutedInkOn(background, text_color, 1.4);

  return {
    text_color,
    muted_text_color,
    primary_text_color,
    secondary_text_color,
    price_color,
    card_color,
    border_color,
  };
}

const EXTENDED_KEYS: (keyof BrandExtendedColors)[] = [
  "text_color",
  "muted_text_color",
  "primary_text_color",
  "secondary_text_color",
  "price_color",
  "card_color",
  "border_color",
];

/**
 * Parses `font` column value which may store `"fontId"` or
 * `"fontId|text_color=#...|muted_text_color=#..."` so extended colors
 * persist even when no extra SQL columns exist on `restaurants`.
 */
export function parseStoredFontAndColors(rawFont: string | null | undefined): {
  fontId: BrandFontId;
  colors: BrandExtendedColors;
} {
  const raw = (rawFont ?? "").trim();
  const [fontPart, ...pairs] = raw.split("|");
  const matchedFont = BRAND_FONTS.find((item) => item.id === fontPart);
  const fontId: BrandFontId = (matchedFont ?? BRAND_FONTS[0]).id;
  const colors: BrandExtendedColors = {};

  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!k || !v) continue;
    const key = k.trim() as keyof BrandExtendedColors;
    if (EXTENDED_KEYS.includes(key) && /^#[0-9a-fA-F]{6}$/.test(v.trim())) {
      colors[key] = v.trim().toLowerCase();
    }
  }
  return { fontId, colors };
}

export function serializeFontAndColors(
  fontId: string | null | undefined,
  colors: BrandExtendedColors,
): string {
  const { fontId: cleanFont } = parseStoredFontAndColors(fontId);
  const parts: string[] = [cleanFont];
  for (const key of EXTENDED_KEYS) {
    const val = colors[key];
    if (val && /^#[0-9a-fA-F]{6}$/.test(val.trim())) {
      parts.push(`${key}=${val.trim().toLowerCase()}`);
    }
  }
  return parts.join("|");
}

export function fontCss(fontId: string | null | undefined) {
  const { fontId: cleanId } = parseStoredFontAndColors(fontId);
  const match = BRAND_FONTS.find((item) => item.id === cleanId);
  return (match ?? BRAND_FONTS[0]).css;
}

export function resolvedBrand(row: Partial<RestaurantBrandFields> | null) {
  const primary = normalizeHex(row?.primary_color, DEFAULT_BRAND.primary_color);
  const secondary = normalizeHex(
    row?.secondary_color,
    DEFAULT_BRAND.secondary_color,
  );
  const background = normalizeHex(row?.bg_color, DEFAULT_BRAND.bg_color);
  const { fontId, colors: stored } = parseStoredFontAndColors(row?.font);
  const auto = autoBrandPalette({
    primary_color: primary,
    secondary_color: secondary,
    bg_color: background,
  });

  const foreground = normalizeHex(
    row?.text_color ?? stored.text_color,
    auto.text_color,
  );
  const mutedForeground = normalizeHex(
    row?.muted_text_color ?? stored.muted_text_color,
    mixHex(foreground, background, 0.72),
  );
  const onPrimary = normalizeHex(
    row?.primary_text_color ?? stored.primary_text_color,
    auto.primary_text_color,
  );
  const onSecondary = normalizeHex(
    row?.secondary_text_color ?? stored.secondary_text_color,
    auto.secondary_text_color,
  );
  const priceColor = normalizeHex(
    row?.price_color ?? stored.price_color,
    primary,
  );
  const card = normalizeHex(
    row?.card_color ?? stored.card_color,
    auto.card_color,
  );
  const border = normalizeHex(
    row?.border_color ?? stored.border_color,
    mixHex(foreground, background, 0.24),
  );

  return {
    primary,
    secondary,
    background,
    fontId,
    font: fontCss(fontId),
    foreground,
    mutedForeground,
    onPrimary,
    onSecondary,
    priceColor,
    card,
    border,
  };
}

export function brandCssVars(row: Partial<RestaurantBrandFields> | null) {
  const brand = resolvedBrand(row);
  return {
    "--primary": brand.primary,
    "--primary-foreground": brand.onPrimary,
    "--secondary": brand.secondary,
    "--secondary-foreground": brand.onSecondary,
    "--background": brand.background,
    "--foreground": brand.foreground,
    "--card": brand.card,
    "--card-foreground": brand.foreground,
    "--popover": brand.card,
    "--popover-foreground": brand.foreground,
    "--muted": `color-mix(in srgb, ${brand.secondary} 16%, ${brand.background})`,
    "--muted-foreground": brand.mutedForeground,
    "--accent": `color-mix(in srgb, ${brand.secondary} 18%, ${brand.background})`,
    "--accent-foreground": brand.foreground,
    "--border": brand.border,
    "--input": brand.border,
    "--brand-price": brand.priceColor,
    "--destructive": brand.primary,
    "--ring": brand.primary,
    "--chart-1": brand.primary,
    "--chart-2": brand.secondary,
    "--sidebar": brand.card,
    "--sidebar-foreground": brand.foreground,
    "--sidebar-primary": brand.primary,
    "--sidebar-primary-foreground": brand.onPrimary,
    "--sidebar-accent": `color-mix(in srgb, ${brand.secondary} 18%, ${brand.background})`,
    "--sidebar-border": brand.border,
    "--sidebar-ring": brand.primary,
    "--font-sans": brand.font,
    "--font-heading": brand.font,
  } as const;
}

export function brandCssText(row: Partial<RestaurantBrandFields> | null) {
  return Object.entries(brandCssVars(row))
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}
