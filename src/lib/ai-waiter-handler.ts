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
  buildLocalChefCategoryReply,
  buildLocalChefFactReply,
  buildLocalChefPairingReply,
  buildLocalChefRecommendReply,
  hasPairingIntent,
  matchNamedDishForFact,
  resolvePairingSubject,
} from "@/lib/chef-local-facts";
import {
  routeChefModel,
  isAcceptableChefReply,
  ensureChefDishIdsTrailer,
  scrubChefInstructionLeak,
} from "@/lib/chat-suggestions";
import { enrichDishesWithPopularity } from "@/lib/dish-popularity";
import { enforceCuratedPairingsInChefReply } from "@/lib/recommendations";
import {
  CHEF_SLOW_RESPONSE_MS,
  hashChefMenuCache,
  peekGeminiMenuCache,
  shouldCreateGeminiMenuCache,
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
  thinkingConfig?: { thinkingBudget?: number };
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
  // Cross-model fallback only for hard API failures — never for missing DISH_IDS.
  if (primary === LITE_MODEL) {
    return [FLASH_MODEL, FLASH_FALLBACK_MODEL];
  }
  if (primary === FLASH_MODEL) return [FLASH_FALLBACK_MODEL];
  if (primary === FLASH_FALLBACK_MODEL) return [FLASH_MODEL];
  return [LITE_MODEL, FLASH_MODEL];
}

function maxOutputTokensForRoute(route: "flash" | "lite") {
  // Headroom so short replies finish with DISH_IDS (avoids dual Flash→Lite bills).
  return route === "lite" ? 1024 : 1280;
}

function finalizeChefReply(raw: string) {
  const withIds = ensureChefDishIdsTrailer(raw);
  if (!isAcceptableChefReply(withIds)) return null;
  return scrubChefInstructionLeak(withIds);
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
    // Thinking tokens inflate billed completion — keep budget at 0 for chat.
    thinkingConfig: { thinkingBudget: 0 },
    automaticContinuation: true,
    abortSignal: signal,
    httpOptions: {
      timeout: MODEL_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  };
  if (cachedContent) {
    // Gemini rejects cachedContent + system_instruction / tools on the same
    // generate call (400 INVALID_ARGUMENT). Turn FULL cards must live in contents.
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
    // Incomplete/leaky after DISH_IDS recovery: one same-model uncached retry,
    // then accept recovered prose — do NOT cross-bill Lite/Flash.
    if (cachedContent) {
      assembled = await runModel(primaryModel, false, false);
      const uncachedOk = finalizeChefReply(assembled);
      if (uncachedOk) return { text: uncachedOk, model: primaryModel };
    }
    const forced = finalizeChefReply(ensureChefDishIdsTrailer(assembled));
    if (forced) return { text: forced, model: primaryModel };
    lastError = new Error("gemini reply incomplete");
    throw lastError;
  } catch (error) {
    lastError = error;
    console.error("Gemini Failure Details:", error);
    const ok = finalizeChefReply(assembled);
    if (ok) return { text: ok, model: primaryModel };
  }

  // Retries stay silent on the wire; the final SSE `result` replaces any
  // partial/leaky first stream in the client. Cross-model only on hard failures.
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

/** When explicit cache holds rules+INDEX, attach turn FULL cards in contents. */
function withCachedTurnCards(
  contents: GeminiTurn[],
  turnPrompt: string,
): GeminiTurn[] {
  const block = turnPrompt.trim();
  if (!block) return contents;
  const cloned = contents.map((turn) => ({
    role: turn.role,
    parts: turn.parts.map((part) => ({ text: part.text })),
  }));
  const last = cloned[cloned.length - 1];
  if (last?.role === "user") {
    last.parts[0].text = `${block}\n\nGUEST:\n${last.parts[0].text}`;
    return cloned;
  }
  cloned.push({ role: "user", parts: [{ text: `${block}\n\nGUEST:` }] });
  return cloned;
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

          const priorIds = extractHistoryDishIds(ctx.history);
          // Pairing before facts/Gemini — never stream an invented companion answer.
          const localPairing = buildLocalChefPairingReply({
            message: ctx.message,
            dishes: tagged,
            locale: ctx.locale,
            history: ctx.history,
          });
          if (localPairing) {
            const duration_ms = Date.now() - turnStartedAt;
            logChefTiming({
              path: "local_recommend",
              duration_ms,
              restaurantId: ctx.restaurantId,
              route: "flash",
              cached: false,
            });
            controller.enqueue(
              encoder.encode(sseChunk({ text: localPairing })),
            );
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: localPairing,
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
                          pairing: true,
                        },
                      }
                    : {}),
                }),
              ),
            );
            return;
          }

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
          const localCategory = buildLocalChefCategoryReply({
            message: ctx.message,
            dishes: tagged,
            locale: ctx.locale,
          });
          if (localCategory) {
            const duration_ms = Date.now() - turnStartedAt;
            logChefTiming({
              path: "local_recommend",
              duration_ms,
              restaurantId: ctx.restaurantId,
              route: "flash",
              cached: false,
            });
            controller.enqueue(
              encoder.encode(sseChunk({ text: localCategory })),
            );
            controller.enqueue(
              encoder.encode(
                sseChunk({
                  result: localCategory,
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
                          category: true,
                        },
                      }
                    : {}),
                }),
              ),
            );
            return;
          }
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
          const focusedBase =
            factDish != null
              ? [factDish]
              : pickFocusedDishes(tagged, ctx.message, priorIds);
          // Always keep cart dishes in FULL cards so pairs_with companions are visible.
          const cartFocusIds = new Set(
            (ctx.constraints?.cartDishIds ?? [])
              .map((id) => String(id).trim().toLowerCase())
              .filter(Boolean),
          );
          const focused = (() => {
            if (!cartFocusIds.size) return focusedBase;
            const byId = new Map(
              tagged
                .filter((dish) => dish.id)
                .map((dish) => [String(dish.id).toLowerCase(), dish] as const),
            );
            const merged = [...focusedBase];
            const used = new Set(
              merged
                .map((dish) => String(dish.id ?? "").toLowerCase())
                .filter(Boolean),
            );
            for (const id of cartFocusIds) {
              const dish = byId.get(id);
              if (!dish || used.has(id)) continue;
              merged.unshift(dish);
              used.add(id);
            }
            return merged;
          })();
          const wantsVegOrFasting =
            /ვეგეტარ|სამარხვ|მარხვ|vegetarian|vegan|fasting|вегетариан|постн|постан|веган/i.test(
              ctx.message,
            );
          const wantsVegetarianWord =
            /ვეგეტარ|vegetarian|вегетариан/i.test(ctx.message);
          const wantsVeganOnly =
            /ვეგან|vegan|სამარხვ|მარხვ|fasting|постн|постан/i.test(
              ctx.message,
            ) && !wantsVegetarianWord;
          const constraints = {
            ...ctx.constraints,
            serviceFeePercent,
            vegetarian:
              Boolean(ctx.constraints?.vegetarian) || wantsVegOrFasting,
            // "სამარხვო ან ვეგეტარიანული" must not force vegan (excludes cream soups).
            vegan: Boolean(ctx.constraints?.vegan) || wantsVeganOnly,
            noAlcohol:
              Boolean(ctx.constraints?.noAlcohol) || wantsVegOrFasting,
          };
          // Cache rules + INDEX (when included). Lite keeps INDEX off for smaller prompts.
          const includeIndex = route === "flash";
          const cacheable = buildCacheableChefSystemPrompt(
            restaurantName,
            dishes,
            ctx.locale,
            {
              hostId,
              serviceFeePercent,
              includeIndex,
            },
          );
          const turnPrompt = buildChefTurnPrompt(
            tagged,
            ctx.locale,
            constraints,
            focused,
            route === "lite"
              ? {
                  includeCartPairing: false,
                  includeFilters: false,
                  guestMessage: ctx.message,
                }
              : { guestMessage: ctx.message },
          );
          const menuHash = hashChefMenuCache({
            restaurantName,
            serviceFeePercent,
            dishes,
          });
          const cachedName = peekGeminiMenuCache({
            restaurantId: ctx.restaurantId,
            locale: ctx.locale,
            model: primaryModel,
            hash: menuHash,
          });
          // Warm remote cache in background when large enough; never block reply.
          if (shouldCreateGeminiMenuCache(cacheable)) {
            warmGeminiMenuCache({
              restaurantId: ctx.restaurantId,
              locale: ctx.locale,
              model: primaryModel,
              hash: menuHash,
              systemInstruction: cacheable,
            });
          }
          const turnContents = buildConversationTurns(
            ctx.history,
            ctx.message,
          );
          // Always keep full system text for uncached retries. When the
          // generate call uses cachedContent, streamModel omits
          // system_instruction (Gemini 400 otherwise) and FULL cards ride in
          // contents via withCachedTurnCards.
          const systemForGenerate = `${cacheable}\n${turnPrompt}`;
          const generateContents = cachedName
            ? withCachedTurnCards(turnContents, turnPrompt)
            : turnContents;

          const completed = await completeChefReply(
            generateContents,
            systemForGenerate,
            apiKey,
            ctx.restaurantId,
            (delta) => {
              controller.enqueue(encoder.encode(sseChunk({ text: delta })));
            },
            primaryModel,
            cachedName,
            maxOutputTokensForRoute(route),
          );
          const duration_ms = Date.now() - turnStartedAt;
          logChefTiming({
            path: "gemini",
            duration_ms,
            restaurantId: ctx.restaurantId,
            route,
            model: completed.model,
            cached: Boolean(cachedName),
          });
          if (!completed.text.trim()) {
            controller.enqueue(
              encoder.encode(sseChunk({ error: GUEST_ERROR })),
            );
          } else {
            const cartIds = ctx.constraints?.cartDishIds ?? [];
            const pairingTurn = hasPairingIntent(ctx.message, ctx.history);
            const pairingSubject = pairingTurn
              ? resolvePairingSubject(tagged, ctx.message)
              : null;
            let replyText = completed.text;
            if (pairingTurn && pairingSubject) {
              replyText = enforceCuratedPairingsInChefReply({
                text: completed.text,
                cartIds,
                subjectDishId: String(pairingSubject.id ?? ""),
                clearWhenEmpty: true,
                noAlcohol: Boolean(constraints.noAlcohol),
                dishes: dishes.map((dish) => ({
                  id: String(dish.id ?? ""),
                  category_id: "",
                  name: dish.name,
                  price: Number(dish.price) || 0,
                  image_url: null,
                  is_available: dish.is_available !== false,
                  description: dish.description,
                  ingredients: dish.ingredients,
                  wine_pairing: dish.wine_pairing,
                  pairing_dish_ids: dish.pairing_dish_ids,
                  category: dish.category ?? "",
                })),
              });
            } else if (!pairingTurn) {
              replyText = enforceCuratedPairingsInChefReply({
                text: completed.text,
                cartIds,
                lastAddedId: cartIds[cartIds.length - 1] ?? null,
                noAlcohol: Boolean(constraints.noAlcohol),
                dishes: dishes.map((dish) => ({
                  id: String(dish.id ?? ""),
                  category_id: "",
                  name: dish.name,
                  price: Number(dish.price) || 0,
                  image_url: null,
                  is_available: dish.is_available !== false,
                  description: dish.description,
                  ingredients: dish.ingredients,
                  wine_pairing: dish.wine_pairing,
                  pairing_dish_ids: dish.pairing_dish_ids,
                  category: dish.category ?? "",
                })),
              });
            }
            const polished = polishGeorgianGrammar(replyText);
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
                          cached: Boolean(cachedName),
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
