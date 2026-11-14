import { GoogleGenAI } from "@google/genai";
import { polishGeorgianGrammar } from "@/lib/ai/waiter";
import { recordAiUsage, usageFromGeminiChunks } from "@/lib/ai-usage";
import {
  buildCacheableChefSystemPrompt,
  buildChefTurnPrompt,
  extractHistoryDishIds,
  pickFocusedDishes,
  type AssistantDish,
  type GuestChatConstraints,
} from "@/lib/ai-assistant";
import {
  filterMenuBySelectedTag,
  loadWaiterMenuDishes,
  loadWaiterRestaurant,
} from "@/lib/ai-waiter-menu";
import {
  buildLocalChefFactReply,
  buildLocalChefRecommendReply,
  matchNamedDishForFact,
} from "@/lib/chef-local-facts";
import {
  routeChefModel,
  isAcceptableChefReply,
  scrubChefInstructionLeak,
} from "@/lib/chat-suggestions";
import { enrichDishesWithPopularity } from "@/lib/dish-popularity";
import {
  CHEF_SLOW_RESPONSE_MS,
  hashChefMenuCache,
  warmGeminiMenuCache,
} from "@/lib/gemini-menu-cache";
import { ui } from "@/lib/menu-copy";
import {
  insertOffMenuRequest,
  menuCoversQuery,
  offMenuDishQuery,
} from "@/lib/guest-demand";
import { rateLimitPublicApi } from "@/lib/public-api-guard";
import { ensureRestaurantAiHost } from "@/lib/restaurant-ai-host";
import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type MenuContext = {
  restaurantId?: string;
  restaurantName?: string;
  locale?: "ka" | "en" | "ru";
  dishes?: AssistantDish[];
  activeFilters?: string[];
  constraints?: GuestChatConstraints;
  selectedTag?: string;
  sessionId?: string;
  tableId?: string;
  cartDishIds?: string[];
};

function lastUserMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && messages[i].content.trim()) {
      return { index: i, content: messages[i].content.trim() };
    }
  }
  return null;
}

function inferSelectedTag(
  message: string,
  selectedTag?: string,
  constraints?: GuestChatConstraints,
) {
  if (constraints?.vegetarian || constraints?.vegan) return "";
  if (/არ\s+მინდა\s+ხორც|უხორც|no\s+meat|without\s+meat|без\s+мяс/i.test(message)) {
    return "";
  }
  if (selectedTag?.trim()) return selectedTag.trim();
  if (/ხორც|მწვად|steak|meat|мяс|говяд|kebab|ქაბაბ/i.test(message)) {
    return "meat";
  }
  return "";
}

function detectMessageLocale(
  message: string,
  fallback: "ka" | "en" | "ru",
): "ka" | "en" | "ru" {
  const kaCount = (message.match(/[\u10A0-\u10FF]/g) ?? []).length;
  const ruCount = (message.match(/[\u0400-\u04FF]/g) ?? []).length;
  const enCount = (message.match(/[A-Za-z]/g) ?? []).length;
  if (kaCount > 0 && kaCount >= ruCount && kaCount >= enCount) return "ka";
  if (ruCount > 0 && ruCount >= kaCount && ruCount >= enCount) return "ru";
  if (enCount >= 3 && enCount > kaCount && enCount > ruCount) return "en";
  return fallback;
}

function waiterPromptContext(body: {
  messages?: ChatMessage[];
  menuContext?: MenuContext;
  activeFilters?: string[];
  message?: string;
  history?: ChatMessage[];
  dishes?: AssistantDish[];
  restaurantId?: string;
  restaurantName?: string;
  locale?: "ka" | "en" | "ru";
  language?: "ka" | "en" | "ru";
  selectedTag?: string;
}) {
  const packedMessages = Array.isArray(body.messages) ? body.messages : [];
  const fromMessages = lastUserMessage(packedMessages);
  const localeRaw = body.menuContext?.locale ?? body.locale ?? body.language;
  const uiLocale: "ka" | "en" | "ru" =
    localeRaw === "en" || localeRaw === "ru" ? localeRaw : "ka";
  const history = (
    fromMessages
      ? packedMessages.slice(0, fromMessages.index)
      : (body.history ?? [])
  )
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-12);
  const message = fromMessages?.content || body.message?.trim() || "";
  const locale = detectMessageLocale(message, uiLocale);
  const rawActiveFilters = Array.isArray(body.activeFilters)
    ? body.activeFilters
    : Array.isArray(body.menuContext?.activeFilters)
      ? body.menuContext.activeFilters
      : Array.isArray(body.menuContext?.constraints?.activeFilters)
        ? body.menuContext.constraints.activeFilters
        : null;
  const activeFilters = rawActiveFilters
    ? rawActiveFilters.map((f) => String(f).trim()).filter(Boolean)
    : [];
  const rawConstraints = body.menuContext?.constraints;
  const blockedAllergens = rawActiveFilters
    ? activeFilters.filter((tag) =>
        ["gluten", "dairy", "nuts", "eggs", "fish", "shellfish"].includes(tag),
      )
    : (rawConstraints?.blockedAllergens ?? []);
  const cartDishIds = Array.isArray(body.menuContext?.cartDishIds)
    ? body.menuContext.cartDishIds.map((id) => String(id).trim()).filter(Boolean)
    : rawConstraints?.cartDishIds;
  const constraints: GuestChatConstraints = {
    ...rawConstraints,
    cartDishIds,
    activeFilters,
    blockedAllergens,
    vegetarian: rawActiveFilters
      ? activeFilters.includes("vegetarian") || Boolean(rawConstraints?.vegetarian)
      : Boolean(rawConstraints?.vegetarian),
    vegan: rawActiveFilters
      ? activeFilters.includes("vegan") || Boolean(rawConstraints?.vegan)
      : Boolean(rawConstraints?.vegan),
    maxPrice:
      rawActiveFilters && !activeFilters.includes("budget_25")
        ? undefined
        : rawConstraints?.maxPrice,
    partySize:
      rawActiveFilters && !activeFilters.includes("party_2")
        ? undefined
        : rawConstraints?.partySize,
  };
  return {
    message,
    restaurantName:
      body.menuContext?.restaurantName?.trim() ||
      body.restaurantName?.trim() ||
      "",
    locale,
    history,
    constraints,
    restaurantId:
      body.menuContext?.restaurantId?.trim() ||
      body.restaurantId?.trim() ||
      "",
    sessionId: body.menuContext?.sessionId?.trim() || "",
    tableId: body.menuContext?.tableId?.trim() || "",
    selectedTag: inferSelectedTag(
      message,
      body.menuContext?.selectedTag ?? body.selectedTag,
      constraints,
    ),
  };
}

const FLASH_MODEL = "gemini-3.6-flash";
const FLASH_FALLBACK_MODEL = "gemini-3.8-flash";
const LITE_MODEL = "gemini-3.5-flash-lite";
const MODEL_TIMEOUT_MS = 22_000;
const GUEST_ERROR = "Failed to generate AI response";

function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    ""
  );
}

function guestErrorResponse() {
  return NextResponse.json({ error: GUEST_ERROR }, { status: 200 });
}

type GeminiTurn = {
  role: "user" | "model";
  parts: { text: string }[];
};

type GeminiConfig = {
  systemInstruction?: string;
  cachedContent?: string;
  temperature: number;
  maxOutputTokens: number;
  automaticContinuation?: boolean;
  abortSignal?: AbortSignal;
  httpOptions?: {
    timeout?: number;
    retryOptions?: { attempts?: number };
  };
};

type GeminiChunk = {
  text?: string;
  usageMetadata?: unknown;
};

type GeminiModels = {
  generateContentStream?: (args: {
    model: string;
    contents: GeminiTurn[] | string;
    config: GeminiConfig;
  }) => Promise<AsyncIterable<GeminiChunk>>;
  generateContent: (args: {
    model: string;
    contents: GeminiTurn[] | string;
    config: GeminiConfig;
  }) => Promise<GeminiChunk>;
};

function fallbackModelsFor(primary: string) {
  // After an incomplete flash reply, prefer lite for a fast complete answer.
  if (primary === FLASH_MODEL || primary === FLASH_FALLBACK_MODEL) {
    return [
      LITE_MODEL,
      primary === FLASH_MODEL ? FLASH_FALLBACK_MODEL : FLASH_MODEL,
    ];
  }
  return [FLASH_MODEL, FLASH_FALLBACK_MODEL];
}

function maxOutputTokensForRoute(route: "flash" | "lite") {
  // Keep enough room for Georgian prose + DISH_IDS; too-low caps cause
  // incomplete replies and slow model fallbacks.
  return route === "lite" ? 360 : 768;
}

function finalizeChefReply(raw: string) {
  if (!isAcceptableChefReply(raw)) return null;
  return scrubChefInstructionLeak(raw);
}

async function* streamModel(
  modelsApi: GeminiModels,
  model: string,
  contents: GeminiTurn[],
  systemInstruction: string,
  cachedContent?: string,
  maxOutputTokens = 320,
) {
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  const config: GeminiConfig = {
    temperature: 0.2,
    maxOutputTokens,
    automaticContinuation: true,
    abortSignal: signal,
    httpOptions: {
      timeout: MODEL_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  };
  if (cachedContent) {
    config.cachedContent = cachedContent;
  } else {
    config.systemInstruction = systemInstruction;
  }
  if (typeof modelsApi.generateContentStream === "function") {
    const stream = await modelsApi.generateContentStream({
      model,
      contents,
      config,
    });
    for await (const chunk of stream) {
      yield chunk;
    }
    return;
  }
  yield await modelsApi.generateContent({
    model,
    contents,
    config,
  });
}

async function completeChefReply(
  contents: GeminiTurn[],
  systemInstruction: string,
  apiKey: string,
  restaurantId: string,
  onDelta: (text: string) => void,
  primaryModel: string,
  cachedContent?: string | null,
  maxOutputTokens = 320,
): Promise<{ text: string; model: string }> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: MODEL_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  });
  const modelsApi = ai.models as unknown as GeminiModels;
  let assembled = "";
  let lastError: unknown = null;

  async function runModel(
    model: string,
    useCache: boolean,
    emit: boolean,
  ) {
    const chunks: GeminiChunk[] = [];
    let text = "";
    let emitted = "";
    for await (const chunk of streamModel(
      modelsApi,
      model,
      contents,
      systemInstruction,
      useCache ? cachedContent || undefined : undefined,
      maxOutputTokens,
    )) {
      chunks.push(chunk);
      const delta = chunk.text ?? "";
      if (!delta) continue;
      text += delta;
      if (emit) {
        const clean = scrubChefInstructionLeak(text);
        if (clean.startsWith(emitted)) {
          const next = clean.slice(emitted.length);
          if (next) {
            emitted = clean;
            onDelta(next);
          }
        } else {
          // Scrub removed earlier leaked text — do not append a full
          // rewrite (client concatenates deltas). Final SSE result replaces.
          emitted = clean;
        }
      }
    }
    const usage = usageFromGeminiChunks(chunks);
    if (usage) {
      await recordAiUsage({
        restaurantId,
        feature: "chat",
        provider: "gemini",
        model,
        usage,
      });
    }
    return text;
  }

  try {
    assembled = await runModel(primaryModel, Boolean(cachedContent), true);
    const ok = finalizeChefReply(assembled);
    if (ok) return { text: ok, model: primaryModel };
    lastError = new Error("gemini reply incomplete");
  } catch (error) {
    lastError = error;
    console.error("Gemini Failure Details:", error);
    const ok = finalizeChefReply(assembled);
    if (ok) return { text: ok, model: primaryModel };
  }

  // Retries stay silent on the wire; the final SSE `result` replaces any
  // partial/leaky first stream in the client.
  if (cachedContent && !finalizeChefReply(assembled)) {
    try {
      assembled = await runModel(primaryModel, false, false);
      const ok = finalizeChefReply(assembled);
      if (ok) return { text: ok, model: primaryModel };
    } catch (uncachedError) {
      lastError = uncachedError;
      console.error("Gemini Failure Details:", uncachedError);
    }
  }

  for (const model of fallbackModelsFor(primaryModel)) {
    try {
      const fallbackText = await runModel(model, false, false);
      const ok = finalizeChefReply(fallbackText);
      if (ok) return { text: ok, model };
    } catch (error) {
      lastError = error;
      console.error("Gemini Failure Details:", error);
    }
  }
  // Never ship truncated / instruction-leak fragments to guests.
  throw lastError ?? new Error(GUEST_ERROR);
}

function sseChunk(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function chefDiagnosticsEnabled() {
  return (
    process.env.CHEF_DIAGNOSTICS === "1" ||
    process.env.NODE_ENV === "development"
  );
}

function logChefTiming(event: {
  path: "local_fact" | "local_recommend" | "gemini" | "empty_menu";
  duration_ms: number;
  restaurantId: string;
  route?: "flash" | "lite";
  model?: string;
  cached?: boolean;
}) {
  const payload = {
    ...event,
    slow: event.duration_ms >= CHEF_SLOW_RESPONSE_MS,
  };
  if (payload.slow) {
    console.warn("[chef-timing:slow]", JSON.stringify(payload));
  } else {
    console.info("[chef-timing]", JSON.stringify(payload));
  }
}

function emptyMenuReply(locale: "ka" | "en" | "ru") {
  return `${ui[locale].menuEmptyChat}\nDISH_IDS: none`;
}

function buildConversationTurns(
  history: ChatMessage[],
  message: string,
): GeminiTurn[] {
  const turns: GeminiTurn[] = [];
  for (const item of history.slice(-4)) {
    const text = item.content.trim();
    if (!text) continue;
    const role: "user" | "model" =
      item.role === "assistant" ? "model" : "user";
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text = `${prev.parts[0].text}\n${text}`;
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }
  while (turns.length && turns[0].role === "model") {
    turns.shift();
  }
  const prev = turns[turns.length - 1];
  if (prev && prev.role === "user") {
    prev.parts[0].text = `${prev.parts[0].text}\n${message}`;
  } else {
    turns.push({ role: "user", parts: [{ text: message }] });
  }
  return turns;
}

export async function handleAiWaiterPost(request: Request) {
  try {
    const ctx = waiterPromptContext(
      (await request.json()) as {
        messages?: ChatMessage[];
        menuContext?: MenuContext;
        activeFilters?: string[];
        message?: string;
        history?: ChatMessage[];
        dishes?: AssistantDish[];
        restaurantName?: string;
        locale?: "ka" | "en" | "ru";
        selectedTag?: string;
      },
    );
    if (!ctx.message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }
    if (!ctx.restaurantId) {
      return NextResponse.json(
        { error: "Restaurant is required." },
        { status: 400 },
      );
    }

    const limited = rateLimitPublicApi(
      request,
      "ai-waiter",
      ctx.restaurantId,
      12,
    );
    if (!limited.ok) return limited.response;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const turnStartedAt = Date.now();
        try {
          const host = await ensureRestaurantAiHost(ctx.restaurantId);
          const hostId = host?.restaurantId || ctx.restaurantId;
          const restaurant = await loadWaiterRestaurant(ctx.restaurantId);
          let dishes: AssistantDish[] = [];
          try {
            dishes = await loadWaiterMenuDishes(ctx.restaurantId);
          } catch (error) {
            console.error("[ai-waiter] menu fetch failed", error);
          }
          const available = dishes.filter((dish) => dish.is_available !== false);
          const availableIds = available
            .map((dish) => dish.id?.trim() ?? "")
            .filter(Boolean);
          if (available.length) {
            const miss = offMenuDishQuery(ctx.message);
            if (miss && !menuCoversQuery(available, miss)) {
              void insertOffMenuRequest({
                restaurantId: ctx.restaurantId,
                tableId: ctx.tableId,
                sessionId: ctx.sessionId,
                source: "chat",
                query: miss,
              });
            }
          }
          if (!available.length) {
            const empty = emptyMenuReply(ctx.locale);
            const duration_ms = Date.now() - turnStartedAt;
            logChefTiming({
              path: "empty_menu",
              duration_ms,
              restaurantId: ctx.restaurantId,
            });
            controller.enqueue(encoder.encode(sseChunk({ text: empty })));
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: empty,
                  done: true,
                  availableIds: [],
                  ...(chefDiagnosticsEnabled()
                    ? {
                        meta: {
                          path: "empty_menu",
                          duration_ms,
                        },
                      }
                    : {}),
                }),
              ),
            );
            return;
          }

          dishes = await enrichDishesWithPopularity(ctx.restaurantId, available);
          const tagged = filterMenuBySelectedTag(dishes, ctx.selectedTag);

          const serviceFeePercent =
            restaurant.percent || ctx.constraints?.serviceFeePercent || 0;
          const restaurantName = restaurant.name || "this restaurant";

          const localFact = buildLocalChefFactReply({
            message: ctx.message,
            dishes: tagged,
            locale: ctx.locale,
            serviceFeePercent,
          });
          if (localFact) {
            const duration_ms = Date.now() - turnStartedAt;
            logChefTiming({
              path: "local_fact",
              duration_ms,
              restaurantId: ctx.restaurantId,
              route: "lite",
              cached: false,
            });
            controller.enqueue(encoder.encode(sseChunk({ text: localFact })));
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: localFact,
                  done: true,
                  availableIds,
                  ...(chefDiagnosticsEnabled()
                    ? {
                        meta: {
                          path: "local_fact",
                          duration_ms,
                          route: "lite",
                          model: null,
                          cached: false,
                        },
                      }
                    : {}),
                }),
              ),
            );
            return;
          }

          const priorIds = extractHistoryDishIds(ctx.history);
          const localRecommend = buildLocalChefRecommendReply({
            message: ctx.message,
            dishes: tagged,
            locale: ctx.locale,
            priorIds,
          });
          if (localRecommend) {
            const duration_ms = Date.now() - turnStartedAt;
            logChefTiming({
              path: "local_recommend",
              duration_ms,
              restaurantId: ctx.restaurantId,
              route: "flash",
              cached: false,
            });
            controller.enqueue(
              encoder.encode(sseChunk({ text: localRecommend })),
            );
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: localRecommend,
                  done: true,
                  availableIds,
                  ...(chefDiagnosticsEnabled()
                    ? {
                        meta: {
                          path: "local_recommend",
                          duration_ms,
                          route: "flash",
                          model: null,
                          cached: false,
                        },
                      }
                    : {}),
                }),
              ),
            );
            return;
          }

          const apiKey = geminiApiKey();
          if (!apiKey) {
            console.error(
              "Gemini Failure Details:",
              new Error("GEMINI_API_KEY is missing"),
            );
            controller.enqueue(
              encoder.encode(sseChunk({ error: GUEST_ERROR })),
            );
            return;
          }

          const route = routeChefModel(ctx.message);
          const primaryModel = route === "lite" ? LITE_MODEL : FLASH_MODEL;
          const factDish =
            route === "lite"
              ? matchNamedDishForFact(tagged, ctx.message)
              : null;
          const focused =
            factDish != null
              ? [factDish]
              : pickFocusedDishes(tagged, ctx.message, priorIds);
          const dietFromMessage =
            /ვეგეტარ|სამარხვ|მარხვ|vegetarian|vegan|fasting|вегетариан|постн|постан|веган/i.test(
              ctx.message,
            );
          const constraints = {
            ...ctx.constraints,
            serviceFeePercent,
            vegetarian:
              Boolean(ctx.constraints?.vegetarian) || dietFromMessage,
            vegan:
              Boolean(ctx.constraints?.vegan) ||
              /ვეგან|vegan|სამარხვ|fasting|постн|постан/i.test(ctx.message),
            noAlcohol:
              Boolean(ctx.constraints?.noAlcohol) || dietFromMessage,
          };
          const cacheable = buildCacheableChefSystemPrompt(
            restaurantName,
            dishes,
            ctx.locale,
            {
              hostId,
              serviceFeePercent,
              includeIndex: route !== "lite",
            },
          );
          const turnPrompt = buildChefTurnPrompt(
            tagged,
            ctx.locale,
            constraints,
            focused,
            route === "lite"
              ? { includeCartPairing: false, includeFilters: false }
              : undefined,
          );
          // Always put rules + cards in systemInstruction and only the guest
          // text in the user turn. Stuffing instructions into the user message
          // made Gemini echo English rules ("Do NOT repeat cart…") and skip
          // a real Georgian answer. Warm the remote cache in the background
          // for later turns without blocking this reply.
          const fullSystem = `${cacheable}\n${turnPrompt}`;
          if (route === "flash") {
            warmGeminiMenuCache({
              restaurantId: ctx.restaurantId,
              locale: ctx.locale,
              model: FLASH_MODEL,
              hash: hashChefMenuCache({
                restaurantName,
                serviceFeePercent,
                dishes,
              }),
              systemInstruction: cacheable,
            });
          }
          const turnContents = buildConversationTurns(
            ctx.history,
            ctx.message,
          );

          const completed = await completeChefReply(
            turnContents,
            fullSystem,
            apiKey,
            ctx.restaurantId,
            (delta) => {
              controller.enqueue(encoder.encode(sseChunk({ text: delta })));
            },
            primaryModel,
            null,
            maxOutputTokensForRoute(route),
          );
          const duration_ms = Date.now() - turnStartedAt;
          logChefTiming({
            path: "gemini",
            duration_ms,
            restaurantId: ctx.restaurantId,
            route,
            model: completed.model,
            cached: false,
          });
          if (!completed.text.trim()) {
            controller.enqueue(
              encoder.encode(sseChunk({ error: GUEST_ERROR })),
            );
          } else {
            const polished = polishGeorgianGrammar(completed.text);
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: polished,
                  done: true,
                  availableIds,
                  ...(chefDiagnosticsEnabled()
                    ? {
                        meta: {
                          path: "gemini",
                          duration_ms,
                          route,
                          model: completed.model,
                          cached: false,
                          maxOutputTokens: maxOutputTokensForRoute(route),
                        },
                      }
                    : {}),
                }),
              ),
            );
          }
        } catch (error) {
          console.error("Gemini Failure Details:", error);
          controller.enqueue(encoder.encode(sseChunk({ error: GUEST_ERROR })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Gemini Failure Details:", error);
    return guestErrorResponse();
  }
}
