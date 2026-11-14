"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OpsReport } from "@/lib/ops-analytics";
import { categoryLabel, dishLabel, formatGel } from "@/lib/menu-copy";

export function OpsAnalyticsSections({ report }: { report: OpsReport | null }) {
  const { locale, t } = useAdminLocale();
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.opsAttention}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t.opsMigration}</p>
        </CardContent>
      </Card>
    );
  }

  const decisionSeconds =
    report.decision.medianSeconds === null
      ? null
      : Math.round(report.decision.medianSeconds);
  const stationName = (id: string) => {
    if (id === "grill") return t.stationGrill;
    if (id === "cold") return t.stationCold;
    if (id === "pastry") return t.stationPastry;
    if (id === "bar") return t.stationBar;
    if (id === "other") return t.stationOther;
    return t.stationKitchen;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.opsAttention}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.attention.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.opsAttentionEmpty}</p>
          ) : (
            report.attention.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3">
                <span className="text-sm">{dishLabel(row.name, locale)}</span>
                <span className="text-muted-foreground text-right text-xs tabular-nums">
                  {row.looks} {t.opsLooks} · {row.avgSeconds} {t.opsSeconds} ·{" "}
                  {t.sold} {row.orderedQty}
                  {row.lookedElse > 0
                    ? ` · ${row.lookedElse} ${t.opsOrderedElse}`
                    : ""}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsDecision}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {decisionSeconds === null ? (
            <p className="text-muted-foreground">{t.opsDecisionEmpty}</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {decisionSeconds} {t.opsSeconds}
              </p>
              {report.decision.stuckCategory ? (
                <p>
                  {t.opsStuck}:{" "}
                  {categoryLabel(report.decision.stuckCategory, locale)}
                </p>
              ) : null}
              {report.decision.categories.map((row) => (
                <div key={row.id} className="flex justify-between gap-2">
                  <span>{categoryLabel(row.name, locale)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.medianSeconds} {t.opsSeconds}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsWaiter}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {report.waiters.rows.length === 0 ? (
            <p className="text-muted-foreground">{t.opsWaiterEmpty}</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">{t.opsWaiterNeed}</p>
              {report.waiters.rows.map((row) => (
                <div key={row.email} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{row.email}</span>
                  <span className="text-muted-foreground text-right text-xs tabular-nums">
                    {row.tickets} · {t.opsAvgCheck} {formatGel(row.avgCheck)} ·{" "}
                    {t.opsAttach} {Math.round(row.attachRate * 100)}%
                    {row.label === "sales" ? (
                      <Badge className="ml-2">{t.opsSalesAgent}</Badge>
                    ) : null}
                    {row.label === "operator" ? (
                      <Badge variant="secondary" className="ml-2">
                        {t.opsOperator}
                      </Badge>
                    ) : null}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsKitchen}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {report.kitchen.rows.length === 0 ? (
            <p className="text-muted-foreground">{t.opsKitchenEmpty}</p>
          ) : (
            <>
              <DelayList
                title={t.popularDishes}
                rows={report.kitchen.rows.map((row) => ({
                  ...row,
                  name: dishLabel(row.name, locale),
                }))}
                unit={t.opsDelay}
              />
              <DelayList
                title={t.category}
                rows={report.kitchen.categories.map((row) => ({
                  ...row,
                  name: categoryLabel(row.name, locale),
                }))}
                unit={t.opsDelay}
              />
              <DelayList
                title={t.categoryStation}
                rows={report.kitchen.stations.map((row) => ({
                  ...row,
                  name: stationName(row.id),
                }))}
                unit={t.opsDelay}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsCustom}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {report.customizations.notedLines === 0 ? (
            <p className="text-muted-foreground">{t.opsCustomEmpty}</p>
          ) : (
            <>
              <p>
                {report.customizations.notedLines} ·{" "}
                {Math.round(report.customizations.ticketShare * 100)}% {t.opsTicketShare}
              </p>
              <p className="text-muted-foreground">
                {t.opsExtraMinutes}: {Math.round(report.customizations.extraMinutes)}
              </p>
              {report.customizations.phrases.map((phrase) => (
                <div key={phrase.text} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{phrase.text}</span>
                  <span className="text-muted-foreground tabular-nums">{phrase.count}</span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsWeather}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {report.weather.status === "needs_location" ? (
            <p className="text-muted-foreground">{t.opsWeatherNoLocation}</p>
          ) : null}
          {report.weather.status === "unavailable" ? (
            <p className="text-muted-foreground">{t.opsWeatherUnavailable}</p>
          ) : null}
          {report.weather.status === "need_history" ? (
            <p className="text-muted-foreground">{t.opsWeatherNeedHistory}</p>
          ) : null}
          {report.weather.status === "ready"
            ? report.weather.shifts.map((shift) => (
                <p key={shift.category}>
                  {categoryLabel(shift.category, locale)}: {shift.changePercent > 0 ? "+" : ""}
                  {shift.changePercent}% · {shift.rainyPercent}% {t.opsWeatherRain} ·{" "}
                  {shift.dryPercent}% {t.opsWeatherDry}
                </p>
              ))
            : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.opsPrice}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {report.prices.status === "empty" ? (
            <p className="text-muted-foreground">{t.opsPriceEmpty}</p>
          ) : null}
          {report.prices.status === "demand_cut" ? (
            <p className="text-muted-foreground">{t.opsPriceCut}</p>
          ) : null}
          {report.prices.redLine ? (
            <p>
              {t.opsRedLine}: {dishLabel(report.prices.redLine.dishName, locale)} ·{" "}
              {report.prices.redLine.increasePercent}%
            </p>
          ) : null}
          {report.prices.rows.map((row) => (
            <div
              key={`${row.dishName}-${row.oldPrice}-${row.newPrice}`}
              className="flex justify-between gap-2"
            >
              <span>{dishLabel(row.dishName, locale)}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatGel(row.oldPrice)} → {formatGel(row.newPrice)} · {row.beforeQty} →{" "}
                {row.afterQty}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DelayList({
  title,
  rows,
  unit,
}: {
  title: string;
  rows: Array<{ id: string; name: string; delayMinutes: number }>;
  unit: string;
}) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{title}</p>
      {rows.map((row) => (
        <div key={row.id} className="flex justify-between gap-2">
          <span>{row.name}</span>
          <span className="text-muted-foreground tabular-nums">
            {row.delayMinutes} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
