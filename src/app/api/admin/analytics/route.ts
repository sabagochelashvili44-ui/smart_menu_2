import { generateAnalyticsInsights, isEmptySalesMetrics, parseAdminInsightLocale } from "@/lib/ai/analytics";
import {
  analyticsLookbackStart,
  loadRestaurantAnalyticsContext,
  loadSalesObservationCycle,
  loadSalesSummary,
  snapshotForWindow,
} from "@/lib/admin-analytics-load";
import {
  cachedInsight,
  insightsCacheKey,
  storeInsight,
} from "@/lib/ai-insight-cache";
import {
  comparisonRange,
  percentChange,
  resolveAnalyticsWindow,
} from "@/lib/analytics-range";
import { loadOpsAnalytics } from "@/lib/ops-analytics-load";
import { computeHourlyAcknowledgedOrders } from "@/lib/overview-ops";
import { requireTenantApi } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

async function loadRangedAnalytics(
  restaurantId: string,
  range?: string | null,
  fromParam?: string | null,
  toParam?: string | null,
) {
  const window = resolveAnalyticsWindow({
    range,
    from: fromParam,
    to: toParam,
  });
  const previous = comparisonRange(window);

  const context = await loadRestaurantAnalyticsContext(restaurantId, {
    from: analyticsLookbackStart(window.from, previous.from).toISOString(),
    to: window.to.toISOString(),
    includeOpen: true,
  });

  const snapshot = snapshotForWindow(context, window.from, window.to);
  const previousSnapshot = snapshotForWindow(
    context,
    previous.from,
    previous.to,
  );
  const peakHours = computeHourlyAcknowledgedOrders(
    context.waiterCalls,
    window.from,
    window.to,
  );
  let ops = null;
  try {
    ops = await loadOpsAnalytics({
      restaurantId,
      from: window.from,
      to: window.to,
      events: context.intentEvents,
      calls: context.waiterCalls,
      dishes: context.dishes,
      peakHours: peakHours.filter((hour) => hour.isPeak).map((hour) => hour.hour),
    });
  } catch {
    ops = null;
  }

  return {
    ...snapshot,
    window: window.preset,
    windowDays: window.days,
    windowFrom: window.from.toISOString(),
    windowTo: window.to.toISOString(),
    windowFromYmd: window.fromYmd,
    windowToYmd: window.toYmd,
    peakHours,
    ops,
    previous: {
      revenue: previousSnapshot.revenue,
      orderCount: previousSnapshot.orderCount,
      aov: previousSnapshot.aov,
      waiterCallCount: previousSnapshot.waiterCallCount,
      estimatedProfit: previousSnapshot.estimatedProfit,
      lostRevenue: previousSnapshot.lostRevenue,
      orderConversionRate: previousSnapshot.orderConversionRate,
    },
    comparison: {
      revenue: percentChange(snapshot.revenue, previousSnapshot.revenue),
      orderCount: percentChange(
        snapshot.orderCount,
        previousSnapshot.orderCount,
      ),
      aov: percentChange(snapshot.aov, previousSnapshot.aov),
      waiterCallCount: percentChange(
        snapshot.waiterCallCount,
        previousSnapshot.waiterCallCount,
      ),
    },
    ...(await loadSalesObservationCycle(restaurantId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (!/does not exist|schema cache|could not find the/i.test(message)) {
        throw error;
      }
      return {
        observationReady: false,
        observationDaysElapsed: 0,
        firstAcknowledgedAt: null,
      };
    })),
  };
}

function rangeFromRequest(request: Request) {
  const url = new URL(request.url);
  return {
    range: url.searchParams.get("range"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  };
}

export async function GET(request: Request) {
  const tenant = await requireTenantApi(["owner"]);
  if (!tenant.ok) return tenant.response;

  try {
    const { range, from, to } = rangeFromRequest(request);
    const data = await loadSalesSummary(tenant.restaurant.id, range, from, to);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const tenant = await requireTenantApi(["owner"]);
  if (!tenant.ok) return tenant.response;

  const body = (await request.json()) as {
    locale?: string;
    range?: string;
    from?: string;
    to?: string;
    refresh?: boolean;
  };
  const locale = parseAdminInsightLocale(body.locale);
  const query = rangeFromRequest(request);

  try {
    const snapshot = await loadRangedAnalytics(
      tenant.restaurant.id,
      body.range ?? query.range,
      body.from ?? query.from,
      body.to ?? query.to,
    );
    if (isEmptySalesMetrics(snapshot)) {
      return NextResponse.json({ insights: null, empty: true });
    }
    const cacheKey = insightsCacheKey(
      tenant.restaurant.id,
      locale,
      snapshot.window,
      snapshot.windowFrom,
      snapshot.windowTo,
      snapshot.revenue,
      snapshot.orderCount,
    );
    const cached = body.refresh
      ? null
      : cachedInsight<Awaited<ReturnType<typeof generateAnalyticsInsights>>>(
          cacheKey,
        );
    const insights =
      cached ??
      (await generateAnalyticsInsights(
        snapshot,
        locale,
        tenant.restaurant.id,
      ));
    if (!cached) storeInsight(cacheKey, insights);
    return NextResponse.json({
      insights,
      observationReady: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI insights failed",
      },
      { status: 500 },
    );
  }
}
