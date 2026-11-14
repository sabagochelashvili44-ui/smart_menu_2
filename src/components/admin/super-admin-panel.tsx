"use client";

import {
  createSuperAdminRestaurant,
  deleteSuperAdminRestaurant,
  enterSuperAdminViewAs,
  resetSuperAdminAiUsage,
  toggleSuperAdminSubscription,
  updateSuperAdminRestaurant,
  type SuperAdminHourlyBucket,
  type SuperAdminKpis,
  type SuperAdminRestaurant,
} from "@/app/admin/super-admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLoginUrl, getPublicAppUrl, publicMenuUrl } from "@/lib/app-url";
import { formatGel } from "@/lib/menu-copy";
import {
  DEFAULT_BRAND,
  autoBrandPalette,
  brandCssVars,
  normalizeHex,
  resolvedBrand,
  restaurantLogo,
  restaurantPublicKey,
  slugifyRestaurant,
} from "@/lib/restaurant-brand";
import type { SubscriptionStatus } from "@/lib/super-admin-shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from "react";

function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatUsdMonthly(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatTokenCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function formatCap(used: number, limit: number | null | undefined, unlimited: string) {
  const usedLabel = formatTokenCount(used);
  if (!limit) return `${usedLabel} / ${unlimited}`;
  return `${usedLabel} / ${formatTokenCount(limit)}`;
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SuperAdminPanel({
  kpis,
  restaurants,
  hourly = [],
}: {
  kpis: SuperAdminKpis;
  restaurants: SuperAdminRestaurant[];
  hourly?: SuperAdminHourlyBucket[];
}) {
  const { t } = useAdminLocale();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SuperAdminRestaurant | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<{
    name: string;
    slug: string;
    manager_email: string | null;
  } | null>(null);

  const derivedKpis = useMemo(() => {
    const active = restaurants.filter((row) => row.subscription_status === "active");
    return {
      totalRestaurants: restaurants.length,
      activeSubscribers: active.length,
      mrr: active.reduce((sum, row) => sum + row.subscription_fee, 0),
      totalOrders: kpis.totalOrders,
      aiCostUsd: restaurants.reduce((sum, row) => sum + (row.ai_cost_usd ?? 0), 0),
      aiMonthlyUsd: restaurants.reduce(
        (sum, row) => sum + (row.ai_monthly_projected_usd ?? 0),
        0,
      ),
      aiAlertCount:
        kpis.ai_alert_count ??
        restaurants.filter((row) => row.ai_alert && row.ai_alert !== "ok").length,
    };
  }, [kpis.ai_alert_count, kpis.totalOrders, restaurants]);

  const alerted = useMemo(
    () => restaurants.filter((row) => row.ai_alert && row.ai_alert !== "ok"),
    [restaurants],
  );

  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  async function onViewAs(id: string) {
    setBusyId(id);
    const result = await enterSuperAdminViewAs(id);
    if (!result.error) {
      window.location.href = `/admin?impersonate_restaurant_id=${encodeURIComponent(id)}`;
      return;
    }
    setBusyId(null);
  }

  async function onToggle(id: string) {
    setBusyId(id);
    await toggleSuperAdminSubscription(id);
    setBusyId(null);
    router.refresh();
  }

  async function onDelete(row: SuperAdminRestaurant) {
    if (!window.confirm(`${t.deleteTenantConfirm} (${row.name})`)) return;
    setBusyId(row.id);
    await deleteSuperAdminRestaurant(row.id);
    setBusyId(null);
    router.refresh();
  }

  async function onResetTokens(row: SuperAdminRestaurant) {
    if (!window.confirm(t.resetTokensConfirm.replace("{name}", row.name))) return;
    setBusyId(row.id);
    await resetSuperAdminAiUsage(row.id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <Kpi title={t.totalRestaurants} value={String(derivedKpis.totalRestaurants)} />
        <Kpi title={t.activeSubscribers} value={String(derivedKpis.activeSubscribers)} />
        <Kpi title={t.monthlyRevenue} value={formatGel(derivedKpis.mrr)} />
        <Kpi title={t.networkOrders} value={String(derivedKpis.totalOrders)} />
        <Kpi title={t.networkAiSpend} value={formatUsd(derivedKpis.aiCostUsd)} />
        <Kpi title={t.networkAiMonthly} value={`${formatUsdMonthly(derivedKpis.aiMonthlyUsd)} / ${t.aiPerMonth}`} />
        <Kpi title={t.networkAiAlerts} value={String(derivedKpis.aiAlertCount)} />
      </div>

      {alerted.length > 0 ? (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-medium">{t.aiAlertBanner}</p>
          <ul className="mt-2 space-y-1">
            {alerted.map((row) => (
              <li key={row.id} className="text-muted-foreground">
                {t.aiAlertToday
                  .replace("{name}", row.name)
                  .replace("{used}", formatTokenCount(row.ai_tokens_today ?? 0))
                  .replace(
                    "{limit}",
                    row.ai_daily_token_limit
                      ? formatTokenCount(row.ai_daily_token_limit)
                      : t.aiCapUnlimited,
                  )}
                {" · "}
                {t.aiAlertWeek
                  .replace("{name}", row.name)
                  .replace("{used}", formatTokenCount(row.ai_tokens_week ?? 0))
                  .replace(
                    "{limit}",
                    row.ai_weekly_token_limit
                      ? formatTokenCount(row.ai_weekly_token_limit)
                      : t.aiCapUnlimited,
                  )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <HourlyUsageChart hourly={hourly} />

      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          {t.addRestaurant}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-secondary/30">
        <table className="w-full min-w-280 text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-xs tracking-wide uppercase">
              <th className="px-4 py-3 font-medium">{t.restaurantName}</th>
              <th className="px-4 py-3 font-medium">{t.aiPlan}</th>
              <th className="px-4 py-3 font-medium">{t.tenantOwner}</th>
              <th className="px-4 py-3 font-medium">{t.subscriptionStatus}</th>
              <th className="px-4 py-3 font-medium">{t.geminiTokenUsage}</th>
              <th className="px-4 py-3 font-medium">{t.tenantAiCost}</th>
              <th className="px-4 py-3 font-medium">{t.resetTokens}</th>
              <th className="px-4 py-3 font-medium">{t.tenantManage}</th>
            </tr>
          </thead>
          <tbody>
            {restaurants.length === 0 ? (
              <tr>
                <td className="text-muted-foreground px-4 py-8" colSpan={8}>
                  {t.noTenants}
                </td>
              </tr>
            ) : (
              restaurants.map((row) => {
                const slug = restaurantPublicKey(row);
                const expired =
                  row.valid_until && new Date(row.valid_until).getTime() < Date.now();
                const rowTone =
                  row.ai_alert === "over"
                    ? "border-t border-secondary/20 bg-destructive/5"
                    : row.ai_alert === "warn"
                      ? "border-t border-secondary/20 bg-amber-500/5"
                      : "border-t border-secondary/20";
                return (
                  <tr key={row.id} className={rowTone}>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold leading-tight">{row.name}</div>
                      <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                        {row.slug ?? "—"}
                      </p>
                      <p className="text-muted-foreground mt-2 text-[11px] tabular-nums">
                        {t.tenantOrderCount.replace(
                          "{count}",
                          String(row.order_count ?? 0),
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <AiPlanBadge plan={row.ai_plan} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="max-w-48 truncate">{row.manager_email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge
                        status={row.subscription_status}
                        expired={Boolean(expired)}
                      />
                      <p className="text-muted-foreground mt-2 text-[11px] tabular-nums">
                        {formatGel(row.subscription_fee)}
                        {row.valid_until
                          ? ` · ${new Date(row.valid_until).toLocaleDateString()}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <GeminiUsageCell restaurant={row} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="min-w-32 space-y-1">
                        <div className="text-base font-semibold tabular-nums">
                          {formatUsd(row.ai_cost_usd ?? 0)}
                        </div>
                        <p className="text-muted-foreground text-[11px] tabular-nums">
                          {t.tenantAiMonthly}: {formatUsdMonthly(row.ai_monthly_projected_usd ?? 0)}
                          {` / ${t.aiPerMonth}`}
                        </p>
                        {(row.ai_heavy_monthly_usd ?? 0) >
                        (row.ai_monthly_projected_usd ?? 0) * 1.15 ? (
                          <p className="text-[11px] tabular-nums">
                            {t.tenantAiHeavyMonthly}:{" "}
                            {formatUsdMonthly(row.ai_heavy_monthly_usd ?? 0)}
                            {` / ${t.aiPerMonth}`}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="whitespace-nowrap"
                        disabled={busyId === row.id}
                        onClick={() => void onResetTokens(row)}
                      >
                        {t.resetTokens}
                      </Button>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex max-w-72 flex-col gap-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void onViewAs(row.id)}
                          >
                            {t.viewAsManager}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void onToggle(row.id)}
                          >
                            {row.subscription_status === "active"
                              ? t.suspendTenant
                              : t.activateTenant}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <a
                            href={`/menu/${slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {t.openMenu}
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(row)}
                          >
                            {t.editTenant}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.id}
                            onClick={() => void onDelete(row)}
                          >
                            {t.deleteTenant}
                          </Button>
                        </div>
                        <CopyLinkField url={adminLoginUrl(slug)} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {getPublicAppUrl()}/menu/[slug]
      </p>

      <TenantDialog
        open={createOpen}
        title={t.addRestaurant}
        restaurant={null}
        onOpenChange={setCreateOpen}
        onSaved={(created) => {
          setCreateOpen(false);
          if (created) setOnboarded(created);
          router.refresh();
        }}
      />
      <TenantDialog
        open={Boolean(editing)}
        title={t.editTenant}
        restaurant={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
      <OnboardSuccessDialog
        tenant={onboarded}
        onOpenChange={(open) => {
          if (!open) setOnboarded(null);
        }}
      />
    </div>
  );
}

function AiPlanBadge({ plan }: { plan: SuperAdminRestaurant["ai_plan"] }) {
  const { t } = useAdminLocale();
  const paid = plan === "paid";
  return (
    <Badge variant={paid ? "default" : "outline"} className="font-medium">
      {paid ? t.aiPlanPaid : t.aiPlanFree}
    </Badge>
  );
}

function usagePercent(used: number, limit: number | null | undefined) {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, used) / limit) * 100));
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null | undefined;
}) {
  const { t } = useAdminLocale();
  const percent = usagePercent(used, limit);
  const tone =
    percent >= 100
      ? "bg-destructive"
      : percent >= 80
        ? "bg-amber-500"
        : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center justify-between gap-3 text-[11px]">
        <span>{label}</span>
        <span className="tabular-nums">
          {formatCap(used, limit, t.aiCapUnlimited)}
        </span>
      </div>
      {limit ? (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${tone}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function GeminiUsageCell({ restaurant }: { restaurant: SuperAdminRestaurant }) {
  const { t } = useAdminLocale();
  const topModel = (restaurant.ai_models ?? []).find(
    (model) => (model.provider || "gemini") !== "openai",
  );
  return (
    <div className="min-w-56 max-w-72 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold tabular-nums">
          {formatTokenCount(restaurant.ai_total_tokens ?? 0)}
        </span>
        <Badge variant="secondary" className="shrink-0">
          Gemini
        </Badge>
      </div>
      <UsageMeter
        label={t.aiUsageTodayShort}
        used={restaurant.ai_tokens_today ?? 0}
        limit={restaurant.ai_daily_token_limit}
      />
      <UsageMeter
        label={t.aiUsageWeekShort}
        used={restaurant.ai_tokens_week ?? 0}
        limit={restaurant.ai_weekly_token_limit}
      />
      {topModel ? (
        <p className="text-muted-foreground truncate font-mono text-[11px]">
          {topModel.model}
        </p>
      ) : null}
    </div>
  );
}

function HourlyUsageChart({ hourly }: { hourly: SuperAdminHourlyBucket[] }) {
  const { t } = useAdminLocale();
  const [mode, setMode] = useState<"chat" | "all">("chat");
  const buckets = useMemo(() => {
    const filled = Array.from({ length: 24 }, (_, hour) => {
      const found = hourly.find((row) => row.hour === hour);
      return (
        found ?? {
          hour,
          chatCalls: 0,
          allCalls: 0,
          chatTokens: 0,
          totalTokens: 0,
        }
      );
    });
    return filled;
  }, [hourly]);
  const values = buckets.map((row) =>
    mode === "chat" ? row.chatCalls : row.allCalls,
  );
  const peak = Math.max(0, ...values);
  const hasUsage = buckets.some((row) => row.allCalls > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t.aiUsageChart}</CardTitle>
          <p className="text-muted-foreground text-xs">{t.aiUsageChartHint}</p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "chat" ? "default" : "outline"}
            onClick={() => setMode("chat")}
          >
            {t.aiUsageChatOnly}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "all" ? "default" : "outline"}
            onClick={() => setMode("all")}
          >
            {t.aiUsageAllFeatures}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasUsage ? (
          <p className="text-muted-foreground text-sm">{t.aiNoUsageYet}</p>
        ) : (
          <div className="flex h-36 items-end gap-1">
            {buckets.map((row, index) => {
              const value = values[index] ?? 0;
              const height = peak ? Math.max(value > 0 ? 6 : 0, (value / peak) * 100) : 0;
              const tokens = mode === "chat" ? row.chatTokens : row.totalTokens;
              return (
                <div
                  key={row.hour}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${String(row.hour).padStart(2, "0")}:00 · ${value} · ${formatTokenCount(tokens)}`}
                >
                  <div
                    className="bg-primary w-full rounded-sm"
                    style={{ height: `${height}%` }}
                  />
                  {row.hour % 3 === 0 ? (
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {row.hour}
                    </span>
                  ) : (
                    <span className="h-3" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
  expired,
}: {
  status: SubscriptionStatus;
  expired: boolean;
}) {
  const { t } = useAdminLocale();
  const label =
    status === "active"
      ? t.statusActive
      : status === "trial"
        ? t.statusTrial
        : t.statusSuspended;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge
        variant={
          status === "suspended"
            ? "destructive"
            : status === "trial"
              ? "outline"
              : "default"
        }
      >
        {label}
      </Badge>
      {expired ? <Badge variant="outline">{t.expired}</Badge> : null}
    </span>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-primary text-2xl font-semibold tabular-nums">
        {value}
      </CardContent>
    </Card>
  );
}

function TenantDialog({
  open,
  title,
  restaurant,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  title: string;
  restaurant: SuperAdminRestaurant | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (created?: {
    name: string;
    slug: string;
    manager_email: string | null;
  }) => void;
}) {
  const { t } = useAdminLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(restaurant?.name ?? "");
  const [slug, setSlug] = useState(restaurant?.slug ?? "");
  const [email, setEmail] = useState(restaurant?.manager_email ?? "");
  const [fee, setFee] = useState(String(restaurant?.subscription_fee ?? "49"));
  const [serviceFeePercent, setServiceFeePercent] = useState(
    String(restaurant?.service_fee_percent ?? 0),
  );
  const [googleMapsUrl, setGoogleMapsUrl] = useState(
    restaurant?.google_maps_review_url ?? restaurant?.google_review_url ?? "",
  );
  const [aiPlan, setAiPlan] = useState<SuperAdminRestaurant["ai_plan"]>(
    restaurant?.ai_plan ?? "free",
  );
  const [dailyLimit, setDailyLimit] = useState(
    restaurant
      ? restaurant.ai_daily_token_limit == null
        ? ""
        : String(restaurant.ai_daily_token_limit)
      : "50000",
  );
  const [weeklyLimit, setWeeklyLimit] = useState(
    restaurant
      ? restaurant.ai_weekly_token_limit == null
        ? ""
        : String(restaurant.ai_weekly_token_limit)
      : "350000",
  );
  const [status, setStatus] = useState<SubscriptionStatus>(
    restaurant?.subscription_status ?? "trial",
  );
  const [validUntil, setValidUntil] = useState(
    toDatetimeLocal(restaurant?.valid_until ?? null),
  );
  const initialBrand = useMemo(() => resolvedBrand(restaurant), [restaurant]);
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
  const [logoUrl, setLogoUrl] = useState(restaurantLogo(restaurant ?? {}) ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const isEdit = Boolean(restaurant);

  useEffect(() => {
    if (!open) return;
    const resolved = resolvedBrand(restaurant);
    setName(restaurant?.name ?? "");
    setSlug(restaurant?.slug ?? "");
    setEmail(restaurant?.manager_email ?? "");
    setFee(String(restaurant?.subscription_fee ?? "49"));
    setServiceFeePercent(String(restaurant?.service_fee_percent ?? 0));
    setGoogleMapsUrl(
      restaurant?.google_maps_review_url ?? restaurant?.google_review_url ?? "",
    );
    setStatus(restaurant?.subscription_status ?? "trial");
    setAiPlan(restaurant?.ai_plan ?? "free");
    setDailyLimit(
      restaurant
        ? restaurant.ai_daily_token_limit == null
          ? ""
          : String(restaurant.ai_daily_token_limit)
        : "50000",
    );
    setWeeklyLimit(
      restaurant
        ? restaurant.ai_weekly_token_limit == null
          ? ""
          : String(restaurant.ai_weekly_token_limit)
        : "350000",
    );
    setValidUntil(toDatetimeLocal(restaurant?.valid_until ?? null));
    setPrimary(resolved.primary);
    setSecondary(resolved.secondary);
    setBg(resolved.background);
    setTextColor(resolved.foreground);
    setMutedTextColor(resolved.mutedForeground);
    setPrimaryTextColor(resolved.onPrimary);
    setSecondaryTextColor(resolved.onSecondary);
    setPriceColor(resolved.priceColor);
    setCardColor(resolved.card);
    setBorderColor(resolved.border);
    setLogoUrl(restaurantLogo(restaurant ?? {}) ?? "");
    setLogoPreview(null);
    setError(null);
  }, [open, restaurant]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const previewVars = useMemo(
    () =>
      brandCssVars({
        id: restaurant?.id ?? "preview",
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
      }) as CSSProperties,
    [
      restaurant?.id,
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

  const previewLogo = logoPreview || logoUrl;
  const previewSlug = slugifyRestaurant(slug || name) || "machakhela";

  function onNameChange(next: string) {
    const previousAuto = slugifyRestaurant(name);
    setName(next);
    if (!isEdit && (!slug || slug === previousAuto)) {
      setSlug(slugifyRestaurant(next));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    if (restaurant) form.set("id", restaurant.id);
    form.set("name", name);
    form.set("slug", slugifyRestaurant(slug || name));
    form.set("manager_email", email);
    form.set("subscription_fee", fee);
    form.set("service_fee_percent", serviceFeePercent);
    form.set("google_maps_review_url", googleMapsUrl);
    form.set("google_review_url", googleMapsUrl);
    form.set("subscription_status", status);
    form.set("ai_plan", aiPlan);
    form.set("ai_daily_token_limit", dailyLimit);
    form.set("ai_weekly_token_limit", weeklyLimit);
    form.set("valid_until", validUntil);
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
    form.set("logo_url", logoUrl);
    const result = restaurant
      ? await updateSuperAdminRestaurant(form)
      : await createSuperAdminRestaurant(form);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!restaurant) {
      onSaved({
        name,
        slug: slugifyRestaurant(slug || name),
        manager_email: email.trim() || null,
      });
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t.superAdminFormHint}</DialogDescription>
          </DialogHeader>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t.tenantBasics}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.tenantName}>
                <Input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.slug}>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t.slugExample}
                />
              </Field>
              <Field label={t.managerEmail}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.serviceFeePercent}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={serviceFeePercent}
                  onChange={(e) => setServiceFeePercent(e.target.value)}
                  placeholder="10"
                />
              </Field>
              <Field label={t.googleReviewUrl}>
                <Input
                  type="url"
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  placeholder={t.googleReviewPlaceholder}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t.tenantVisuals}</h3>
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
            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorField
                    label={t.primaryVar}
                    value={primary}
                    onChange={setPrimary}
                  />
                  <ColorField
                    label={t.secondaryVar}
                    value={secondary}
                    onChange={setSecondary}
                  />
                  <ColorField label={t.bgVar} value={bg} onChange={setBg} />
                  <Field label={t.logo}>
                    <Input
                      name="logo"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (logoPreview) URL.revokeObjectURL(logoPreview);
                        setLogoPreview(file ? URL.createObjectURL(file) : null);
                      }}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t.logoUrl}>
                      <Input
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://"
                      />
                    </Field>
                  </div>
                </div>
                <div className="border-border/60 space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-semibold">{t.wordColorsSection}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField
                      label={t.textColor}
                      value={textColor}
                      onChange={setTextColor}
                    />
                    <ColorField
                      label={t.mutedTextColor}
                      value={mutedTextColor}
                      onChange={setMutedTextColor}
                    />
                    <ColorField
                      label={t.priceColor}
                      value={priceColor}
                      onChange={setPriceColor}
                    />
                    <ColorField
                      label={t.primaryTextColor}
                      value={primaryTextColor}
                      onChange={setPrimaryTextColor}
                    />
                    <ColorField
                      label={t.secondaryTextColor}
                      value={secondaryTextColor}
                      onChange={setSecondaryTextColor}
                    />
                  </div>
                </div>
                <div className="border-border/60 space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-semibold">{t.surfaceColorsSection}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField
                      label={t.cardColor}
                      value={cardColor}
                      onChange={setCardColor}
                    />
                    <ColorField
                      label={t.borderColor}
                      value={borderColor}
                      onChange={setBorderColor}
                    />
                  </div>
                </div>
              </div>
              <aside
                className="space-y-3 rounded-xl border p-4"
                style={{
                  ...previewVars,
                  backgroundColor: bg,
                  color: textColor,
                  borderColor,
                }}
              >
                <p
                  className="text-xs uppercase tracking-wide"
                  style={{ color: mutedTextColor }}
                >
                  {t.preview}
                </p>
                <div className="flex items-center gap-3">
                  {previewLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewLogo}
                      alt=""
                      className="size-12 rounded-full object-cover ring-1 ring-foreground/10"
                    />
                  ) : (
                    <div
                      className="flex size-12 items-center justify-center rounded-full text-lg font-semibold"
                      style={{ backgroundColor: cardColor, color: textColor }}
                    >
                      {(name || "R").slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="truncate font-semibold"
                      style={{ color: textColor }}
                    >
                      {name || t.tenantName}
                    </p>
                    <p
                      className="truncate text-xs"
                      style={{ color: mutedTextColor }}
                    >
                      /menu/{previewSlug}
                    </p>
                  </div>
                </div>
                <div
                  className="space-y-2 rounded-lg border p-2.5"
                  style={{ backgroundColor: cardColor, borderColor }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-xs font-semibold"
                      style={{ color: textColor }}
                    >
                      {t.previewSampleDish}
                    </span>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: priceColor }}
                    >
                      ₾24.00
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: mutedTextColor }}>
                    {t.previewSampleDesc}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: primary, color: primaryTextColor }}
                    >
                      Primary
                    </span>
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: secondary,
                        color: secondaryTextColor,
                      }}
                    >
                      Secondary
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t.tenantSubscription}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.monthlyFee}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </Field>
              <Field label={t.subscriptionStatus}>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as SubscriptionStatus)
                  }
                  className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="active">{t.statusActive}</option>
                  <option value="trial">{t.statusTrial}</option>
                  <option value="suspended">{t.statusSuspended}</option>
                </select>
              </Field>
              <Field label={t.expirationDate}>
                <Input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t.tenantAiOps}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.aiPlan}>
                <select
                  value={aiPlan}
                  onChange={(e) =>
                    setAiPlan(e.target.value === "paid" ? "paid" : "free")
                  }
                  className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="free">{t.aiPlanFree}</option>
                  <option value="paid">{t.aiPlanPaid}</option>
                </select>
              </Field>
              <Field label={t.aiDailyTokenLimit}>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder={t.aiCapUnlimited}
                />
              </Field>
              <Field label={t.aiWeeklyTokenLimit}>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={weeklyLimit}
                  onChange={(e) => setWeeklyLimit(e.target.value)}
                  placeholder={t.aiCapUnlimited}
                />
              </Field>
            </div>
            <p className="text-muted-foreground text-xs">{t.aiTokenLimitHint}</p>
          </section>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : isEdit ? t.saveSettings : t.addRestaurant}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {htmlFor ? (
        <>
          <Label htmlFor={htmlFor}>{label}</Label>
          {children}
        </>
      ) : (
        <Label className="flex-col items-stretch gap-1">
          <span>{label}</span>
          {children}
        </Label>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const pickerValue = normalizeHex(value, "#000000");
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          key={pickerValue}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="border-input h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input bg-transparent h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
    </Field>
  );
}

function CopyLinkField({
  url,
  label,
}: {
  url: string;
  label?: string;
}) {
  const { t } = useAdminLocale();
  const [copied, setCopied] = useState(false);
  const fieldId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1">
      {label ? <Label htmlFor={fieldId}>{label}</Label> : null}
      <div className="flex gap-2">
        <Input id={fieldId} readOnly value={url} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          onClick={() => void copy()}
        >
          {copied ? `✓ ${t.linkCopied}` : t.copyLink}
        </Button>
      </div>
    </div>
  );
}

function OnboardSuccessDialog({
  tenant,
  onOpenChange,
}: {
  tenant: { name: string; slug: string; manager_email: string | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAdminLocale();
  if (!tenant) return null;

  return (
    <Dialog open={Boolean(tenant)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.onboardSuccess}</DialogTitle>
          <DialogDescription>
            {tenant.name}
            {tenant.manager_email ? ` · ${tenant.manager_email}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <CopyLinkField label={t.menuLink} url={publicMenuUrl(tenant.slug)} />
          <CopyLinkField
            label={t.adminLoginLink}
            url={adminLoginUrl(tenant.slug)}
          />
          <p className="text-muted-foreground text-sm">{t.sendToOwner}</p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t.saved}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
