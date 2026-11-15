/**
 * End-to-end cache verification:
 * 1) API shape: create cache, generate OK without system_instruction, 400 with it
 * 2) Live chat turns against /api/ai-waiter
 * 3) DB usage: cached_tokens > 0 on later turns
 */
import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const BASE = process.env.LOAD_TEST_BASE || "http://localhost:3000";
const RID = "201fef2d-b39d-4103-ae7c-94bc7b386ae6";
const gemKey = (
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  ""
).trim();

const report = {
  startedAt: new Date().toISOString(),
  apiShape: null,
  turns: [],
  usage: [],
  verdict: { ok: false, reasons: [] },
};

async function apiShape() {
  const ai = new GoogleGenAI({ apiKey: gemKey });
  // Explicit cache requires >=1024 tokens. Pad until clearly above.
  let systemInstruction =
    "You are the Digital Host of Georgian House — Head Chef and Sommelier.\n" +
    "ROLE: recommend only menu items. Reply in guest language. End with DISH_IDS.\n" +
    "RULES: never invent dishes; pairings only from pairs_with; quote prices in GEL.\n" +
    "LIVE MENU INDEX:\n" +
    "1|ხინკალი|16|[VG]|beef pork broth\n2|ხაჭაპური|18|cheese\n3|ლობიო|12|beans\n" +
    "4|საფერავი|25|wine\n5|ტარხუნა|5|lemonade\n";
  while (systemInstruction.length < 12_000) {
    systemInstruction +=
      "DETAIL row with ingredients allergens macros prep pairing notes for guests. ";
  }

  const created = await ai.caches.create({
    model: "gemini-3.6-flash",
    config: {
      displayName: "e2e-cache-shape",
      systemInstruction,
      ttl: "180s",
    },
  });

  let okNoSystem = null;
  let badWithSystem = null;

  try {
    const gen = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents:
        "LIVE MENU FULL CARDS\nGUEST:\nrecommend something under 25 GEL",
      config: {
        cachedContent: created.name,
        maxOutputTokens: 128,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    okNoSystem = {
      ok: true,
      cached: Number(gen.usageMetadata?.cachedContentTokenCount || 0),
      prompt: Number(gen.usageMetadata?.promptTokenCount || 0),
      preview: String(gen.text || "").slice(0, 100),
    };
  } catch (e) {
    okNoSystem = {
      ok: false,
      message: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    };
  }

  try {
    await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: "hi",
      config: {
        cachedContent: created.name,
        systemInstruction: "turn cards here",
        maxOutputTokens: 16,
      },
    });
    badWithSystem = { ok: true, unexpectedSuccess: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    badWithSystem = {
      ok: /system_instruction|CachedContent can not be used/i.test(msg),
      status: /\"code\":400/.test(msg) ? 400 : null,
      message: msg.slice(0, 220),
    };
  }

  if (created.name) {
    try {
      await ai.caches.delete({ name: created.name });
    } catch {
      // ignore
    }
  }

  return {
    createOk: Boolean(created.name),
    generateWithoutSystemInstruction: okNoSystem,
    generateWithSystemInstructionRejected: badWithSystem,
  };
}

async function oneTurn(i, message, locale = "ka") {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai-waiter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.210.${Math.floor(i / 250)}.${(i % 250) + 1}`,
    },
    body: JSON.stringify({
      restaurantId: RID,
      message,
      locale,
      history: [],
    }),
  });

  let text = "";
  let meta = null;
  let error = null;
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((row) => row.startsWith("data:"));
        if (!line) continue;
        try {
          const json = JSON.parse(line.slice(5).trim());
          if (json.error) error = String(json.error);
          if (json.text) text += json.text;
          if (json.result) text = String(json.result);
          if (json.meta) meta = json.meta;
        } catch {
          // ignore
        }
      }
    }
  } else {
    const json = await res.json().catch(() => null);
    text = json?.result || json?.message || "";
    meta = json?.meta || null;
    error = json?.error || null;
  }

  return {
    i,
    locale,
    message,
    status: res.status,
    ms: Date.now() - t0,
    ok: Boolean(String(text).trim()) && !error,
    error,
    meta,
    hasDishIds: /DISH_IDS:/i.test(text),
    preview: String(text).slice(0, 220),
  };
}

async function main() {
  report.apiShape = await apiShape();

  const turnsPlan = [
    { locale: "ka", message: "მირჩიე ლანჩი 25 ლარამდე დღეს" },
    { locale: "ka", message: "მირჩიე ლანჩი 25 ლარამდე დღეს" },
    { locale: "en", message: "recommend a nice lunch under 25 GEL for today" },
    { locale: "en", message: "recommend a nice lunch under 25 GEL for today" },
  ];

  for (let i = 0; i < turnsPlan.length; i++) {
    report.turns.push(
      await oneTurn(i + 1, turnsPlan[i].message, turnsPlan[i].locale),
    );
    if (i === 0) await new Promise((r) => setTimeout(r, 4000));
    else await new Promise((r) => setTimeout(r, 1500));
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const since = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  const { data: usage } = await sb
    .from("restaurant_ai_usage")
    .select(
      "model,prompt_tokens,completion_tokens,cached_tokens,estimated_cost_usd,created_at",
    )
    .eq("restaurant_id", RID)
    .eq("feature", "chat")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  report.usage = usage || [];
  report.finishedAt = new Date().toISOString();

  const shapeOk =
    report.apiShape?.createOk &&
    report.apiShape?.generateWithoutSystemInstruction?.ok &&
    Number(report.apiShape?.generateWithoutSystemInstruction?.cached) > 0 &&
    report.apiShape?.generateWithSystemInstructionRejected?.ok;

  const geminiTurns = report.turns.filter((t) => t.meta?.path === "gemini");
  const guestOk = report.turns.filter((t) => t.ok).length;
  // Same-locale repeat turns (2 and 4) should peek explicit cache after warm.
  const metaCached = report.turns.some((t) => t.meta?.cached === true);
  const repeatCached =
    report.turns[1]?.meta?.cached === true ||
    report.turns[3]?.meta?.cached === true;
  const dbCached = report.usage.some((r) => Number(r.cached_tokens) > 0);
  const maxCached = Math.max(
    0,
    ...report.usage.map((r) => Number(r.cached_tokens) || 0),
  );

  const reasons = [];
  if (!shapeOk) reasons.push("api_shape_failed");
  if (guestOk < 2) reasons.push(`guest_ok_lt_2 (${guestOk}/4)`);
  if (!dbCached) reasons.push("no_db_cached_tokens");
  if (!repeatCached) reasons.push("meta_cached_false_on_repeat_turn");
  if (geminiTurns.length === 0 && guestOk < 2) {
    reasons.push("no_gemini_path_observed");
  }

  report.verdict = {
    ok: shapeOk && dbCached && guestOk >= 2 && repeatCached,
    shapeOk,
    guestOk,
    guestTotal: report.turns.length,
    metaCached,
    repeatCached,
    dbCached,
    maxCachedTokens: maxCached,
    geminiTurns: geminiTurns.length,
    reasons,
  };

  writeFileSync(
    "scripts/verify-cache-e2e-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log(
    JSON.stringify(
      {
        apiShape: report.apiShape,
        turns: report.turns.map((t) => ({
          i: t.i,
          ok: t.ok,
          ms: t.ms,
          path: t.meta?.path,
          model: t.meta?.model,
          cached: t.meta?.cached,
          error: t.error,
          hasDishIds: t.hasDishIds,
          preview: t.preview,
        })),
        usageSample: report.usage.slice(0, 8),
      },
      null,
      2,
    ),
  );

  if (!report.verdict.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
