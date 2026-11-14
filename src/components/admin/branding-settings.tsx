"use client";

import { saveRestaurantBranding } from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { guestTableMenuUrl } from "@/lib/app-url";
import {
  BRAND_FONTS,
  DEFAULT_BRAND,
  autoBrandPalette,
  brandCssVars,
  normalizeHex,
   resolvedBrand,
  restaurantLogo,
  restaurantPublicKey,
  slugifyRestaurant,
} from "@/lib/restaurant-brand";
import { formatHourClock } from "@/lib/opening-hours";
import type { AdminRestaurant } from "@/lib/supabaseAdmin";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";

export function BrandingSettings({ restaurant }: { restaurant: AdminRestaurant }) {
  const { t } = useAdminLocale();
  const router = useRouter();
  const initialBrand = useMemo(() => resolvedBrand(restaurant), [restaurant]);
  const [name, setName] = useState(restaurant.name);
  const [slug, setSlug] = useState(
    restaurant.slug ?? slugifyRestaurant(restaurant.name),
  );
  const [logoUrl, setLogoUrl] = useState(restaurantLogo(restaurant) ?? "");
  const [primary, setPrimary] = useState(initialBrand.primary);
  const [secondary, setSecondary] = useState(initialBrand.secondary);
  const [bg, setBg] = useState(initialBrand.background);
  const [textColor, setTextColor] = useState(initialBrand.foreground);
  const [mutedTextColor, setMutedTextColor] = useState(
    initialBrand.mutedForeground,
  );
  const [primaryTextColor, setPrimaryTextColor] = useState(
    initialBrand.onPrimary,
  );
  const [secondaryTextColor, setSecondaryTextColor] = useState(
    initialBrand.onSecondary,
  );
  const [priceColor, setPriceColor] = useState(initialBrand.priceColor);
  const [cardColor, setCardColor] = useState(initialBrand.card);
  const [borderColor, setBorderColor] = useState(initialBrand.border);
  const [font, setFont] = useState<string>(initialBrand.fontId);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    restaurant.google_maps_review_url ?? restaurant.google_review_url ?? "",
  );
  const [serviceFeePercent, setServiceFeePercent] = useState(
    String(restaurant.service_fee_percent ?? 0),
  );
  const [latitude, setLatitude] = useState(
    restaurant.latitude == null ? "" : String(restaurant.latitude),
  );
  const [longitude, setLongitude] = useState(
    restaurant.longitude == null ? "" : String(restaurant.longitude),
  );
  const [extraMinutes, setExtraMinutes] = useState(
    String(restaurant.customization_extra_minutes ?? 2),
  );
  const [hoursEnabled, setHoursEnabled] = useState(
    Boolean(restaurant.hours_enabled),
  );
  const [hoursOpen, setHoursOpen] = useState(
    formatHourClock(restaurant.hours_open) || "11:00",
  );
  const [hoursClose, setHoursClose] = useState(
    formatHourClock(restaurant.hours_close) || "23:00",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previewVars = useMemo(
    () =>
      brandCssVars({
        id: restaurant.id,
        name,
        primary_color: primary,
        secondary_color: secondary,
        bg_color: bg,
        text_color: textColor,
        muted_text_color: mutedTextColor,
        primary_text_color: primaryTextColor,
        secondary_text_color: secondaryTextColor,
        price_color: priceColor,
        card_color: cardColor,
        border_color: borderColor,
        font,
      }) as CSSProperties,
    [
      restaurant.id,
      name,
      primary,
      secondary,
      bg,
      textColor,
      mutedTextColor,
      primaryTextColor,
      secondaryTextColor,
      priceColor,
      cardColor,
      borderColor,
      font,
    ],
  );

  function applyAutoContrast() {
    const auto = autoBrandPalette({
      primary_color: primary,
      secondary_color: secondary,
      bg_color: bg,
    });
    setTextColor(auto.text_color);
    setMutedTextColor(auto.muted_text_color);
    setPrimaryTextColor(auto.primary_text_color);
    setSecondaryTextColor(auto.secondary_text_color);
    setPriceColor(auto.price_color);
    setCardColor(auto.card_color);
    setBorderColor(auto.border_color);
  }

  const sampleUrl = guestTableMenuUrl(
    slugifyRestaurant(slug) || restaurant.id,
    "Table 1",
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const form = new FormData(event.currentTarget);
    form.set("name", name);
    form.set("slug", slug);
    form.set("logo_url", logoUrl);
    form.set("primary_color", normalizeHex(primary, DEFAULT_BRAND.primary_color));
    form.set(
      "secondary_color",
      normalizeHex(secondary, DEFAULT_BRAND.secondary_color),
    );
    form.set("bg_color", normalizeHex(bg, DEFAULT_BRAND.bg_color));
    form.set("text_color", textColor);
    form.set("muted_text_color", mutedTextColor);
    form.set("primary_text_color", primaryTextColor);
    form.set("secondary_text_color", secondaryTextColor);
    form.set("price_color", priceColor);
    form.set("card_color", cardColor);
    form.set("border_color", borderColor);
    form.set("font", font);
    form.set("google_review_url", googleReviewUrl);
    form.set("google_maps_review_url", googleReviewUrl);
    form.set("service_fee_percent", serviceFeePercent);
    form.set("latitude", latitude);
    form.set("longitude", longitude);
    form.set("customization_extra_minutes", extraMinutes);
    form.set("hours_enabled", hoursEnabled ? "true" : "false");
    form.set("hours_open", hoursOpen);
    form.set("hours_close", hoursClose);
    const result = await saveRestaurantBranding(form);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="restaurant-name">{t.restaurantName}</Label>
          <Input
            id="restaurant-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-slug">{t.slug}</Label>
          <Input
            id="restaurant-slug"
            name="slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
          />
          <p className="text-muted-foreground text-xs">{t.slugHint}</p>
          <p className="text-muted-foreground break-all text-xs">{sampleUrl}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo-file">{t.logo}</Label>
          <Input id="logo-file" name="logo" type="file" accept="image/*" />
          <Label htmlFor="logo-url">{t.logoUrl}</Label>
          <Input
            id="logo-url"
            name="logo_url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://"
          />
          <p className="text-muted-foreground text-xs">{t.logoHint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-fee-percent">{t.serviceFeePercent}</Label>
          <Input
            id="service-fee-percent"
            name="service_fee_percent"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={serviceFeePercent}
            onChange={(event) => setServiceFeePercent(event.target.value)}
            placeholder="10"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="restaurant-latitude">{t.latitude}</Label>
            <Input
              id="restaurant-latitude"
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="41.7151"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurant-longitude">{t.longitude}</Label>
            <Input
              id="restaurant-longitude"
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="44.8271"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t.locationHint}</p>
        <div className="space-y-2">
          <Label htmlFor="customization-minutes">{t.customizationMinutes}</Label>
          <Input
            id="customization-minutes"
            type="number"
            min="0"
            max="30"
            step="1"
            value={extraMinutes}
            onChange={(event) => setExtraMinutes(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t.customizationMinutesHint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="google-review-url">{t.googleReviewUrl}</Label>
          <Input
            id="google-review-url"
            name="google_maps_review_url"
            type="url"
            value={googleReviewUrl}
            onChange={(event) => setGoogleReviewUrl(event.target.value)}
            placeholder={t.googleReviewPlaceholder}
          />
          <p className="text-muted-foreground text-xs">{t.googleReviewHint}</p>
        </div>

        <div className="border-border/70 bg-card/50 space-y-4 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{t.hoursSection}</h3>
          <Label htmlFor="hours-enabled" className="flex items-center gap-2">
            <Switch
              id="hours-enabled"
              checked={hoursEnabled}
              onCheckedChange={setHoursEnabled}
            />
            {t.hoursEnabled}
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hours-open">{t.hoursOpen}</Label>
              <Input
                id="hours-open"
                name="hours_open"
                type="time"
                value={hoursOpen}
                onChange={(event) => setHoursOpen(event.target.value)}
                disabled={!hoursEnabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hours-close">{t.hoursClose}</Label>
              <Input
                id="hours-close"
                name="hours_close"
                type="time"
                value={hoursClose}
                onChange={(event) => setHoursClose(event.target.value)}
                disabled={!hoursEnabled}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{t.hoursHint}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField
            id="primary_color"
            label={t.primaryColor}
            value={primary}
            onChange={setPrimary}
          />
          <ColorField
            id="secondary_color"
            label={t.secondaryColor}
            value={secondary}
            onChange={setSecondary}
          />
          <ColorField
            id="bg_color"
            label={t.bgColor}
            value={bg}
            onChange={setBg}
          />
        </div>

        <div className="border-border/70 bg-card/50 space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t.wordColorsSection}</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                applyAutoContrast();
              }}
            >
              {t.autoContrastColors}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ColorField
              id="text_color"
              label={t.textColor}
              value={textColor}
              onChange={setTextColor}
            />
            <ColorField
              id="muted_text_color"
              label={t.mutedTextColor}
              value={mutedTextColor}
              onChange={setMutedTextColor}
            />
            <ColorField
              id="price_color"
              label={t.priceColor}
              value={priceColor}
              onChange={setPriceColor}
            />
            <ColorField
              id="primary_text_color"
              label={t.primaryTextColor}
              value={primaryTextColor}
              onChange={setPrimaryTextColor}
            />
            <ColorField
              id="secondary_text_color"
              label={t.secondaryTextColor}
              value={secondaryTextColor}
              onChange={setSecondaryTextColor}
            />
          </div>
        </div>

        <div className="border-border/70 bg-card/50 space-y-4 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{t.surfaceColorsSection}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              id="card_color"
              label={t.cardColor}
              value={cardColor}
              onChange={setCardColor}
            />
            <ColorField
              id="border_color"
              label={t.borderColor}
              value={borderColor}
              onChange={setBorderColor}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="font">{t.font}</Label>
          <select
            id="font"
            name="font"
            value={font}
            onChange={(event) => setFont(event.target.value)}
            className="border-input bg-card text-foreground h-9 w-full rounded-lg border px-2.5 text-sm"
          >
            {BRAND_FONTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {saved ? <p className="text-sm text-secondary">{t.saved}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t.saveSettings}
        </Button>
      </div>
      <aside
        className="space-y-4 rounded-xl border p-4"
        style={{
          ...previewVars,
          backgroundColor: bg,
          color: textColor,
          borderColor,
          fontFamily: initialBrand.font,
        }}
      >
        <p
          className="text-xs uppercase tracking-wide"
          style={{ color: mutedTextColor }}
        >
          {t.preview}
        </p>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div
              className="flex size-12 items-center justify-center rounded-full text-lg font-semibold"
              style={{ backgroundColor: cardColor, color: textColor }}
            >
              {name.slice(0, 1) || "R"}
            </div>
          )}
          <div>
            <p className="font-semibold" style={{ color: textColor }}>
              {name || restaurantPublicKey(restaurant)}
            </p>
            <p className="text-xs" style={{ color: mutedTextColor }}>
              /{slug || "slug"}
            </p>
          </div>
        </div>

        <div
          className="space-y-2 rounded-xl border p-3 shadow-xs"
          style={{
            backgroundColor: cardColor,
            borderColor,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: textColor }}>
              {t.previewSampleDish}
            </p>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: priceColor }}
            >
              ₾24.00
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: mutedTextColor }}>
            {t.previewSampleDesc}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: primary, color: primaryTextColor }}
            >
              Primary
            </span>
            <span
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: secondary, color: secondaryTextColor }}
            >
              Secondary
            </span>
          </div>
        </div>
      </aside>
    </form>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const pickerValue = normalizeHex(value, "#000000");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          key={pickerValue}
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="border-input h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <input
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border-input bg-transparent h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}
