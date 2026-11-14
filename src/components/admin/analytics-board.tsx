"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { DemandPeaksSection } from "@/components/admin/demand-peaks-section";
import { IngredientUseSection } from "@/components/admin/ingredient-use-section";
import { MenuReadingSection } from "@/components/admin/menu-reading-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  isAnalyticsRangePreset,
  type AnalyticsRangePreset,
} from "@/lib/analytics-range";
import type { SalesDishRow, SalesSummary } from "@/lib/analytics-summary";
import { dishLabel, formatGel } from "@/lib/menu-copy";
import type { MenuReadingReport } from "@/lib/menu-reading";
import type { DemandPeaksReport } from "@/lib/guest-demand";
import type { IngredientUseRow } from "@/lib/sold-dishes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type SalesPage = SalesSummary & {
  window: string;
  windowFromYmd: string;
  windowToYmd: string;
  menuReading?: MenuReadingReport;
  ingredientUse?: IngredientUseRow[];
  demandPeaks?: DemandPeaksReport;
};

function rangeQuery(preset: AnalyticsRangePreset, fromYmd: string, toYmd: string) {
  const params = new URLSearchParams();
  params.set("range", preset);
  if (preset === "custom") {
    params.set("from", fromYmd);
    params.set("to", toYmd);
  }
  return params.toString();
}

function useAnalyticsRange() {
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("range");
  const preset: AnalyticsRangePreset = isAnalyticsRangePreset(rangeParam)
    ? rangeParam
    : "last7";
  return {
    preset,
    fromYmd: searchParams.get("from") ?? "",
    toYmd: searchParams.get("to") ?? "",
  };
}

export function AnalyticsBoard({
  restaurantId,
  initialData = null,
}: {
  restaurantId: string;
  initialData?: SalesPage | null;
}) {
  const { locale, t } = useAdminLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { preset, fromYmd, toYmd } = useAnalyticsRange();
  const [data, setData] = useState<SalesPage | null>(initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const skipSeededFetch = useRef(
    Boolean(initialData) && preset === "last7" && !fromYmd && !toYmd,
  );

  const query = useMemo(
    () => rangeQuery(preset, fromYmd, toYmd),
    [fromYmd, preset, toYmd],
  );

  useEffect(() => {
    if (preset !== "custom") return;
    if (fromYmd) setCustomFrom(fromYmd);
    if (toYmd) setCustomTo(toYmd);
  }, [fromYmd, preset, toYmd]);

  useEffect(() => {
    let cancelled = false;
    if (skipSeededFetch.current) {
      skipSeededFetch.current = false;
      return () => {
        cancelled = true;
      };
    }
    setLoadError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/analytics?restaurantId=${restaurantId}&${query}`,
        );
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Analytics failed");
        }
        const stats = (await res.json()) as SalesPage;
        if (!cancelled) {
          setData(stats);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : t.loadingAnalytics,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, restaurantId, t.loadingAnalytics]);

  const rangeLabel =
    preset === "today"
      ? t.rangeToday
      : preset === "last30"
        ? t.rangeLast30
        : preset === "month"
          ? t.rangeMonth
          : preset === "custom"
            ? t.rangeCustom
            : t.rangeLast7;

  function applyRange(next: AnalyticsRangePreset, from = customFrom, to = customTo) {
    const qs = rangeQuery(next, from, to);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (loadError && !data) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground text-sm">{t.loadingAnalytics}</p>;
  }

  const deltaLabel = preset === "month" ? t.vsPreviousMonth : t.vsPreviousPeriod;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t.strategicWindow}</span>
          <select
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
            value={preset}
            onChange={(event) => {
              const next = event.target.value as AnalyticsRangePreset;
              if (next === "custom") {
                applyRange(
                  "custom",
                  customFrom || data.windowFromYmd || "",
                  customTo || data.windowToYmd || "",
                );
                return;
              }
              applyRange(next);
            }}
          >
            <option value="today">{t.rangeToday}</option>
            <option value="last7">{t.rangeLast7}</option>
            <option value="last30">{t.rangeLast30}</option>
            <option value="month">{t.rangeMonth}</option>
            <option value="custom">{t.rangeCustom}</option>
          </select>
        </label>
        {preset === "custom" ? (
          <>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t.rangeStart}</span>
              <Input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t.rangeEnd}</span>
              <Input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!customFrom || !customTo}
              onClick={() => applyRange("custom", customFrom, customTo)}
            >
              {t.rangeCustom}
            </Button>
          </>
        ) : null}
        <p className="text-muted-foreground pb-1 text-xs">
          {rangeLabel}
          {data.windowFromYmd && data.windowToYmd
            ? ` · ${data.windowFromYmd} → ${data.windowToYmd}`
            : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi
          title={t.confirmedRevenue}
          value={formatGel(data.revenue)}
          delta={data.revenueChange}
          deltaLabel={deltaLabel}
          hint={`${t.revenueWithoutFee}: ${formatGel(data.revenueDishes)} (${formatDelta(data.revenueDishesChange)})`}
        />
        <Kpi
          title={t.confirmedOrders}
          value={String(data.orderCount)}
          delta={data.orderCountChange}
          deltaLabel={deltaLabel}
        />
        <Kpi
          title={t.salesAverageCheck}
          value={data.averageCheck === null ? "—" : formatGel(data.averageCheck)}
          delta={data.averageCheckChange}
          deltaLabel={deltaLabel}
        />
        <Kpi
          title={t.waitUntilConfirm}
          value={
            data.averageWaitMinutes === null
              ? "—"
              : `${data.averageWaitMinutes} ${t.minutesShort}`
          }
          delta={data.averageWaitChange}
          deltaLabel={deltaLabel}
          invert
        />
      </div>

      <MenuReadingSection report={data.menuReading} />
      <DemandPeaksSection report={data.demandPeaks} />
      <IngredientUseSection rows={data.ingredientUse} />

      <div className="grid gap-3 lg:grid-cols-2">
        <DishList
          title={t.popularDishes}
          rows={data.popularDishes}
          empty={t.noConfirmedInRange}
          locale={locale}
          pieces={t.pieces}
        />
        <DishList
          title={t.rareDishes}
          rows={data.rareDishes}
          empty={data.orderCount === 0 ? t.noConfirmedInRange : t.rareDishesEmpty}
          locale={locale}
          pieces={t.pieces}
        />
      </div>
    </div>
  );
}

function formatDelta(delta: number) {
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return `${arrow} ${Math.abs(delta)}%`;
}

function Kpi({
  title,
  value,
  delta,
  deltaLabel,
  hint,
  invert = false,
}: {
  title: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  invert?: boolean;
}) {
  const deltaText = typeof delta === "number" ? formatDelta(delta) : null;
  const rising = typeof delta === "number" && delta > 0;
  const falling = typeof delta === "number" && delta < 0;
  const positive = invert ? falling : rising;
  const negative = invert ? rising : falling;
  const deltaClass = positive
    ? "text-emerald-600"
    : negative
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-primary text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{hint}</p>
        ) : null}
        {deltaText ? (
          <p className={`mt-1 text-xs ${deltaClass}`}>
            {deltaText}
            {deltaLabel ? ` · ${deltaLabel}` : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DishList({
  title,
  rows,
  empty,
  locale,
  pieces,
}: {
  title: string;
  rows: SalesDishRow[];
  empty: string;
  locale: "ka" | "en" | "ru";
  pieces: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{dishLabel(row.name, locale)}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {row.quantity} {pieces} · {formatGel(row.revenue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
