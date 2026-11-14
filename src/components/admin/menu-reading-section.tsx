"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel, dishLabel } from "@/lib/menu-copy";
import type {
  MenuReadingDishRow,
  MenuReadingReason,
  MenuReadingReport,
} from "@/lib/menu-reading";

function reasonLabel(
  reason: MenuReadingReason,
  t: {
    menuReadingReasonPrice: string;
    menuReadingReasonSub: string;
    menuReadingReasonSlow: string;
    menuReadingReasonHidden: string;
  },
) {
  if (reason === "price") return t.menuReadingReasonPrice;
  if (reason === "substitution") return t.menuReadingReasonSub;
  if (reason === "slow_choice") return t.menuReadingReasonSlow;
  return t.menuReadingReasonHidden;
}

function DishRankList({
  title,
  empty,
  rows,
  locale,
  looksLabel,
  secondsLabel,
  soldLabel,
  elseLabel,
  conversionLabel,
  t,
}: {
  title: string;
  empty: string;
  rows: MenuReadingDishRow[];
  locale: "ka" | "en" | "ru";
  looksLabel: string;
  secondsLabel: string;
  soldLabel: string;
  elseLabel: string;
  conversionLabel: string;
  t: {
    menuReadingReasonPrice: string;
    menuReadingReasonSub: string;
    menuReadingReasonSlow: string;
    menuReadingReasonHidden: string;
  };
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
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{dishLabel(row.name, locale)}</p>
                    {row.categoryName ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {categoryLabel(row.categoryName, locale)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-right text-xs tabular-nums">
                    {row.looks} {looksLabel}
                    {row.avgSeconds > 0 ? ` · ${row.avgSeconds} ${secondsLabel}` : ""}
                    {` · ${soldLabel} ${row.orderedQty}`}
                    {row.lookedElse > 0 ? ` · ${row.lookedElse} ${elseLabel}` : ""}
                    {` · ${conversionLabel} ${Math.round(row.conversion * 100)}%`}
                  </p>
                </div>
                {row.reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.reasons.map((reason) => (
                      <Badge key={reason} variant="outline">
                        {reasonLabel(reason, t)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MenuReadingSection({
  report,
}: {
  report: MenuReadingReport | null | undefined;
}) {
  const { locale, t } = useAdminLocale();

  if (!report || !report.ready) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.menuReading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t.opsMigration}</p>
        </CardContent>
      </Card>
    );
  }

  const decision =
    report.decisionMedianSeconds === null
      ? "—"
      : `${report.decisionMedianSeconds} ${t.opsSeconds}`;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{t.menuReading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.menuReadingHint}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">{t.menuReadingSessions}</p>
              <p className="text-lg font-semibold tabular-nums">{report.sessionCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t.opsDecision}</p>
              <p className="text-lg font-semibold tabular-nums">{decision}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t.opsStuck}</p>
              <p className="text-lg font-semibold">
                {report.stuckCategory
                  ? categoryLabel(report.stuckCategory, locale)
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.menuReadingHeat}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.heat.every((row) => row.looks === 0 && row.totalSeconds === 0) ? (
            <p className="text-muted-foreground text-sm">{t.menuReadingHeatEmpty}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {report.heat.map((row) => {
                const heat = Math.round(row.share * 100);
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border px-3 py-2"
                    style={{
                      background: `color-mix(in srgb, var(--primary) ${Math.max(6, heat)}%, transparent)`,
                    }}
                  >
                    <p className="truncate text-sm font-medium">
                      {categoryLabel(row.name, locale)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {heat}% · {row.looks} {t.opsLooks} · {row.totalSeconds}{" "}
                      {t.opsSeconds}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.menuReadingPath}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.path.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.menuReadingPathEmpty}</p>
          ) : (
            <p className="text-sm">
              {report.path.map((step, index) => (
                <span key={`${step.id}-${index}`}>
                  {index > 0 ? (
                    <span className="text-muted-foreground"> → </span>
                  ) : null}
                  {categoryLabel(step.name, locale)}
                </span>
              ))}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <DishRankList
          title={t.menuReadingLinger}
          empty={
            report.sessionCount === 0
              ? t.menuReadingEmpty
              : t.menuReadingLingerEmpty
          }
          rows={report.lingerSkips}
          locale={locale}
          looksLabel={t.opsLooks}
          secondsLabel={t.opsSeconds}
          soldLabel={t.sold}
          elseLabel={t.opsOrderedElse}
          conversionLabel={t.conversion}
          t={t}
        />
        <DishRankList
          title={t.menuReadingSkip}
          empty={
            report.sessionCount === 0
              ? t.menuReadingEmpty
              : t.menuReadingSkipEmpty
          }
          rows={report.skipZones}
          locale={locale}
          looksLabel={t.opsLooks}
          secondsLabel={t.opsSeconds}
          soldLabel={t.sold}
          elseLabel={t.opsOrderedElse}
          conversionLabel={t.conversion}
          t={t}
        />
      </div>
    </div>
  );
}
