import { generateDailyDigest, isEmptySalesMetrics, parseAdminInsightLocale } from "@/lib/ai/analytics";
import { loadTodayOverview } from "@/lib/admin-overview-load";
import { cachedInsight, digestCacheKey, storeInsight } from "@/lib/ai-insight-cache";
import { requireTenantApi } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;

  try {
    const data = await loadTodayOverview(tenant.restaurant.id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Overview failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;

  try {
    const body = (await request.json()) as { locale?: string; lane?: string };
    const locale = parseAdminInsightLocale(body.locale);
    const lane = body.lane === "bar" ? "bar" : "food";
    const data = await loadTodayOverview(tenant.restaurant.id);
    const slice = data[lane];
    if (isEmptySalesMetrics(slice)) {
      return NextResponse.json({ digest: null, empty: true });
    }
    const cacheKey = digestCacheKey(
      tenant.restaurant.id,
      locale,
      slice.revenue,
      slice.orderCount,
      lane,
    );
    const cached = cachedInsight<string>(cacheKey);
    const digest =
      cached ??
      (await generateDailyDigest(
        {
          revenue: slice.revenue,
          orderCount: slice.orderCount,
          waiterCallCount: slice.orderCount,
          popularDishes: slice.topToday,
          hoursLabel: data.hoursLabel,
          lane,
          hourly: slice.hourly,
          categories: slice.categories,
        },
        locale,
        tenant.restaurant.id,
      ));
    if (!cached) storeInsight(cacheKey, digest);
    return NextResponse.json({ digest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Digest failed" },
      { status: 500 },
    );
  }
}
