"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemandPeaksReport, WeekdayKey } from "@/lib/guest-demand";
import type { AdminCopy } from "@/lib/admin-i18n";
import { dishLabel } from "@/lib/menu-copy";

function weekdayLabel(key: WeekdayKey, t: AdminCopy) {
  if (key === "mon") return t.weekdayMon;
  if (key === "tue") return t.weekdayTue;
  if (key === "wed") return t.weekdayWed;
  if (key === "thu") return t.weekdayThu;
  if (key === "fri") return t.weekdayFri;
  if (key === "sat") return t.weekdaySat;
  return t.weekdaySun;
}

export function DemandPeaksSection({
  report,
}: {
  report: DemandPeaksReport | null | undefined;
}) {
  const { locale, t } = useAdminLocale();
  const data = report ?? {
    offMenu: [],
    peakHours: [],
    peakDays: [],
    peakDemand: [],
  };
  const peakOrders = Math.max(0, ...data.peakHours.map((row) => row.orders));
  const peakDayOrders = Math.max(0, ...data.peakDays.map((row) => row.orders));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.peakHoursRange}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t.peakHoursHint}
            </p>
            {data.peakHours.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.peakHoursEmpty}</p>
            ) : (
              data.peakHours.map((row) => (
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
            <CardTitle>{t.peakDays}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {peakDayOrders === 0 ? (
              <p className="text-muted-foreground text-sm">{t.peakDaysEmpty}</p>
            ) : (
              data.peakDays.map((row) => (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{weekdayLabel(row.key, t)}</span>
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
                        width: `${peakDayOrders ? (row.orders / peakDayOrders) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.peakDemand}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.peakDemandHint}
          </p>
          {data.peakDemand.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.peakDemandEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {data.peakDemand.map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {dishLabel(row.name, locale)}
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {row.sold > 0
                      ? `${row.sold} ${t.pieces}`
                      : `${row.interest} ${t.offMenuRequests}`}
                    {row.sold > 0 && row.interest > 0
                      ? ` · ${row.interest}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.offMenuDemand}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.offMenuDemandHint}
          </p>
          {data.offMenu.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.offMenuDemandEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {data.offMenu.map((row) => (
                <li
                  key={row.key}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {row.count} {t.offMenuRequests}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
