import { hashChefMenuCache } from "@/lib/chef-menu-cache-hash";
import {
  formatChefQaReport,
  runChefQaSuite,
  type ChefQaCheck,
} from "@/lib/chef-qa";
import {
  debugGeminiMenuCacheState,
  invalidateGeminiMenuCache,
  seedGeminiMenuCacheForTests,
} from "@/lib/gemini-menu-cache";
import { invalidateWaiterMenu } from "@/lib/ai-waiter-menu";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function diagnosticsAllowed() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.CHEF_DIAGNOSTICS === "1"
  );
}

/**
 * Dev/QA endpoint for the six-pillar chef suite + live cache invalidate probe.
 *
 * GET  → offline suite JSON (+ human report text)
 * POST → offline suite + in-process Gemini cache seed/invalidate checks
 *
 * Enable in non-dev with CHEF_DIAGNOSTICS=1.
 */
export async function GET() {
  if (!diagnosticsAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const report = runChefQaSuite();
  return NextResponse.json({
    ok: report.failed === 0,
    report,
    text: formatChefQaReport(report),
  });
}

export async function POST(request: Request) {
  if (!diagnosticsAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    restaurantId?: string;
  };
  const restaurantId =
    body.restaurantId?.trim() || "00000000-0000-4000-8000-000000000099";
  const locale = "ka";
  const model = "gemini-3.6-flash";
  const dishes = [
    {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01",
      name: "ლობიო",
      description: "შებოლილი",
      price: 12,
      is_available: true,
      ingredients: ["ლობიო"],
      allergens: [] as string[],
    },
  ];
  const hash = hashChefMenuCache({
    restaurantName: "QA",
    serviceFeePercent: 14,
    dishes,
  });

  const live: ChefQaCheck[] = [];
  seedGeminiMenuCacheForTests({
    restaurantId,
    locale,
    model,
    hash,
    name: `test-caches/${restaurantId}`,
  });
  const before = debugGeminiMenuCacheState({
    restaurantId,
    locale,
    model,
    hash,
  });
  live.push({
    pillar: "cache_sync",
    id: "live-seed-peek",
    name: "Seeded cache peeks before invalidate",
    ok: Boolean(before.peek),
    detail: `peek=${before.peek ?? "null"} size=${before.size}`,
  });

  invalidateGeminiMenuCache(restaurantId);
  const afterGemini = debugGeminiMenuCacheState({
    restaurantId,
    locale,
    model,
    hash,
  });
  live.push({
    pillar: "cache_sync",
    id: "live-invalidate-gemini",
    name: "invalidateGeminiMenuCache clears peek",
    ok: afterGemini.peek == null,
    detail: `peek=${afterGemini.peek ?? "null"}`,
  });

  seedGeminiMenuCacheForTests({
    restaurantId,
    locale,
    model,
    hash,
    name: `test-caches/${restaurantId}-2`,
  });
  invalidateWaiterMenu(restaurantId);
  const afterWaiter = debugGeminiMenuCacheState({
    restaurantId,
    locale,
    model,
    hash,
  });
  live.push({
    pillar: "cache_sync",
    id: "live-invalidate-waiter",
    name: "invalidateWaiterMenu clears Gemini peek (admin path)",
    ok: afterWaiter.peek == null,
    detail: `peek=${afterWaiter.peek ?? "null"}`,
  });

  // Hash drift after admin-like description edit
  const hash2 = hashChefMenuCache({
    restaurantName: "QA",
    serviceFeePercent: 14,
    dishes: dishes.map((d) => ({ ...d, description: "ახალი ტექსტი" })),
  });
  live.push({
    pillar: "cache_sync",
    id: "live-hash-desc",
    name: "Description change produces new hash (stale cache miss)",
    ok: hash !== hash2,
    detail: `${hash.slice(0, 8)}… → ${hash2.slice(0, 8)}…`,
  });

  const report = runChefQaSuite();
  const merged = {
    ...report,
    total: report.total + live.length,
    passed: report.passed + live.filter((c) => c.ok).length,
    failed: report.failed + live.filter((c) => !c.ok).length,
    checks: [...report.checks, ...live],
  };

  return NextResponse.json({
    ok: merged.failed === 0,
    report: merged,
    text: formatChefQaReport(merged),
    liveCache: {
      restaurantId,
      hash,
      hashAfterDescEdit: hash2,
    },
  });
}
