import "server-only";

import { GoogleGenAI } from "@google/genai";
import { polishGeorgianGrammar } from "@/lib/ai/waiter";
import { recordGeminiUsage } from "@/lib/ai-usage";

const REWRITE_TIMEOUT_MS = 8_000;
const REWRITE_MODEL = "gemini-3.6-flash";

const REWRITE_INSTRUCTION = `შენ ხარ თბილისელი შეფი და სომელიე. სტუმარს ელაპარაკები მაგიდასთან — ბუნებრივ, თავისუფალ ქართულად, როგორც მშობლიური ენა.

გადააკეთე ქვემოთ მოცემული პასუხი ისე, რომ ჟღერდეს ნატურალურად:
- თავაზიანი მრავლობითი: „თქვენ“, „გირჩევთ“, „მოგემსახურებით“.
- ქართული სიტყვათა წყობა, არა ინგლისურიდან ნათარგმნი წინადადება.
- კერძების სახელები, ფასები, პროცენტები და რიცხვები ზუსტად იგივე დატოვე.
- კერძი ნუ დაამატე და ნუ ამოიღე.
- ინგლისური ან რუსული სიტყვა ნუ ჩასვა.
- 3–4 მოკლე, სალაპარაკო წინადადება.

დააბრუნე მხოლოდ გასწორებული ქართული ტექსტი. DISH_IDS ხაზი არ დაწერო.`;

const DISH_IDS_RE = /\n?\s*\*?\*?DISH_IDS?\*?\*?:\s*[\s\S]*$/i;

function splitChefReply(text: string) {
  const match = text.match(DISH_IDS_RE);
  if (!match || match.index == null) {
    return { spoken: text.trim(), tail: "" };
  }
  return {
    spoken: text.slice(0, match.index).trim(),
    tail: text.slice(match.index).trim(),
  };
}

function georgianStems(text: string) {
  const stems = new Set<string>();
  for (const token of text.match(/[ა-ჰ]{4,}/g) ?? []) {
    stems.add(token.slice(0, 4));
  }
  return [...stems];
}

function numericTokens(text: string) {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

function isAcceptableRewrite(original: string, rewrite: string) {
  const cleaned = rewrite.replace(DISH_IDS_RE, "").trim();
  if (!cleaned || !/[\u10A0-\u10FF]/.test(cleaned)) return false;
  if (cleaned.length < original.length * 0.45) return false;
  if (cleaned.length > original.length * 1.85) return false;

  const stems = georgianStems(original);
  if (stems.length) {
    const kept = stems.filter((stem) => cleaned.includes(stem)).length;
    if (kept / stems.length < 0.7) return false;
  }

  for (const amount of numericTokens(original)) {
    if (!cleaned.includes(amount)) return false;
  }
  return true;
}

async function rewriteWithGemini(
  spoken: string,
  apiKey: string,
  restaurantId?: string,
) {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: REWRITE_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  });
  const response = await ai.models.generateContent({
    model: REWRITE_MODEL,
    contents: [{ role: "user", parts: [{ text: spoken }] }],
    config: {
      systemInstruction: REWRITE_INSTRUCTION,
      temperature: 0.4,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
    },
  });
  const text = (response.text ?? "").replace(DISH_IDS_RE, "").trim();
  if (text) {
    await recordGeminiUsage({
      restaurantId,
      feature: "rewrite",
      model: REWRITE_MODEL,
      response,
    });
  }
  return text;
}

export async function refineGeorgianNative(
  text: string,
  apiKey: string,
  restaurantId?: string,
) {
  const { spoken, tail } = splitChefReply(text);
  if (!spoken || !/[\u10A0-\u10FF]/.test(spoken)) return text;

  const polished = polishGeorgianGrammar(spoken);
  let rewritten = "";
  try {
    rewritten = await rewriteWithGemini(polished, apiKey, restaurantId);
  } catch (error) {
    console.error("[ai-waiter] georgian rewrite failed", error);
  }

  const finalSpoken = isAcceptableRewrite(polished, rewritten)
    ? polishGeorgianGrammar(rewritten)
    : polished;
  return tail ? `${finalSpoken}\n${tail}` : finalSpoken;
}
