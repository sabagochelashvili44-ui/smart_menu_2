"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ChatDishDetailsDialog } from "@/components/menu/chat-dish-details";
import { QuantityStepper } from "@/components/menu/quantity-stepper";
import { readAiWaiterReply } from "@/lib/ai-waiter-client";
import {
  dishesForLiveStock,
  dishesFromIds,
  matchDishesInReply,
  menuHasDessert,
  menuHasDrink,
  menuHasKhinkali,
  menuHasKids,
  isChefRecommendTurn,
  pairingLine,
  parseChefReply,
  pickQuizDishes,
  shouldSuppressAlcohol,
  visibleChefText,
  type ChatSuggestDish,
} from "@/lib/chat-suggestions";
import type { FlavorCourse } from "@/lib/flavor-pairing";
import {
  fillChefRecommendationCards,
  type RecommendableDish,
} from "@/lib/recommendations";
import {
  emptyDietFilter,
  type DietFilter,
} from "@/lib/guest-diet";
import { guestNutritionLine } from "@/lib/dish-nutrition";
import { currentGuestSessionId } from "@/lib/guest-intent";
import { dishLabel, formatGel, type MenuLocale, ui } from "@/lib/menu-copy";
import {
  promptChipLabel,
  type RestaurantAiPrompt,
} from "@/lib/restaurant-ai-prompts-shared";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { SendIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type ChatDish = ChatSuggestDish;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  dishes?: ChatDish[];
  localNotice?: boolean;
};

type FilterTag = "gluten" | "dairy" | "nuts" | "budget_25" | "party_2";

function deriveDietFromFilters(filters: FilterTag[], current: DietFilter): DietFilter {
  const blockedAllergens = filters.filter(
    (tag): tag is "gluten" | "dairy" | "nuts" =>
      tag === "gluten" || tag === "dairy" || tag === "nuts",
  );
  return {
    ...current,
    blockedAllergens,
  };
}

type QuizStep = "protein" | "appetite" | null;

const CHEF_SRC = "/chef-icon.png";

function ChefAvatar({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const height = size === "sm" ? "h-10" : "h-12";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- full uncropped chef illustration
    <img
      src={CHEF_SRC}
      alt=""
      className={`${height} w-auto max-w-none object-contain object-bottom drop-shadow-sm ${className}`}
    />
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto whitespace-nowrap">
      {children}
    </div>
  );
}

function ChatChip({
  active = false,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      aria-pressed={active}
      variant={active ? "default" : "outline"}
      className="h-8 shrink-0 rounded-full px-3 text-xs"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ChatDishCard({
  dish,
  locale,
  copy,
  quantity,
  skipAlcohol,
  serviceFeePercent = 0,
  onAdd,
  onChangeQuantity,
  onRemove,
  onOpenDetails,
}: {
  dish: ChatDish;
  locale: MenuLocale;
  copy: (typeof ui)[MenuLocale];
  quantity: number;
  skipAlcohol: boolean;
  serviceFeePercent?: number;
  onAdd?: (dish: ChatDish) => void;
  onChangeQuantity?: (dish: ChatDish, delta: number) => void;
  onRemove?: (dishId: string) => void;
  onOpenDetails?: (dish: ChatDish) => void;
}) {
  const title = dishLabel(dish.name, locale);
  const pairing = pairingLine(
    dish,
    copy.pairKhinkali,
    copy.pairWith,
    skipAlcohol,
  );
  const nutrition = guestNutritionLine(dish, copy);
  const inCart = quantity > 0;
  const canEdit = dish.is_available !== false && (onAdd || onChangeQuantity);
  const safeFee = Math.max(0, Math.min(100, Number(serviceFeePercent) || 0));
  const totalWithFee =
    safeFee > 0
      ? Math.round(dish.price * (1 + safeFee / 100) * 100) / 100
      : dish.price;

  return (
    <article className="bg-background mt-2 overflow-hidden rounded-xl border shadow-sm">
      <div className="flex gap-3 p-2">
        <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
          {dish.image_url?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element -- compact chat thumbnail
            <img
              src={dish.image_url}
              alt={title}
              className="size-full object-contain"
            />
          ) : (
            <div className="from-muted to-secondary/30 size-full bg-linear-to-br" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-brand-price text-sm font-medium tabular-nums">
            {formatGel(dish.price)}
            {safeFee > 0 ? (
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                ({copy.serviceFee(safeFee)}: {formatGel(totalWithFee)})
              </span>
            ) : null}
          </p>
          {nutrition ? (
            <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">
              {nutrition}
            </p>
          ) : null}
          {dish.pairReason ? (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug">
              {dish.pairReason}
            </p>
          ) : pairing ? (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug">
              {pairing}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5 px-2 pb-2">
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 min-w-0 flex-1 rounded-lg text-xs"
            onClick={() => onOpenDetails?.(dish)}
          >
            {copy.detailsFromChat}
          </Button>
          {canEdit && !inCart ? (
            <Button
              type="button"
              size="sm"
              className="h-8 min-w-0 flex-1 rounded-lg text-xs"
              onClick={() => onAdd?.(dish)}
            >
              {copy.addFromChat}
            </Button>
          ) : null}
        </div>
        {canEdit && inCart ? (
          <>
            <QuantityStepper
              value={quantity}
              decreaseLabel={copy.decreaseQty}
              increaseLabel={copy.increaseQty}
              onDecrease={() => onChangeQuantity?.(dish, -1)}
              onIncrease={() => onChangeQuantity?.(dish, 1)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive h-8 w-full text-xs"
              onClick={() => onRemove?.(dish.id)}
            >
              {copy.removeFromChat}
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function withAllergenNote(
  text: string,
  diet: DietFilter,
  lastUser: string,
  note: string,
) {
  const needed =
    diet.blockedAllergens.length > 0 ||
    /გლუტენ|რძის ნაწარმ|ნიგვზ|თხილ|allerg|gluten|dairy|nut-free|глютен|молочн|орех/i.test(
      lastUser,
    );
  if (!needed || text.includes(note.slice(0, 24))) return text;
  return `${text}\n\n${note}`;
}

export function AiChatbot({
  open,
  onOpenChange,
  restaurantId,
  tableId,
  restaurantName,
  serviceFeePercent = 0,
  quickPrompts = null,
  dishes,
  locale,
  onDietChange,
  pendingPrompt,
  onPendingPromptConsumed,
  onAddToCart,
  quantityFor,
  onChangeQuantity,
  onRemoveFromCart,
  cartIds = [],
  companionSuggestions = [],
  companionMix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId?: string;
  tableId?: string | null;
  restaurantName: string;
  serviceFeePercent?: number;
  quickPrompts?: RestaurantAiPrompt[] | null;
  dishes: ChatDish[];
  locale: MenuLocale;
  onDietChange?: (diet: DietFilter) => void;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  onAddToCart?: (dish: ChatDish) => void;
  quantityFor?: (dishId: string) => number;
  onChangeQuantity?: (dish: ChatDish, delta: number) => void;
  onRemoveFromCart?: (dishId: string) => void;
  cartIds?: string[];
  companionSuggestions?: RecommendableDish[];
  companionMix?: FlavorCourse[];
}) {
  const copy = ui[locale];
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [quizStep, setQuizStep] = useState<QuizStep>(null);
  const [quizVeg, setQuizVeg] = useState(false);
  const [diet, setDiet] = useState<DietFilter>(emptyDietFilter);
  const [activeFilters, setActiveFilters] = useState<FilterTag[]>([]);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [partySize, setPartySize] = useState<number | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: copy.waiterIntro(restaurantName) },
  ]);
  const [detailDish, setDetailDish] = useState<ChatDish | null>(null);
  const detailsOpen = Boolean(detailDish);
  useBodyScrollLock(open || detailsOpen);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const pendingRef = useRef(false);
  const inputRef = useRef(input);
  const dietRef = useRef(diet);
  const activeFiltersRef = useRef<FilterTag[]>(activeFilters);
  const maxPriceRef = useRef(maxPrice);
  const partySizeRef = useRef(partySize);
  const dishesRef = useRef(dishes);

  messagesRef.current = messages;
  pendingRef.current = pending;
  inputRef.current = input;
  dietRef.current = diet;
  activeFiltersRef.current = activeFilters;
  maxPriceRef.current = maxPrice;
  partySizeRef.current = partySize;
  dishesRef.current = dishes;

  useEffect(() => {
    setMessages((current) => {
      if (current.length <= 1 && current[0]?.role === "assistant") {
        return [{ role: "assistant", content: copy.waiterIntro(restaurantName) }];
      }
      return [
        { role: "assistant", content: copy.waiterIntro(restaurantName) },
        ...current.slice(1),
      ];
    });
  }, [copy, restaurantName]);

  useEffect(() => {
    const intro: ChatMessage = {
      role: "assistant",
      content: copy.waiterIntro(restaurantName),
    };
    messagesRef.current = [intro];
    setMessages([intro]);
    setQuizStep(null);
    setQuizVeg(false);
    setDiet(emptyDietFilter());
    setActiveFilters([]);
    setMaxPrice(undefined);
    setPartySize(undefined);
    setInput("");
    inputRef.current = "";
    setNotice(null);
    setDetailDish(null);
    onDietChange?.(emptyDietFilter());
  }, [restaurantId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, quizStep]);

  const sendMessageRef = useRef<(raw?: string) => Promise<void>>(async () => {});

  function commitMessages(nextMessages: ChatMessage[]) {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }

  async function sendMessage(raw?: string) {
    const content = (raw ?? inputRef.current).trim();
    if (!content || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    setQuizStep(null);

    const next: ChatMessage[] = [
      ...messagesRef.current,
      { role: "user", content },
    ];
    commitMessages(next);
    setInput("");
    inputRef.current = "";

    const intro = copy.waiterIntro(restaurantName);
    const apiMessages = next
      .filter((item, idx) => {
        if (item.localNotice) return false;
        if (idx === 0 && item.role === "assistant" && item.content === intro) {
          return false;
        }
        if (item.role === "assistant" && item.content === copy.apiError) {
          return false;
        }
        return Boolean(item.content.trim());
      })
      .slice(-8)
      .map(({ role, content: text }) => ({
        role,
        content: text,
      }));

    const currentFilters = [...activeFiltersRef.current];
    const currentBlockedAllergens = currentFilters.filter(
      (tag): tag is "gluten" | "dairy" | "nuts" =>
        tag === "gluten" || tag === "dairy" || tag === "nuts",
    );
    const currentMaxPrice = currentFilters.includes("budget_25")
      ? 25
      : undefined;
    const currentPartySize = currentFilters.includes("party_2")
      ? 2
      : undefined;

    const menuContext = {
      restaurantId,
      restaurantName,
      locale,
      sessionId: currentGuestSessionId(),
      tableId: tableId ?? undefined,
      cartDishIds: cartIds,
      activeFilters: currentFilters,
      constraints: {
        activeFilters: currentFilters,
        blockedAllergens: currentBlockedAllergens,
        vegetarian: dietRef.current.vegetarian,
        vegan: dietRef.current.vegan,
        maxPrice: currentMaxPrice,
        partySize: currentPartySize,
        serviceFeePercent,
        cartDishIds: cartIds,
        noAlcohol: shouldSuppressAlcohol({
          lastUser: content,
          diet: {
            ...dietRef.current,
            blockedAllergens: currentBlockedAllergens,
          },
          maxPrice: currentMaxPrice,
        }),
      },
      selectedTag: /ხორც|მწვად|meat|steak|мяс|kebab|ქაბაბ/i.test(content)
        ? "meat"
        : undefined,
    };

    try {
      const res = await fetch("/api/ai-waiter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: apiMessages,
          activeFilters: currentFilters,
          menuContext,
        }),
      });

      const { ok, result: reply, availableIds } = await readAiWaiterReply(res, {
        onDelta(fullText) {
          const preview = visibleChefText(fullText).trim();
          if (!preview) return;
          commitMessages([
            ...next,
            { role: "assistant", content: preview },
          ]);
        },
      });
      if (!ok || !reply) {
        console.error("[ai-waiter] fetch failed", res.status);
        setNotice(copy.apiError);
        commitMessages([...next, { role: "assistant", content: copy.apiError }]);
        return;
      }
      const parsed = parseChefReply(reply);
      const spoken = withAllergenNote(
        parsed.spoken,
        dietRef.current,
        content,
        copy.allergenSafety,
      );
      if (!spoken) {
        setNotice(copy.apiError);
        commitMessages([...next, { role: "assistant", content: copy.apiError }]);
        return;
      }
      const liveDishes = dishesForLiveStock(dishesRef.current, availableIds);
      const byId = dishesFromIds(parsed.ids, liveDishes);
      const rawResolved = byId.length
        ? byId
        : matchDishesInReply(spoken, liveDishes);
      const feeMultiplier =
        1 + Math.max(0, Number(serviceFeePercent) || 0) / 100;
      const resolved = maxPriceRef.current
        ? rawResolved.filter(
            (dish) =>
              Math.round(dish.price * feeMultiplier * 100) / 100 <=
              maxPriceRef.current!,
          )
        : rawResolved;
      const shown = isChefRecommendTurn(content, parsed.ids)
        ? fillChefRecommendationCards({
            preferred: resolved.map((dish) => ({
              id: dish.id,
              category_id: dish.category_id ?? "",
              name: dish.name,
              price: dish.price,
              image_url: dish.image_url ?? null,
              is_available: dish.is_available,
              description: dish.description,
              ingredients: dish.ingredients,
              wine_pairing: dish.wine_pairing,
              pairReason: dish.pairReason,
              category: dish.category,
            })),
            companions: companionSuggestions,
            mix: companionMix ?? ["dish", "dish", "dish"],
          }).map((item) => {
            const live = liveDishes.find((dish) => dish.id === item.id);
            return live
              ? { ...live, pairReason: item.pairReason }
              : {
                  id: item.id,
                  name: item.name,
                  description: item.description ?? "",
                  price: item.price,
                  image_url: item.image_url,
                  allergens: null,
                  is_available: item.is_available,
                  pairReason: item.pairReason,
                };
          })
        : resolved;
      commitMessages([
        ...next,
        { role: "assistant", content: spoken, dishes: shown },
      ]);
    } catch (error) {
      console.error("[ai-waiter] fetch error", error);
      setNotice(copy.apiError);
      commitMessages([...next, { role: "assistant", content: copy.apiError }]);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  sendMessageRef.current = sendMessage;

  const consumedPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      consumedPromptRef.current = null;
      return;
    }
    const prompt = pendingPrompt?.trim();
    if (!prompt || consumedPromptRef.current === prompt) return;
    consumedPromptRef.current = prompt;
    onPendingPromptConsumed?.();
    void sendMessageRef.current(prompt);
  }, [open, pendingPrompt, onPendingPromptConsumed]);

  function toggleFilter(
    tag: FilterTag,
    label: string,
    autoPromptWhenAdded?: string,
  ) {
    const current = activeFiltersRef.current;
    const isSelected = current.includes(tag);
    let nextFilters: FilterTag[];

    if (isSelected) {
      nextFilters = current.filter((item) => item !== tag);
    } else if (tag === "budget_25") {
      nextFilters = [...current.filter((item) => item !== "party_2"), tag];
    } else if (tag === "party_2") {
      nextFilters = [...current.filter((item) => item !== "budget_25"), tag];
    } else {
      nextFilters = [...current, tag];
    }

    activeFiltersRef.current = nextFilters;
    setActiveFilters(nextFilters);

    const nextDiet = deriveDietFromFilters(nextFilters, dietRef.current);
    dietRef.current = nextDiet;
    setDiet(nextDiet);
    onDietChange?.(nextDiet);

    const nextMaxPrice = nextFilters.includes("budget_25") ? 25 : undefined;
    const nextPartySize = nextFilters.includes("party_2") ? 2 : undefined;
    maxPriceRef.current = nextMaxPrice;
    setMaxPrice(nextMaxPrice);
    partySizeRef.current = nextPartySize;
    setPartySize(nextPartySize);

    if (isSelected) {
      commitMessages([
        ...messagesRef.current,
        {
          role: "assistant",
          content: copy.dietRemovedNote(label),
          localNotice: true,
        },
      ]);
      return;
    }

    if (autoPromptWhenAdded) {
      void sendMessage(autoPromptWhenAdded);
      return;
    }

    commitMessages([
      ...messagesRef.current,
      {
        role: "assistant",
        content: copy.dietNote(label),
        localNotice: true,
      },
    ]);
  }

  function finishQuiz(hearty: boolean) {
    const picked = pickQuizDishes(
      dishesRef.current,
      { vegetarian: quizVeg, hearty },
      dietRef.current,
      maxPriceRef.current,
      serviceFeePercent,
    );
    setQuizStep(null);
    commitMessages([
      ...messagesRef.current,
      {
        role: "assistant",
        content: picked.length ? copy.quizPicked : copy.noCategoryDish,
        dishes: picked,
      },
    ]);
  }

  const hasMenu = dishes.some((dish) => dish.is_available !== false);
  const actionChips: { id: string; label: string; prompt: string }[] = [];
  if (hasMenu) {
    if (quickPrompts) {
      for (const prompt of quickPrompts) {
        if (!prompt.isActive) continue;
        const query = prompt.queryText.trim();
        if (!query) continue;
        actionChips.push({
          id: prompt.id,
          label: promptChipLabel(prompt),
          prompt: query,
        });
      }
    } else {
      if (menuHasDrink(dishes)) {
        actionChips.push(
          menuHasKhinkali(dishes)
            ? { id: "wine", label: copy.wine, prompt: copy.winePrompt }
            : {
                id: "wine-mains",
                label: copy.wineMains,
                prompt: copy.wineMainsPrompt,
              },
        );
      }
      actionChips.push(
        {
          id: "vegetarian",
          label: copy.vegetarian,
          prompt: copy.vegetarianPrompt,
        },
        { id: "spicy", label: copy.spicy, prompt: copy.spicyPrompt },
        {
          id: "quick-lunch",
          label: copy.chipQuickLunch,
          prompt: copy.chipQuickLunchPrompt,
        },
        {
          id: "bestsellers",
          label: copy.chipBestsellers,
          prompt: copy.chipBestsellersPrompt,
        },
      );
      if (menuHasDessert(dishes)) {
        actionChips.push({
          id: "dessert",
          label: copy.chipDessert,
          prompt: copy.chipDessertPrompt,
        });
      }
      if (menuHasKids(dishes)) {
        actionChips.push({
          id: "kids",
          label: copy.chipKids,
          prompt: copy.chipKidsPrompt,
        });
      }
      actionChips.push({
        id: "other",
        label: copy.chipOther,
        prompt: copy.chipOtherPrompt,
      });
    }
  }

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setDetailDish(null);
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        overlayClassName={
          detailsOpen
            ? "z-30 bg-transparent pointer-events-none"
            : undefined
        }
        className={`h-[88dvh] max-h-[88dvh] gap-0 overflow-hidden rounded-t-2xl p-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(42rem,88dvh)] sm:max-w-md sm:rounded-2xl sm:border ${
          detailsOpen ? "z-40" : ""
        }`}
      >
        <SheetHeader className="overflow-visible border-b px-4 pt-3 pb-2 pr-12 text-left">
          <div className="flex items-end gap-2">
            <ChefAvatar className="-mb-1" />
            <div className="min-w-0 pb-1">
              <SheetTitle className="font-medium tracking-wide">
                {copy.waiterTitle}
              </SheetTitle>
              <SheetDescription className="truncate">
                {restaurantName}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="bg-background/95 sticky top-0 z-10 shrink-0 space-y-2 border-b px-3 py-2 backdrop-blur-sm">
            <ChipRow>
            {actionChips.map((action) => (
              <ChatChip
                key={action.id}
                disabled={pending}
                onClick={() => {
                  void sendMessage(action.prompt);
                }}
              >
                {action.label}
              </ChatChip>
            ))}
            <ChatChip
              disabled={pending}
              onClick={() => {
                setQuizStep("protein");
                commitMessages([
                  ...messagesRef.current,
                  { role: "assistant", content: copy.quizQ1 },
                ]);
              }}
            >
              {copy.quizChip}
            </ChatChip>
            </ChipRow>
            <ChipRow>
            <ChatChip
              active={activeFilters.includes("gluten")}
              onClick={() => toggleFilter("gluten", copy.filterGluten)}
            >
              {copy.filterGluten}
            </ChatChip>
            <ChatChip
              active={activeFilters.includes("dairy")}
              onClick={() => toggleFilter("dairy", copy.filterDairy)}
            >
              {copy.filterDairy}
            </ChatChip>
            <ChatChip
              active={activeFilters.includes("nuts")}
              onClick={() => toggleFilter("nuts", copy.filterNuts)}
            >
              {copy.filterNuts}
            </ChatChip>
            {hasMenu ? (
              <>
            <ChatChip
              active={activeFilters.includes("budget_25")}
              disabled={pending}
              onClick={() =>
                toggleFilter(
                  "budget_25",
                  copy.budgetLunch,
                  copy.budgetLunchPrompt,
                )
              }
            >
              {copy.budgetLunch}
            </ChatChip>
            <ChatChip
              active={activeFilters.includes("party_2")}
              disabled={pending}
              onClick={() =>
                toggleFilter(
                  "party_2",
                  copy.budgetDinner,
                  copy.budgetDinnerPrompt,
                )
              }
            >
              {copy.budgetDinner}
            </ChatChip>
              </>
            ) : null}
            </ChipRow>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => {
              const lastUser = [...messages]
                .slice(0, index + 1)
                .reverse()
                .find((row) => row.role === "user")?.content ?? "";
              const skipAlcohol = shouldSuppressAlcohol({
                lastUser,
                diet,
                maxPrice,
              });
              const isAssistant = message.role === "assistant";
              return (
              <div
                key={`${message.role}-${index}`}
                className={
                  isAssistant
                    ? "flex items-end gap-2"
                    : "flex justify-end"
                }
              >
                {isAssistant ? (
                  <ChefAvatar size="sm" className="-mb-1 shrink-0" />
                ) : null}
                <div
                  className={
                    isAssistant
                      ? "bg-muted min-w-0 flex-1 rounded-2xl rounded-bl-md px-3 py-2 leading-relaxed"
                      : "bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 leading-relaxed"
                  }
                >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.dishes?.map((dish) => (
                  <ChatDishCard
                    key={`${index}-${dish.id}`}
                    dish={
                      dishes.find((item) => item.id === dish.id) ?? dish
                    }
                    locale={locale}
                    copy={copy}
                    quantity={quantityFor?.(dish.id) ?? 0}
                    skipAlcohol={skipAlcohol}
                    serviceFeePercent={serviceFeePercent}
                    onAdd={onAddToCart}
                    onChangeQuantity={onChangeQuantity}
                    onRemove={onRemoveFromCart}
                    onOpenDetails={setDetailDish}
                  />
                ))}
                </div>
              </div>
              );
            })}
            {quizStep === "protein" ? (
              <div className="flex flex-wrap gap-2">
                <ChatChip
                  onClick={() => {
                    setQuizVeg(false);
                    if (dietRef.current.vegetarian) {
                      const nextDiet = {
                        ...dietRef.current,
                        vegetarian: false,
                      };
                      dietRef.current = nextDiet;
                      setDiet(nextDiet);
                      onDietChange?.(nextDiet);
                    }
                    setQuizStep("appetite");
                    commitMessages([
                      ...messagesRef.current,
                      { role: "user", content: copy.quizMeat },
                      { role: "assistant", content: copy.quizQ2 },
                    ]);
                  }}
                >
                  {copy.quizMeat}
                </ChatChip>
                <ChatChip
                  onClick={() => {
                    setQuizVeg(true);
                    setQuizStep("appetite");
                    commitMessages([
                      ...messagesRef.current,
                      { role: "user", content: copy.quizVeg },
                      { role: "assistant", content: copy.quizQ2 },
                    ]);
                  }}
                >
                  {copy.quizVeg}
                </ChatChip>
              </div>
            ) : null}
            {quizStep === "appetite" ? (
              <div className="flex flex-wrap gap-2">
                <ChatChip onClick={() => finishQuiz(false)}>
                  {copy.quizLight}
                </ChatChip>
                <ChatChip onClick={() => finishQuiz(true)}>
                  {copy.quizHearty}
                </ChatChip>
              </div>
            ) : null}
            {pending && messages[messages.length - 1]?.role !== "assistant" ? (
              <p className="text-muted-foreground text-xs">{copy.thinking}</p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {notice ? (
            <p role="alert" className="text-destructive px-4 pb-1 text-xs">
              {notice}
            </p>
          ) : null}

          <form
            className="flex shrink-0 items-end gap-2 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(inputRef.current);
            }}
          >
            <Textarea
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                inputRef.current = event.target.value;
              }}
              placeholder={copy.waiterPlaceholder}
              className="min-h-11 max-h-28 rounded-2xl"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(inputRef.current);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={pending || !input.trim()}
              aria-label={copy.sendChat}
              className="size-11 shrink-0 rounded-full shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95"
            >
              <SendIcon className="size-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
    <ChatDishDetailsDialog
      dish={detailDish}
      open={detailsOpen}
      onOpenChange={(next) => {
        if (!next) setDetailDish(null);
      }}
      locale={locale}
      copy={copy}
      serviceFeePercent={serviceFeePercent}
      canAdd={
        Boolean(detailDish) &&
        detailDish?.is_available !== false &&
        Boolean(onAddToCart) &&
        (quantityFor?.(detailDish?.id ?? "") ?? 0) === 0
      }
      onAdd={onAddToCart}
    />
    </>
  );
}
