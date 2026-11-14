"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel, dishLabel, formatGel } from "@/lib/menu-copy";
import type { OverviewLane } from "@/lib/overview-ops";
import type {
  OverviewLaneSnapshot,
  OverviewSnapshot,
} from "@/lib/overview-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { StarIcon } from "lucide-react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 10_000;
const REFRESH_DEBOUNCE_MS = 400;

export function OverviewBoard({
  restaurantId,
  initialData = null,
}: {
  restaurantId: string;
  initialData?: OverviewSnapshot | null;
}) {
  const { locale, t } = useAdminLocale();
  const [data, setData] = useState<OverviewSnapshot | null>(initialData);
  const [lane, setLane] = useState<OverviewLane>("food");
  const [digests, setDigests] = useState<Record<OverviewLane, string | null>>({
    food: null,
    bar: null,
  });
  const [digestLoading, setDigestLoading] = useState(false);
  const [openRating, setOpenRating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/overview?restaurantId=${restaurantId}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      throw new Error(json.error ?? "Overview failed");
    }
    return (await res.json()) as OverviewSnapshot;
  }, [restaurantId]);

  const applyStats = useCallback((stats: OverviewSnapshot) => {
    startTransition(() => {
      setData(stats);
      setError(null);
    });
  }, []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    void load()
      .then(applyStats)
      .catch(() => undefined)
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [applyStats, load]);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    void (async () => {
      try {
        const stats = await load();
        if (!cancelled) applyStats(stats);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t.loadingOverview);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStats, initialData, load, t.loadingOverview]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let debounce: number | null = null;
    const schedule = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`overview-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiter_calls",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reviews",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        schedule,
      )
      .subscribe();

    const poll = window.setInterval(refresh, POLL_MS);
    return () => {
      if (debounce) window.clearTimeout(debounce);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refresh, restaurantId]);

  const slice = data?.[lane] ?? null;
  const digestKey = slice
    ? `${lane}:${slice.revenue.toFixed(2)}:${slice.orderCount}:${locale}`
    : "";
  const lastDigestKeyRef = useRef<Record<OverviewLane, string>>({
    food: "",
    bar: "",
  });

  const loadDigest = useCallback(async () => {
    const res = await fetch("/api/admin/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, locale, lane }),
    });
    const json = (await res.json()) as { digest?: string; error?: string };
    if (!res.ok || !json.digest) {
      throw new Error(json.error ?? t.aiInsightsError);
    }
    return json.digest;
  }, [lane, locale, restaurantId, t.aiInsightsError]);

  useEffect(() => {
    if (!slice) return;
    let cancelled = false;

    if (!(slice.orderCount > 0 || slice.revenue > 0)) {
      lastDigestKeyRef.current[lane] = digestKey;
      setDigests((current) => ({ ...current, [lane]: t.aiInsightsEmpty }));
      setDigestLoading(false);
      return;
    }

    if (lastDigestKeyRef.current[lane] === digestKey) return;

    const delay = lastDigestKeyRef.current[lane] ? 2500 : 0;
    setDigestLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const text = await loadDigest();
          if (!cancelled) {
            lastDigestKeyRef.current[lane] = digestKey;
            setDigests((current) => ({ ...current, [lane]: text }));
          }
        } catch {
          if (!cancelled) {
            lastDigestKeyRef.current[lane] = digestKey;
            setDigests((current) => ({
              ...current,
              [lane]: current[lane] ?? t.aiInsightsUnavailable,
            }));
          }
        } finally {
          if (!cancelled) setDigestLoading(false);
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [digestKey, lane, loadDigest, slice, t.aiInsightsEmpty, t.aiInsightsUnavailable]);

  function switchLane(next: OverviewLane) {
    if (next === lane) return;
    setOpenRating(null);
    startTransition(() => setLane(next));
  }

  if (error && !data) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (!data || !slice) {
    return <p className="text-muted-foreground text-sm">{t.loadingOverview}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted inline-flex rounded-lg p-1">
          <button
            type="button"
            className={tabClass(lane === "food")}
            aria-pressed={lane === "food"}
            onClick={() => switchLane("food")}
          >
            {t.overviewFoodTab}
          </button>
          <button
            type="button"
            className={tabClass(lane === "bar")}
            aria-pressed={lane === "bar"}
            onClick={() => switchLane("bar")}
          >
            {t.overviewBarTab}
          </button>
        </div>
        {data.hoursLabel ? (
          <p className="text-muted-foreground text-xs">
            {t.serviceWindowHint}: {data.hoursLabel}
          </p>
        ) : null}
      </div>

      <LaneBoard
        slice={slice}
        digest={digestLoading && !digests[lane] ? t.generatingInsights : digests[lane]}
        locale={locale}
        openRating={openRating}
        onToggleRating={(rating) =>
          setOpenRating((current) => (current === rating ? null : rating))
        }
        t={t}
      />
    </div>
  );
}

function tabClass(active: boolean) {
  return active
    ? "rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm"
    : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground";
}

function LaneBoard({
  slice,
  digest,
  locale,
  openRating,
  onToggleRating,
  t,
}: {
  slice: OverviewLaneSnapshot;
  digest: string | null;
  locale: "ka" | "en" | "ru";
  openRating: number | null;
  onToggleRating: (rating: number) => void;
  t: ReturnType<typeof useAdminLocale>["t"];
}) {
  const peakOrders = useMemo(
    () => Math.max(0, ...slice.hourly.map((row) => row.orders)),
    [slice.hourly],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title={t.todayRevenue}
          value={formatGel(slice.revenue)}
          hint={`${formatGel(slice.revenueDishes ?? 0)} ${t.dishesRevenue} + ${formatGel(slice.revenueFee ?? 0)} ${t.serviceFeeRevenue}`}
        />
        <Kpi title={t.todayOrders} value={String(slice.orderCount)} />
        <Kpi
          title={t.pendingCallsKpi}
          value={String(slice.pendingCalls)}
          hint={`${slice.pendingOpenedToday ?? 0} ${t.pendingOpenedToday} · ${slice.pendingLeftover ?? 0} ${t.pendingLeftover}`}
        />
        <Kpi title={t.aov} value={formatGel(slice.aov)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.hourlyPeak}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slice.hourly.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noHourly}</p>
            ) : (
              slice.hourly.map((row) => (
                <div key={row.hour} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums">{row.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.orders} {t.orderUnit}
                      {row.isPeak ? (
                        <Badge variant="default" className="ml-2">
                          {t.peakHour}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className={
                        row.isPeak
                          ? "bg-primary h-full rounded-full"
                          : "bg-secondary h-full rounded-full"
                      }
                      style={{
                        width: `${peakOrders ? (row.orders / peakOrders) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.categorySplit}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-xs">{t.categoryDishOnlyNote}</p>
            {slice.categories.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noCategorySales}</p>
            ) : (
              slice.categories.map((row) => {
                const name =
                  row.category === "__other__"
                    ? t.otherCategory
                    : categoryLabel(row.category, locale);
                return (
                  <div key={row.category} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.percent}% · {formatGel(row.revenue)}
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${Math.min(100, row.percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.topDishesToday}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slice.topToday.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noTopToday}</p>
            ) : (
              slice.topToday.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{dishLabel(row.name, locale)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.qty} {t.pieces}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.todayReviews}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {slice.reviewsToday.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noReviewsToday}</p>
            ) : null}
            {slice.reviewBreakdown.map((row) => (
              <div key={row.rating} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StarIcon className="size-3.5 fill-amber-500 text-amber-500" />
                    {row.rating}
                    {t.ratingOutOf}
                    <span className="text-muted-foreground font-normal tabular-nums">
                      · {row.count}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={row.count === 0}
                    onClick={() => onToggleRating(row.rating)}
                  >
                    {t.reviewDetails}
                  </Button>
                </div>
                {openRating === row.rating ? (
                  <ul className="mt-2 space-y-1.5">
                    {row.reviews.map((review) => (
                      <li
                        key={review.id}
                        className="text-muted-foreground text-sm"
                      >
                        {review.tableNumber ? (
                          <span className="text-foreground mr-1 font-medium">
                            {t.reviewTable} #{review.tableNumber}:
                          </span>
                        ) : null}
                        {review.comment || ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.dailyDigest}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{digest}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
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
      </CardContent>
    </Card>
  );
}
