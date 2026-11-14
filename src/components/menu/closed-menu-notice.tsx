"use client";

import { Button } from "@/components/ui/button";
import { restaurantHoursLabel, type RestaurantHours } from "@/lib/opening-hours";
import { ui, type MenuLocale } from "@/lib/menu-copy";
import { useEffect, useState } from "react";

export function ClosedMenuNotice({
  restaurantName,
  hours,
}: {
  restaurantName: string;
  hours: RestaurantHours;
}) {
  const [locale, setLocale] = useState<MenuLocale>("ka");
  const copy = ui[locale];
  const range = restaurantHoursLabel(hours);

  useEffect(() => {
    const stored = window.localStorage.getItem("smart-ai-menu-guest-lang");
    if (stored === "ka" || stored === "en" || stored === "ru") {
      setLocale(stored);
    }
  }, []);

  return (
    <main className="bg-background mx-auto flex min-h-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex gap-1" role="group" aria-label={copy.language}>
        {(["ka", "en", "ru"] as const).map((code) => (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={locale === code ? "default" : "outline"}
            className="min-w-9 px-2"
            onClick={() => {
              setLocale(code);
              window.localStorage.setItem("smart-ai-menu-guest-lang", code);
            }}
          >
            {code.toUpperCase()}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">{restaurantName}</p>
      <h1 className="text-xl font-semibold tracking-tight">{copy.closedTitle}</h1>
      {range ? (
        <p className="text-muted-foreground text-sm">{copy.closedHours(range)}</p>
      ) : null}
      <p className="text-muted-foreground max-w-sm text-sm">{copy.closedHint}</p>
    </main>
  );
}
