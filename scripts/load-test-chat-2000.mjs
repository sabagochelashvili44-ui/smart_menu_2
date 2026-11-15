/**
 * Real load test: 2000 guest chat turns against local /api/ai-waiter.
 * Rotates X-Forwarded-For to bypass the 12/min public rate limit.
 * Costs real Gemini credits for non-local turns.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const BASE = process.env.LOAD_TEST_BASE || "http://localhost:3000";
const RID = "201fef2d-b39d-4103-ae7c-94bc7b386ae6";
const TOTAL = Number(process.env.LOAD_TEST_N || 2000);
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY || 6);

const QUESTIONS = [
  "რა შევუსაბამო ხაჭაპურს?",
  "რა შევუხამო ხინკალს?",
  "დესერტი რა გაქვთ?",
  "დესერტი რა არის მენიუში?",
  "რა ღირს ხინკალი?",
  "რა ღირს აჭარული ხაჭაპური?",
  "ხინკალის ინგრედიენტები?",
  "ხაჭაპურის ალერგენები?",
  "საფერავი?",
  "ტარხუნა რა ღირს?",
  "მირჩიე სამარხვო ან ვეგეტარიანული",
  "გლუტენის გარეშე რა გაქვთ?",
  "რძის ნაწარმის გარეშე მირჩიე",
  "რა არის კარგი აქ?",
  "საფერავი როგორია?",
  "მირჩიე ლანჩი 25 ლარამდე",
  "ტოპ 3 ბესტსელერი",
  "სხვა რამე მირჩიე",
  "ორი სტუმრისთვის რა შევუკვეთოთ?",
  "რა შევუკვეთოთ დღეს?",
  "სასმელი რა გაქვთ?",
  "ღვინო რა გაქვთ?",
  "ხინკალი ხელმისაწვდომია?",
  "რამდენი კალორიაა ხინკალში?",
];

function askAt(i) {
  return QUESTIONS[i % QUESTIONS.length];
}

function fakeIp(i) {
  const a = 10;
  const b = Math.floor(i / 65025) % 255;
  const c = Math.floor(i / 255) % 255;
  const d = (i % 255) + 1;
  return `${a}.${b}.${c}.${d}`;
}

async function readSseResult(res) {
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/event-stream") || !res.body) {
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok && Boolean(json?.result || json?.message),
      result: json?.result || json?.message || "",
      error: json?.error || (!res.ok ? `HTTP ${res.status}` : null),
      meta: json?.meta || null,
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let error = null;
  let meta = null;
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
        if (json.text) full += json.text;
        if (json.result) full = json.result;
        if (json.meta) meta = json.meta;
      } catch {
        // ignore
      }
    }
  }
  return {
    ok: Boolean(full.trim()) && !error && res.ok,
    result: full.trim(),
    error,
    meta,
  };
}

async function oneTurn(i) {
  const message = askAt(i);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/ai-waiter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Forwarded-For": fakeIp(i),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
        menuContext: {
          restaurantId: RID,
          restaurantName: "Georgian House",
          locale: "ka",
          sessionId: `loadtest-${i}`,
          cartDishIds: [],
          constraints: {
            serviceFeePercent: 18,
            cartDishIds: [],
          },
        },
      }),
    });
    const parsed = await readSseResult(res);
    return {
      i,
      message,
      ms: Date.now() - t0,
      status: res.status,
      ok: parsed.ok,
      error: parsed.error,
      path: parsed.meta?.path || null,
      model: parsed.meta?.model || null,
      preview: (parsed.result || "").slice(0, 80),
    };
  } catch (error) {
    return {
      i,
      message,
      ms: Date.now() - t0,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      path: null,
      model: null,
      preview: "",
    };
  }
}

async function pool(n, concurrency, worker) {
  const results = new Array(n);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= n) return;
      results[i] = await worker(i);
      if ((i + 1) % 50 === 0 || i + 1 === n) {
        const done = results.filter(Boolean).length;
        const ok = results.filter((r) => r?.ok).length;
        console.log(`[progress] ${done}/${n} ok=${ok}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, n) }, () => run()),
  );
  return results;
}

const startedAt = new Date().toISOString();
console.log(
  JSON.stringify({
    startedAt,
    base: BASE,
    total: TOTAL,
    concurrency: CONCURRENCY,
    restaurantId: RID,
  }),
);

const t0 = Date.now();
const results = await pool(TOTAL, CONCURRENCY, oneTurn);
const elapsedMs = Date.now() - t0;

const ok = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
const byStatus = {};
const byPath = {};
for (const r of results) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const p = r.path || (r.ok ? "unknown_ok" : "failed");
  byPath[p] = (byPath[p] || 0) + 1;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let usage = null;
if (url && key) {
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("restaurant_ai_usage")
    .select(
      "created_at,feature,model,prompt_tokens,completion_tokens,cached_tokens,estimated_cost_usd,cost_usd",
    )
    .eq("restaurant_id", RID)
    .gte("created_at", startedAt)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[usage]", error.message);
  } else {
    const rows = data || [];
    let prompt = 0;
    let completion = 0;
    let cached = 0;
    let cost = 0;
    const byModel = {};
    const byFeature = {};
    for (const row of rows) {
      prompt += row.prompt_tokens || 0;
      completion += row.completion_tokens || 0;
      cached += row.cached_tokens || 0;
      cost += Number(row.estimated_cost_usd || row.cost_usd || 0);
      const m = row.model || "unknown";
      byModel[m] = byModel[m] || { n: 0, cost: 0, prompt: 0, completion: 0 };
      byModel[m].n += 1;
      byModel[m].cost += Number(row.estimated_cost_usd || row.cost_usd || 0);
      byModel[m].prompt += row.prompt_tokens || 0;
      byModel[m].completion += row.completion_tokens || 0;
      const f = row.feature || "unknown";
      byFeature[f] = (byFeature[f] || 0) + 1;
    }
    usage = {
      rows: rows.length,
      prompt,
      completion,
      cached,
      costUsd: Number(cost.toFixed(6)),
      costGelApprox: Number((cost * 2.7).toFixed(2)),
      byModel,
      byFeature,
      avgCostPerGeminiCall:
        rows.length > 0 ? Number((cost / rows.length).toFixed(6)) : 0,
      avgCostPerQuestion: Number((cost / TOTAL).toFixed(6)),
    };
  }
}

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  elapsedMs,
  elapsedMin: Number((elapsedMs / 60000).toFixed(2)),
  total: TOTAL,
  ok,
  fail,
  byStatus,
  byPath,
  usage,
  sampleFails: results.filter((r) => !r.ok).slice(0, 10),
};

writeFileSync(
  "scripts/load-test-chat-2000-result.json",
  JSON.stringify(summary, null, 2),
  "utf8",
);
console.log(JSON.stringify(summary, null, 2));
