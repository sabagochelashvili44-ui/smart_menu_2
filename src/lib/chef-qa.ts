/**
 * Six-pillar Chef Assistant + Super-Admin QA suite.
 * Pure/local where possible — no Gemini spend. Server diagnostics extend
 * pillar 2 (live cache invalidate) via /api/dev/chef-diagnostics.
 */
import {
  buildCacheableChefSystemPrompt,
  buildChefTurnPrompt,
  pickFocusedDishes,
  type AssistantDish,
} from "@/lib/ai-assistant";
import {
  CHEF_SLOW_RESPONSE_MS,
  hashChefMenuCache,
} from "@/lib/chef-menu-cache-hash";
import {
  buildLocalChefFactReply,
  buildLocalChefRecommendReply,
  matchNamedDishForFact,
} from "@/lib/chef-local-facts";
import {
  chefReplyLooksLeaked,
  isAcceptableChefReply,
  parseChefReply,
  routeChefModel,
  scrubChefInstructionLeak,
  visibleChefText,
} from "@/lib/chat-suggestions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ChefQaPillar =
  | "db_facts"
  | "cache_sync"
  | "latency"
  | "fallback"
  | "routing"
  | "language";

export type ChefQaCheck = {
  pillar: ChefQaPillar;
  id: string;
  name: string;
  ok: boolean;
  detail?: string;
  duration_ms?: number;
};

export type ChefQaReport = {
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  checks: ChefQaCheck[];
};

const ID = {
  lobio: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01",
  salad: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02",
  khachapuri: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03",
  mtsvadi: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04",
  wine: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05",
};

function fixtureMenu(): AssistantDish[] {
  return [
    {
      id: ID.lobio,
      name: "ლობიო",
      name_en: "Lobio",
      name_ru: "Лобио",
      description: "შებოლილი ლობიო",
      price: 12,
      category: "ცხელი",
      ingredients: ["ლობიო", "ქინძი"],
      allergens: [],
      is_available: true,
      calories: 220,
      protein: 12,
      carbs: 28,
      fat: 6,
      prep_minutes: 15,
    },
    {
      id: ID.salad,
      name: "ბოსტნეულის სალათი",
      name_en: "Vegetable salad",
      description: "პომიდორი და კიტრი",
      price: 10,
      category: "სალათები",
      ingredients: ["პომიდორი", "კიტრი"],
      allergens: [],
      is_available: true,
      calories: 90,
      protein: 2,
      carbs: 8,
      fat: 6,
    },
    {
      id: ID.khachapuri,
      name: "იმერული ხაჭაპური",
      name_en: "Imeretian khachapuri",
      description: "ყველით",
      price: 16,
      category: "ცომეული",
      ingredients: ["ფქვილი", "ყველი"],
      allergens: ["gluten", "dairy"],
      is_available: true,
    },
    {
      id: ID.mtsvadi,
      name: "მწვადი ღორის",
      name_en: "Pork mtsvadi",
      price: 28,
      category: "მწვადი",
      ingredients: ["ღორის ხორცი"],
      allergens: [],
      is_available: true,
    },
    {
      id: ID.wine,
      name: "საფერავი",
      name_en: "Saperavi",
      price: 45,
      glass_price: 12,
      bottle_price: 45,
      category: "ღვინო",
      ingredients: ["ყურძენი"],
      allergens: [],
      is_available: true,
    },
  ];
}

function check(
  pillar: ChefQaPillar,
  id: string,
  name: string,
  ok: boolean,
  detail?: string,
  duration_ms?: number,
): ChefQaCheck {
  return { pillar, id, name, ok, detail, duration_ms };
}

function readSrc(rel: string) {
  return readFileSync(resolve(rel), "utf8");
}

function pillarDbFacts(menu: AssistantDish[]): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const cases: Array<{
    id: string;
    message: string;
    locale: "ka" | "en" | "ru";
    expectId: string;
    must: RegExp;
  }> = [
    {
      id: "price-ka",
      message: "რა ღირს ლობიო?",
      locale: "ka",
      expectId: ID.lobio,
      must: /12/,
    },
    {
      id: "price-en",
      message: "how much is Lobio?",
      locale: "en",
      expectId: ID.lobio,
      must: /12/,
    },
    {
      id: "ing-ka",
      message: "ლობიოს ინგრედიენტები?",
      locale: "ka",
      expectId: ID.lobio,
      must: /ლობიო|ქინძი/,
    },
    {
      id: "all-ka",
      message: "ხაჭაპურის ალერგენები?",
      locale: "ka",
      expectId: ID.khachapuri,
      must: /გლუტენ|რძ|dairy|gluten/i,
    },
    {
      id: "macros-ka",
      message: "რამდენი კალორიაა ლობიოში?",
      locale: "ka",
      expectId: ID.lobio,
      must: /220/,
    },
    {
      id: "prep-ka",
      message: "ლობიო რამდენ ხანში მზადდება?",
      locale: "ka",
      expectId: ID.lobio,
      must: /15/,
    },
    {
      id: "avail-ka",
      message: "არის თუ არა ლობიო?",
      locale: "ka",
      expectId: ID.lobio,
      must: /ხელმისაწვდომ|დიახ/,
    },
  ];

  for (const c of cases) {
    const t0 = Date.now();
    const reply = buildLocalChefFactReply({
      message: c.message,
      dishes: menu,
      locale: c.locale,
      serviceFeePercent: 14,
    });
    const duration_ms = Date.now() - t0;
    const parsed = reply ? parseChefReply(reply) : null;
    const ok = Boolean(
      reply &&
        parsed &&
        parsed.ids[0] === c.expectId &&
        c.must.test(parsed.spoken) &&
        !/Do NOT|CART &|_DISH_/i.test(parsed.spoken),
    );
    out.push(
      check(
        "db_facts",
        c.id,
        `DB fact: ${c.message}`,
        ok,
        ok
          ? `local_fact ${duration_ms}ms id=${c.expectId}`
          : `missing/wrong reply: ${reply?.slice(0, 120) ?? "null"}`,
        duration_ms,
      ),
    );
  }

  const offMenuMsgs = [
    "რა ღირს უნიკორნის პიცა?",
    "how much is dragon stew?",
    "ინგრედიენტები მარსის სუპისა",
  ];
  for (const [i, message] of offMenuMsgs.entries()) {
    const reply = buildLocalChefFactReply({
      message,
      dishes: menu,
      locale: "ka",
    });
    const match = matchNamedDishForFact(menu, message);
    out.push(
      check(
        "db_facts",
        `offmenu-${i + 1}`,
        `Refuse unknown: ${message}`,
        reply == null && match == null,
        reply == null
          ? "no local hallucination"
          : `unexpected local reply: ${reply.slice(0, 80)}`,
      ),
    );
  }

  // Price must equal printed menu — anti-hallucination
  const priceReply = buildLocalChefFactReply({
    message: "რა ღირს ლობიო?",
    dishes: menu,
    locale: "ka",
  });
  out.push(
    check(
      "db_facts",
      "price-exact",
      "Price equals DB/context value 12",
      Boolean(priceReply && /12(?:\.00)?/.test(priceReply) && !/99|1000/.test(priceReply)),
      priceReply?.slice(0, 100),
    ),
  );

  return out;
}

function pillarCacheSync(menu: AssistantDish[]): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const base = {
    restaurantName: "ქართლი",
    serviceFeePercent: 14,
    dishes: menu,
  };
  const h0 = hashChefMenuCache(base);

  const priceChanged = hashChefMenuCache({
    ...base,
    dishes: menu.map((d) =>
      d.id === ID.lobio ? { ...d, price: 99 } : d,
    ),
  });
  out.push(
    check(
      "cache_sync",
      "hash-price",
      "Price edit changes cache hash",
      h0 !== priceChanged,
      `h0=${h0.slice(0, 8)}… h1=${priceChanged.slice(0, 8)}…`,
    ),
  );

  const descChanged = hashChefMenuCache({
    ...base,
    dishes: menu.map((d) =>
      d.id === ID.lobio
        ? { ...d, description: "ახალი აღწერა ადმინიდან" }
        : d,
    ),
  });
  out.push(
    check(
      "cache_sync",
      "hash-desc",
      "Description edit changes cache hash",
      h0 !== descChanged,
      `changed=${h0 !== descChanged}`,
    ),
  );

  const soldOut = hashChefMenuCache({
    ...base,
    dishes: menu.map((d) =>
      d.id === ID.lobio ? { ...d, is_available: false } : d,
    ),
  });
  out.push(
    check(
      "cache_sync",
      "hash-86",
      "86/sold-out changes cache hash",
      h0 !== soldOut,
      `changed=${h0 !== soldOut}`,
    ),
  );

  const allergenChanged = hashChefMenuCache({
    ...base,
    dishes: menu.map((d) =>
      d.id === ID.lobio ? { ...d, allergens: ["nuts"] } : d,
    ),
  });
  out.push(
    check(
      "cache_sync",
      "hash-allergens",
      "Allergen edit changes cache hash",
      h0 !== allergenChanged,
    ),
  );

  const menuSrc = readSrc("src/lib/ai-waiter-menu.ts");
  const actionsSrc = readSrc("src/app/admin/actions.ts");
  const cacheSrc = readSrc("src/lib/gemini-menu-cache.ts");

  out.push(
    check(
      "cache_sync",
      "invalidate-wire",
      "invalidateWaiterMenu clears Gemini + translate caches",
      menuSrc.includes("invalidateGeminiMenuCache") &&
        menuSrc.includes("invalidateMenuTranslateCache") &&
        menuSrc.includes("revalidateTag"),
    ),
  );

  const invalidateCalls = (actionsSrc.match(/invalidateWaiterMenu\(/g) ?? [])
    .length;
  out.push(
    check(
      "cache_sync",
      "admin-hooks",
      "Super-Admin dish mutations call invalidateWaiterMenu",
      invalidateCalls >= 4,
      `calls=${invalidateCalls}`,
    ),
  );

  out.push(
    check(
      "cache_sync",
      "ttl-safety",
      "Gemini cache TTL safety-net is 4h",
      cacheSrc.includes("GEMINI_MENU_CACHE_TTL_SECONDS = 14_400"),
    ),
  );

  out.push(
    check(
      "cache_sync",
      "invalidate-fn",
      "invalidateGeminiMenuCache deletes memory + remote",
      cacheSrc.includes("export function invalidateGeminiMenuCache") &&
        cacheSrc.includes("deleteRemoteCache"),
    ),
  );

  out.push(
    check(
      "cache_sync",
      "free-tier-circuit-break",
      "Remote menu cache creation circuit-breaks on FreeTier exhaustion",
      cacheSrc.includes("disableRemoteCacheCreates") &&
        cacheSrc.includes("cacheCreateBlocked") &&
        cacheSrc.includes("FreeTier"),
    ),
  );

  return out;
}

function pillarLatency(menu: AssistantDish[]): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    buildLocalChefFactReply({
      message: "რა ღირს ლობიო?",
      dishes: menu,
      locale: "ka",
      serviceFeePercent: 14,
    });
    samples.push(performance.now() - t0);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const max = Math.max(...samples);
  out.push(
    check(
      "latency",
      "local-fact-avg",
      "Local DB fact avg < 25ms",
      avg < 25,
      `avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms n=20`,
      Math.round(avg),
    ),
  );
  out.push(
    check(
      "latency",
      "local-fact-max",
      "Local DB fact max < 100ms",
      max < 100,
      `max=${max.toFixed(2)}ms`,
      Math.round(max),
    ),
  );

  const tRec0 = performance.now();
  buildLocalChefRecommendReply({
    message: "მირჩიე სამარხვო ან ვეგეტარიანული კერძები",
    dishes: menu,
    locale: "ka",
  });
  const recMs = performance.now() - tRec0;
  out.push(
    check(
      "latency",
      "local-recommend",
      "Local veg recommend < 50ms",
      recMs < 50,
      `duration_ms=${recMs.toFixed(2)}`,
      Math.round(recMs),
    ),
  );

  const handlerSrc = readSrc("src/lib/ai-waiter-handler.ts");
  out.push(
    check(
      "latency",
      "timing-logger",
      "Handler logs [chef-timing] with duration_ms",
      handlerSrc.includes("[chef-timing]") &&
        handlerSrc.includes("duration_ms") &&
        handlerSrc.includes("logChefTiming"),
      `slow_threshold=${CHEF_SLOW_RESPONSE_MS}`,
    ),
  );
  out.push(
    check(
      "latency",
      "slow-warn",
      "Slow responses (>=8s) use chef-timing:slow",
      handlerSrc.includes("[chef-timing:slow]") &&
        handlerSrc.includes("CHEF_SLOW_RESPONSE_MS"),
    ),
  );
  out.push(
    check(
      "latency",
      "diag-meta",
      "Dev/diag SSE includes meta.duration_ms",
      handlerSrc.includes("chefDiagnosticsEnabled") &&
        handlerSrc.includes("meta:"),
    ),
  );

  return out;
}

function pillarFallback(): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const handlerSrc = readSrc("src/lib/ai-waiter-handler.ts");

  out.push(
    check(
      "fallback",
      "uncached-generate",
      "Generate always passes null cachedContent (no stale serve)",
      /completeChefReply\([\s\S]*?null,\s*maxOutputTokensForRoute/.test(
        handlerSrc,
      ),
    ),
  );
  out.push(
    check(
      "fallback",
      "model-fallback-chain",
      "Fallback models include 3.8-flash and lite",
      handlerSrc.includes("gemini-3.8-flash") &&
        handlerSrc.includes("gemini-3.5-flash-lite") &&
        handlerSrc.includes("fallbackModelsFor"),
    ),
  );
  out.push(
    check(
      "fallback",
      "silent-retry",
      "Incomplete replies retry without appending junk deltas",
      handlerSrc.includes("Retries stay silent on the wire") ||
        handlerSrc.includes("runModel(model, false, false)"),
    ),
  );
  out.push(
    check(
      "fallback",
      "guest-error-soft",
      "Guest errors return SSE/JSON without hard crash status",
      handlerSrc.includes('status: 200') &&
        handlerSrc.includes("GUEST_ERROR") &&
        handlerSrc.includes("sseChunk({ error: GUEST_ERROR })"),
    ),
  );
  out.push(
    check(
      "fallback",
      "missing-key",
      "Missing GEMINI_API_KEY surfaces guest error, not throw to client",
      handlerSrc.includes("GEMINI_API_KEY is missing") &&
        handlerSrc.includes("sseChunk({ error: GUEST_ERROR })"),
    ),
  );
  out.push(
    check(
      "fallback",
      "warm-bg-only",
      "Cache warm is background-only (does not block reply)",
      handlerSrc.includes("warmGeminiMenuCache") &&
        !handlerSrc.includes("await warmGeminiMenuCache") &&
        !handlerSrc.includes("peekGeminiMenuCache("),
    ),
  );

  const scrubbed = scrubChefInstructionLeak(
    "Do NOT repeat cart items in _DISH_\nგირჩევთ ლობიოს\nDISH_IDS: none",
  );
  out.push(
    check(
      "fallback",
      "scrub-on-error-path",
      "Instruction leak scrub works for partial failures",
      !/Do NOT|_DISH_/i.test(scrubbed) && scrubbed.includes("ლობიოს"),
      scrubbed,
    ),
  );

  const inlineLeak =
    "... When recommending, output EXACTLY 3 ids following CART & 3-CARD PA";
  out.push(
    check(
      "fallback",
      "scrub-inline-when-recommending",
      "Inline When-recommending leaks are scrubbed/detected",
      chefReplyLooksLeaked(inlineLeak) &&
        !scrubChefInstructionLeak(inlineLeak).trim(),
    ),
  );

  const cotLeak =
    'a pairing/drink, or they are choosing a regular adult meal"\nWait, if the guest asks for';
  out.push(
    check(
      "fallback",
      "reject-cot-leak",
      "English chain-of-thought leaks are not acceptable replies",
      chefReplyLooksLeaked(cotLeak) &&
        !isAcceptableChefReply(`${cotLeak}\nDISH_IDS: none`),
    ),
  );

  out.push(
    check(
      "fallback",
      "accept-complete-ka",
      "Complete Georgian reply with DISH_IDS is acceptable",
      isAcceptableChefReply("გირჩევთ საფერავს ხინკალთან.\nDISH_IDS: none"),
    ),
  );

  return out;
}

function pillarRouting(menu: AssistantDish[]): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const lite = [
    "რა ღირს ლობიო?",
    "ლობიოს ინგრედიენტები?",
    "how much is Saperavi?",
    "calories in Lobio",
    "prep time for Lobio",
  ];
  for (const [i, message] of lite.entries()) {
    const route = routeChefModel(message);
    const local = buildLocalChefFactReply({
      message,
      dishes: menu,
      locale: "ka",
      serviceFeePercent: 14,
    });
    out.push(
      check(
        "routing",
        `lite-${i + 1}`,
        `Fact → lite/DB: ${message}`,
        route === "lite" || Boolean(local),
        `route=${route} local=${Boolean(local)}`,
      ),
    );
  }

  const flash = [
    "მირჩიე სამარხვო ან ვეგეტარიანული კერძები",
    "რა ღვინო შევუხამო ხინკალს?",
    "ტოპ 3 ბესტსელერი",
    "recommend pairing for mtsvadi",
    "სხვა რამე მირჩიე",
  ];
  for (const [i, message] of flash.entries()) {
    out.push(
      check(
        "routing",
        `flash-${i + 1}`,
        `Recommend/pairing → flash: ${message}`,
        routeChefModel(message) === "flash",
        `route=${routeChefModel(message)}`,
      ),
    );
  }

  const handlerSrc = readSrc("src/lib/ai-waiter-handler.ts");
  out.push(
    check(
      "routing",
      "flash-model-id",
      "Flash uses gemini-3.6-flash",
      handlerSrc.includes('FLASH_MODEL = "gemini-3.6-flash"'),
    ),
  );
  out.push(
    check(
      "routing",
      "lite-model-id",
      "Lite uses gemini-3.5-flash-lite",
      handlerSrc.includes('LITE_MODEL = "gemini-3.5-flash-lite"'),
    ),
  );
  out.push(
    check(
      "routing",
      "local-before-gemini",
      "Local fact/recommend short-circuit before Gemini",
      (() => {
        const a = handlerSrc.indexOf("buildLocalChefFactReply");
        const b = handlerSrc.indexOf("buildLocalChefRecommendReply");
        const c = handlerSrc.indexOf("completeChefReply");
        return a > 0 && b > 0 && c > a && c > b;
      })(),
    ),
  );
  out.push(
    check(
      "routing",
      "warm-flash-only",
      "Background warm only on flash route",
      /if \(route === "flash"\) \{\s*warmGeminiMenuCache/.test(handlerSrc),
    ),
  );

  return out;
}

function pillarLanguage(menu: AssistantDish[]): ChefQaCheck[] {
  const out: ChefQaCheck[] = [];
  const handlerSrc = readSrc("src/lib/ai-waiter-handler.ts");

  out.push(
    check(
      "language",
      "no-rewrite-pass",
      "No second Georgian rewrite API call in chat path",
      !/feature:\s*"rewrite"/.test(handlerSrc) &&
        !handlerSrc.includes("polishGeorgianWithGemini") &&
        handlerSrc.includes("polishGeorgianGrammar"),
    ),
  );

  const sys = buildCacheableChefSystemPrompt("ქართლი", menu, "ka", {
    serviceFeePercent: 14,
  });
  out.push(
    check(
      "language",
      "system-no-rewrite",
      "System prompt says first-pass Georgian, no rewrite",
      /no second rewrite pass/i.test(sys) ||
        /First-pass Georgian must already be fluent/i.test(sys),
    ),
  );

  out.push(
    check(
      "language",
      "token-cap-lite",
      "Lite maxOutputTokens = 360",
      /route === "lite" \? 360 : 768/.test(handlerSrc),
    ),
  );
  out.push(
    check(
      "language",
      "token-cap-flash",
      "Flash maxOutputTokens = 768",
      /route === "lite" \? 360 : 768/.test(handlerSrc),
    ),
  );
  out.push(
    check(
      "language",
      "reject-incomplete-gemini",
      "Handler rejects incomplete/leaky Gemini replies instead of shipping fragments",
      handlerSrc.includes("isAcceptableChefReply") &&
        handlerSrc.includes("finalizeChefReply") &&
        handlerSrc.includes("Never ship truncated"),
    ),
  );

  const local = buildLocalChefRecommendReply({
    message: "მირჩიე სამარხვო ან ვეგეტარიანული კერძები",
    dishes: menu,
    locale: "ka",
  });
  const spoken = local ? visibleChefText(local) : "";
  out.push(
    check(
      "language",
      "ka-native-local",
      "Local recommend returns Georgian prose",
      /[\u10A0-\u10FF]/.test(spoken) && !/Do NOT|CART &/i.test(spoken),
      spoken.slice(0, 120),
    ),
  );

  const leak = scrubChefInstructionLeak(
    "Mandatory when recommending\nგირჩევთ სალათს\nDISH_IDS: none",
  );
  out.push(
    check(
      "language",
      "no-english-leak",
      "English instruction lines stripped from guest text",
      !/Mandatory when/i.test(leak) && leak.includes("სალათს"),
    ),
  );

  const turn = buildChefTurnPrompt(
    menu,
    "ka",
    { vegetarian: true },
    pickFocusedDishes(menu, "მირჩიე ვეგეტარიანული"),
  );
  out.push(
    check(
      "language",
      "guest-only-turns-design",
      "Turn rules live in system prompt builder (not stuffed as sole user msg)",
      turn.includes("LIVE MENU FULL CARDS") &&
        handlerSrc.includes("buildConversationTurns") &&
        handlerSrc.includes("fullSystem"),
    ),
  );

  return out;
}

/** Run the offline six-pillar suite (no network / no Gemini). */
export function runChefQaSuite(): ChefQaReport {
  const startedAt = new Date().toISOString();
  const menu = fixtureMenu();
  const checks: ChefQaCheck[] = [
    ...pillarDbFacts(menu),
    ...pillarCacheSync(menu),
    ...pillarLatency(menu),
    ...pillarFallback(),
    ...pillarRouting(menu),
    ...pillarLanguage(menu),
  ];
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: checks.length,
    passed,
    failed,
    checks,
  };
}

export function formatChefQaReport(report: ChefQaReport) {
  const lines = [
    `Chef QA ${report.passed}/${report.total} passed (${report.failed} failed)`,
    `started ${report.startedAt}`,
  ];
  const byPillar = new Map<ChefQaPillar, ChefQaCheck[]>();
  for (const c of report.checks) {
    const list = byPillar.get(c.pillar) ?? [];
    list.push(c);
    byPillar.set(c.pillar, list);
  }
  for (const [pillar, list] of byPillar) {
    const ok = list.filter((c) => c.ok).length;
    lines.push(`\n## ${pillar} (${ok}/${list.length})`);
    for (const c of list) {
      lines.push(
        `${c.ok ? "PASS" : "FAIL"} [${c.id}] ${c.name}${
          c.detail ? ` — ${c.detail}` : ""
        }${c.duration_ms != null ? ` (${c.duration_ms}ms)` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
