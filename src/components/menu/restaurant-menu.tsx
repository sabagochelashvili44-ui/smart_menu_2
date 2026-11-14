"use client";

import { DishCardImage, DishNutritionFacts } from "@/components/guest/dish-card";
import { AiChatbot } from "@/components/menu/ai-chatbot";
import { ChefNavBubble } from "@/components/menu/digital-host-widget";
import { CartDrawer } from "@/components/menu/cart-drawer";
import { cartSubtotal } from "@/components/menu/guest-cart";
import { useSharedTableCart } from "@/components/menu/use-shared-table-cart";
import { GuestTicketStatus, type GuestTicket } from "@/components/menu/guest-ticket-status";
import { useGuestWeather } from "@/components/menu/use-guest-weather";
import { useLiveGuestMenu } from "@/components/menu/use-live-guest-menu";
import { CrossSellSection } from "@/components/menu/cross-sell-section";
import { QuantityStepper } from "@/components/menu/quantity-stepper";
import { ServiceFeedbackDialog } from "@/components/menu/service-feedback-dialog";
import { WaiterRequestDialog } from "@/components/menu/waiter-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  allergenLabel,
  dishDescription,
  categoryNameFromFields,
  dishDescriptionFromFields,
  dishLabel,
  dishNameFromFields,
  formatGel,
  formatGuestTableLabel,
  ingredientLabel,
  storedLocaleText,
  type MenuLocale,
  ui,
} from "@/lib/menu-copy";
import { useMenuTranslations } from "@/lib/use-menu-translations";
import { type CrossSellDish } from "@/lib/cross-sell";
import {
  availablePours,
  priceForPour,
  type DrinkPour,
} from "@/lib/menu-lane";
import { emptyDietFilter, type DietFilter } from "@/lib/guest-diet";
import { pickContextUpsells } from "@/lib/recommendations";
import { looksLikeCulinaryQuestion } from "@/lib/host-query";
import {
  bindGuestIntentSession,
  setDishAttention,
  trackGuestIntent,
  trackOffMenuRequest,
} from "@/lib/guest-intent";
import {
  cartTotals,
  parseServiceFeePercent,
  restaurantGoogleMapsUrl,
  syncServiceFeeLine,
} from "@/lib/service-fee";
import type { RestaurantAiPrompt } from "@/lib/restaurant-ai-prompts-shared";
import type { WaiterCallType } from "@/lib/waiter-call-types";
import { BellIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type MenuRestaurant = {
  id: string;
  name: string;
  logo: string | null;
  google_review_url?: string | null;
  google_maps_review_url?: string | null;
  service_fee_percent?: number | null;
};

export type MenuTable = {
  id: string;
  table_number: string;
};

export type MenuCategory = {
  id: string;
  name: string;
  order_index: number;
  name_en?: string | null;
  name_ru?: string | null;
};

export type MenuDish = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  bottle_price?: number | null;
  glass_price?: number | null;
  image_url: string | null;
  allergens: string[] | null;
  is_available: boolean;
  ingredients?: string[] | null;
  wine_pairing?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  prep_minutes?: number | null;
  name_en?: string | null;
  name_ru?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
};

export function RestaurantMenu({
  restaurant,
  table,
  categories: initialCategories,
  dishes: initialDishes,
  quickPrompts = null,
}: {
  restaurant: MenuRestaurant;
  table: MenuTable | null;
  categories: MenuCategory[];
  dishes: MenuDish[];
  quickPrompts?: RestaurantAiPrompt[] | null;
}) {
  const { categories, dishes, offline } = useLiveGuestMenu(
    restaurant.id,
    initialCategories,
    initialDishes,
  );
  const [locale, setLocaleState] = useState<MenuLocale>("ka");
  const copy = ui[locale];
  const translationPhrases = useMemo(() => {
    const phrases: string[] = [];
    for (const category of categories) {
      if (!storedLocaleText(locale, category.name_en, category.name_ru)) {
        phrases.push(category.name);
      }
    }
    for (const dish of dishes) {
      if (!storedLocaleText(locale, dish.name_en, dish.name_ru)) {
        phrases.push(dish.name);
      }
      if (
        dish.description &&
        !storedLocaleText(locale, dish.description_en, dish.description_ru)
      ) {
        phrases.push(dish.description);
      }
      for (const ingredient of dish.ingredients ?? []) phrases.push(ingredient);
      for (const allergen of dish.allergens ?? []) phrases.push(allergen);
    }
    return phrases;
  }, [categories, dishes, locale]);
  const { translating, translate } = useMenuTranslations(
    locale,
    translationPhrases,
    restaurant.id,
  );
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const clearChatPrompt = useCallback(() => setChatPrompt(null), []);
  const [cartOpen, setCartOpen] = useState(false);
  const tableCart = useSharedTableCart(restaurant.id, table?.id ?? null);
  const cart = tableCart.lines;
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const callingRef = useRef(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [ticketSeed, setTicketSeed] = useState<GuestTicket | null>(null);
  const [diet, setDiet] = useState<DietFilter>(emptyDietFilter);
  const context = useGuestWeather();
  const dockRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(168);
  const [vvBottom, setVvBottom] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem("smart-ai-menu-guest-lang");
    if (stored === "ka" || stored === "en" || stored === "ru") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    return bindGuestIntentSession(restaurant.id, table?.id);
  }, [restaurant.id, table?.id]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
      );
      setVvBottom(inset);
      document.documentElement.style.setProperty("--vv-bottom", `${inset}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--vv-bottom");
    };
  }, []);

  useEffect(() => {
    const dock = dockRef.current;
    const chrome = chromeRef.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = Math.ceil(dock.getBoundingClientRect().height);
      const top = chrome ? Math.ceil(chrome.getBoundingClientRect().height) : 0;
      if (next > 0) {
        setDockHeight(next);
        document.documentElement.style.scrollPaddingBottom = `${next + vvBottom + 24}px`;
      }
      if (top > 0) {
        document.documentElement.style.scrollPaddingTop = `${top + 8}px`;
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    if (chrome) observer.observe(chrome);
    return () => {
      observer.disconnect();
      document.documentElement.style.scrollPaddingBottom = "";
      document.documentElement.style.scrollPaddingTop = "";
    };
  }, [vvBottom]);

  function openHost(prompt?: string) {
    if (offline) return;
    const next = prompt?.trim();
    setChatPrompt(next ? next : null);
    setChatOpen(true);
  }

  function setActiveLanguage(next: MenuLocale) {
    setLocaleState(next);
    window.localStorage.setItem("smart-ai-menu-guest-lang", next);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    setLastAddedId(null);
    setChatOpen(false);
    setChatPrompt(null);
    setDiet(emptyDietFilter());
    setNotice(null);
    setTicketSeed(null);
  }, [restaurant.id]);

  useEffect(() => {
    if (!notice || noticeError) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice, noticeError]);

  useEffect(() => {
    if (!offline) return;
    setChatOpen(false);
    setChatPrompt(null);
    setRequestOpen(false);
  }, [offline]);

  const categoriesWithDishes = useMemo(
    () =>
      categories.filter((category) =>
        dishes.some((dish) => dish.category_id === category.id),
      ),
    [categories, dishes],
  );

  useEffect(() => {
    if (activeCategory === "all") return;
    if (!categoriesWithDishes.some((category) => category.id === activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, categoriesWithDishes]);

  const visibleDishes = useMemo(() => {
    const query = searchQuery.trim();
    const pool =
      query || activeCategory === "all"
        ? dishes
        : dishes.filter((dish) => dish.category_id === activeCategory);
    if (!query) return pool;
    return pool.filter((dish) => dishMatchesQuery(dish, query));
  }, [activeCategory, dishes, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) return;
    const timer = window.setTimeout(() => {
      if (visibleDishes.length > 0) return;
      trackOffMenuRequest({
        restaurantId: restaurant.id,
        tableId: table?.id,
        source: "search",
        query,
        dishes,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dishes, restaurant.id, searchQuery, table?.id, visibleDishes.length]);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cartSubtotal(cart);
  const totals = cartTotals(
    subtotal,
    parseServiceFeePercent(restaurant.service_fee_percent),
  );
  const total = totals.grandTotal;
  const upsell = useMemo(
    () =>
      pickContextUpsells({
        dishes,
        categories,
        cart: cart.map((line) => ({
          id: line.dishId ?? line.id,
          quantity: line.quantity,
        })),
        diet,
        context,
        lastAddedId,
        locale,
        limit: 3,
      }),
    [cart, categories, context, diet, dishes, lastAddedId, locale],
  );
  const recommendations = upsell.items;
  const soldOutIds = useMemo(
    () =>
      new Set(
        dishes.filter((dish) => !dish.is_available).map((dish) => dish.id),
      ),
    [dishes],
  );

  function quantityFor(dishId: string, pour?: DrinkPour) {
    return cart
      .filter(
        (line) =>
          (line.dishId ?? line.id) === dishId &&
          (pour ? line.pour === pour : true),
      )
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  function draftQuantityFor(dishId: string, pour?: DrinkPour) {
    return cart
      .filter(
        (line) =>
          (line.dishId ?? line.id) === dishId &&
          line.status !== "sent" &&
          (pour ? line.pour === pour : true),
      )
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  function addToCart(dish: MenuDish, pour?: DrinkPour) {
    if (!dish.is_available || offline) return;
    const unitPrice = priceForPour(dish, pour);
    trackGuestIntent({
      restaurantId: restaurant.id,
      tableId: table?.id,
      eventType: "cart_add",
      dishId: dish.id,
      dishName: dish.name,
      categoryId: dish.category_id,
      unitPrice,
    });
    tableCart.addDish({
      id: dish.id,
      name: dish.name,
      price: unitPrice,
      pour,
    });
    setLastAddedId(dish.id);
  }

  function addRecommendation(dish: CrossSellDish) {
    const full = dishes.find((item) => item.id === dish.id);
    if (!full) return;
    addToCart(full);
  }

  function changeQuantity(
    dishId: string,
    delta: number,
    dish?: MenuDish,
    pour?: DrinkPour,
  ) {
    if (delta > 0 && (soldOutIds.has(dishId) || offline)) return;
    if (delta < 0 && draftQuantityFor(dishId, pour) < 1) return;
    if (delta > 0) {
      const source = dish ?? dishes.find((item) => item.id === dishId);
      if (!source) return;
      addToCart(source, pour);
      return;
    }
    tableCart.decreaseDish(dishId, pour);
    if (quantityFor(dishId) + delta < 1) {
      setLastAddedId((current) => (current === dishId ? null : current));
    }
    setNotice(null);
  }

  function updateLineNote(lineId: string, note: string) {
    tableCart.setLineNote(lineId, note);
  }

  function removeFromCart(lineId: string) {
    const line = cart.find((item) => item.id === lineId);
    tableCart.removeLine(lineId);
    if (line && quantityFor(line.dishId ?? line.id) <= line.quantity) {
      setLastAddedId((current) =>
        current === (line.dishId ?? line.id) ? null : current,
      );
    }
    setNotice(null);
  }

  function hasUnsentCart() {
    return cart.some((line) => line.status !== "sent");
  }

  function requestWaiterOrMenu() {
    if (hasUnsentCart()) {
      setCartOpen(false);
      void callWaiter("call_waiter");
      return;
    }
    setCartOpen(false);
    setRequestOpen(true);
  }

  async function callWaiter(callType: WaiterCallType) {
    if (!table || callingRef.current || calling || offline) return;
    callingRef.current = true;
    setCalling(true);
    setNotice(null);
    try {
      const flushed =
        callType === "call_waiter" ? await tableCart.flush() : [];
      const flushedDrafts = flushed.filter((line) => line.status !== "sent");
      const localDrafts = cart.filter((line) => line.status !== "sent");
      const orderLines =
        flushedDrafts.length > 0
          ? flushedDrafts
          : localDrafts.length > 0
            ? localDrafts
            : flushedDrafts;
      const res = await fetch("/api/waiter-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          table_id: table.id,
          table_number: table.table_number,
          call_type: callType,
          items:
            callType === "call_waiter"
              ? syncServiceFeeLine(
                  orderLines.map((line) => ({
                    dish_id: line.dishId ?? line.id,
                    name: line.name,
                    quantity: line.quantity,
                    unit_price: line.price,
                    ...(line.note?.trim()
                      ? { note: line.note.trim().slice(0, 200) }
                      : {}),
                    ...(line.pour ? { pour: line.pour } : {}),
                  })),
                  totals.percent,
                  copy.serviceFee(totals.percent),
                )
              : [],
        }),
      });
      const json = (await res.json()) as {
        call?: {
          id: string;
          status?: string;
          call_type?: WaiterCallType;
          created_at?: string;
        };
        error?: string;
      };
      if (!res.ok || !json.call) {
        setNoticeError(true);
        setNotice(
          json.error === "Cart is empty."
            ? copy.cartEmpty
            : (json.error ?? copy.callFail),
        );
        return;
      }
      setRequestOpen(false);
      setNoticeError(false);
      setNotice(copy.requestSent);
      void tableCart.refresh();
      if (callType === "call_waiter" || callType === "clean_table") {
        setTicketSeed({
          id: json.call.id,
          status: json.call.status ?? "open",
          call_type: json.call.call_type ?? callType,
          created_at: json.call.created_at ?? new Date().toISOString(),
          stage: "sent",
        });
      }
      if (callType === "bill_card" || callType === "bill_cash") {
        setFeedbackOpen(true);
      }
    } catch {
      setNoticeError(true);
      setNotice(copy.callFail);
    } finally {
      callingRef.current = false;
      setCalling(false);
    }
  }

  return (
    <div
      className="bg-background flex min-h-full flex-col"
      style={{ paddingBottom: dockHeight + vvBottom + 24 }}
    >
      <div
        ref={chromeRef}
        className="bg-background/95 sticky top-0 z-20 border-b border-secondary/30 backdrop-blur"
      >
      <header className="px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {restaurant.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.logo}
              alt=""
              className="size-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full text-lg font-semibold">
              {restaurant.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {restaurant.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatGuestTableLabel(copy.table, table?.table_number)}
            </p>
          </div>
          <div className="flex shrink-0 gap-1" role="group" aria-label={copy.language}>
            {(["ka", "en", "ru"] as const).map((code) => (
              <Button
                key={code}
                type="button"
                size="sm"
                variant={locale === code ? "default" : "outline"}
                className="min-w-9 px-2"
                onClick={() => setActiveLanguage(code)}
              >
                {code.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {offline ? (
        <div
          role="status"
          className="border-t border-amber-500/40 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950"
        >
          {copy.offlineBanner}
        </div>
      ) : null}

      {dishes.length > 0 ? (
      <div className="border-t border-secondary/30 px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{copy.searchAria}</span>
            <SearchIcon
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (!looksLikeCulinaryQuestion(searchQuery)) return;
                event.preventDefault();
                openHost(searchQuery);
              }}
              placeholder={copy.searchPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 rounded-xl border-primary/15 bg-muted/40 pr-20 pl-10 text-sm md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
              {looksLikeCulinaryQuestion(searchQuery) && !offline ? (
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full text-[#8b5a1a]"
                  onClick={() => openHost(searchQuery)}
                  aria-label={copy.hostAskCta}
                >
                  <SparklesIcon className="size-4" />
                </button>
              ) : null}
              {searchQuery ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-full"
                  onClick={() => setSearchQuery("")}
                  aria-label={copy.searchClear}
                >
                  <XIcon className="size-4" />
                </button>
              ) : null}
            </span>
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip
              label={copy.all}
              active={Boolean(searchQuery.trim()) || activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            />
            {categoriesWithDishes.map((category) => (
              <FilterChip
                key={category.id}
                label={
                  storedLocaleText(locale, category.name_en, category.name_ru) ||
                  (categoryNameFromFields(category, locale) !== category.name
                    ? categoryNameFromFields(category, locale)
                    : translate(category.name))
                }
                active={activeCategory === category.id && !searchQuery.trim()}
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory(category.id);
                }}
              />
            ))}
          </div>
          {looksLikeCulinaryQuestion(searchQuery) && !offline ? (
            <button
              type="button"
              onClick={() => openHost(searchQuery)}
              className="text-left text-xs font-medium tracking-wide text-[#8b5a1a]"
            >
              {copy.hostAskCta}
            </button>
          ) : null}
        </div>
      </div>
      ) : null}
      </div>

      {translating && locale !== "ka" ? (
        <p className="text-muted-foreground mx-auto w-full max-w-lg px-4 pt-3 text-center text-xs">
          {copy.translatingMenu}
        </p>
      ) : null}

      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-3">
        {visibleDishes.length === 0 ? (
          searchQuery.trim() ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-muted-foreground text-sm">{copy.searchEmpty}</p>
              {looksLikeCulinaryQuestion(searchQuery) && !offline ? (
                <Button
                  type="button"
                  size="sm"
                  className="host-gradient host-glow rounded-2xl"
                  onClick={() => openHost(searchQuery)}
                >
                  {copy.hostAskCta}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                >
                  {copy.searchClear}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {dishes.length === 0 ? copy.menuEmpty : copy.emptyCategory}
            </p>
          )
        ) : (
          visibleDishes.map((dish) => (
            <DishIntentCard
              key={dish.id}
              restaurantId={restaurant.id}
              tableId={table?.id}
              dish={dish}
            >
              <article
                data-locale={locale}
                data-tx={locale}
                className="bg-card overflow-hidden rounded-2xl border border-secondary/35 shadow-[0_1px_0_rgba(45,0,0,0.04)]"
                style={{
                  scrollMarginTop: 12,
                  scrollMarginBottom: dockHeight + 24,
                }}
              >
              <DishCardImage
                src={dish.image_url}
                alt={guestDishTitle(dish, locale, translate)}
              />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-medium leading-snug text-foreground">
                    {guestDishTitle(dish, locale, translate)}
                  </h2>
                  <div className="text-brand-price shrink-0 text-right text-base font-semibold tabular-nums">
                    {availablePours(dish).length ? (
                      <div className="space-y-0.5">
                        {dish.glass_price != null ? (
                          <p>
                            {copy.priceGlass} {formatGel(dish.glass_price)}
                          </p>
                        ) : null}
                        {dish.bottle_price != null ? (
                          <p>
                            {copy.priceBottle} {formatGel(dish.bottle_price)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p>{formatGel(dish.price)}</p>
                    )}
                  </div>
                </div>
                {dish.prep_minutes ? (
                  <p className="text-muted-foreground text-xs">
                    {copy.prepTime}: {dish.prep_minutes} {copy.prepMinutes}
                  </p>
                ) : null}
                {dish.description ||
                storedLocaleText(locale, dish.description_en, dish.description_ru) ? (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {guestDishDescription(dish, locale, translate)}
                  </p>
                ) : null}
                {(dish.ingredients ?? []).length > 0 ? (
                  <p className="text-sm leading-relaxed">
                    <span className="text-foreground font-medium">
                      {copy.ingredients}:{" "}
                    </span>
                    <span className="text-muted-foreground">
                      {(dish.ingredients ?? [])
                        .map((item) => {
                          const labeled = ingredientLabel(item, locale);
                          if (locale === "ka" || labeled !== item) return labeled;
                          return translate(item);
                        })
                        .join(", ")}
                    </span>
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {!dish.is_available ? (
                    <Badge variant="destructive">{copy.unavailable}</Badge>
                  ) : null}
                  {(dish.allergens ?? []).map((allergen) => (
                    <Badge key={allergen} variant="secondary">
                      {allergenLabel(allergen, locale)}
                    </Badge>
                  ))}
                </div>
                <DishNutritionFacts
                  dish={dish}
                  heading={copy.nutritionHeading}
                  labels={copy}
                />
                {availablePours(dish).length ? (
                  <div className="grid gap-2">
                    {availablePours(dish).map((pour) =>
                      quantityFor(dish.id, pour) > 0 ? (
                        <div key={pour} className="space-y-1">
                          <p className="text-muted-foreground text-xs">
                            {pour === "glass" ? copy.addGlass : copy.addBottle}
                          </p>
                          <QuantityStepper
                            value={quantityFor(dish.id, pour)}
                            onDecrease={() =>
                              changeQuantity(dish.id, -1, dish, pour)
                            }
                            onIncrease={() =>
                              changeQuantity(dish.id, 1, dish, pour)
                            }
                            decreaseLabel={copy.decreaseQty}
                            increaseLabel={copy.increaseQty}
                            disabledIncrease={!dish.is_available || offline}
                            disabledDecrease={draftQuantityFor(dish.id, pour) < 1}
                          />
                        </div>
                      ) : (
                        <Button
                          key={pour}
                          type="button"
                          className="w-full"
                          disabled={!dish.is_available || offline}
                          onClick={() => addToCart(dish, pour)}
                        >
                          {dish.is_available
                            ? `${pour === "glass" ? copy.addGlass : copy.addBottle} · ${formatGel(priceForPour(dish, pour))}`
                            : copy.soldOut}
                        </Button>
                      ),
                    )}
                  </div>
                ) : quantityFor(dish.id) > 0 ? (
                  <QuantityStepper
                    value={quantityFor(dish.id)}
                    onDecrease={() => changeQuantity(dish.id, -1)}
                    onIncrease={() => {
                      trackGuestIntent({
                        restaurantId: restaurant.id,
                        tableId: table?.id,
                        eventType: "cart_add",
                        dishId: dish.id,
                        dishName: dish.name,
                        categoryId: dish.category_id,
                        unitPrice: Number(dish.price),
                      });
                      changeQuantity(dish.id, 1, dish);
                    }}
                    decreaseLabel={copy.decreaseQty}
                    increaseLabel={copy.increaseQty}
                    disabledIncrease={!dish.is_available || offline}
                    disabledDecrease={draftQuantityFor(dish.id) < 1}
                  />
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!dish.is_available || offline}
                    onClick={() => addToCart(dish)}
                  >
                    {dish.is_available ? copy.addToCart : copy.soldOut}
                  </Button>
                )}
              </div>
            </article>
              {lastAddedId === dish.id && recommendations.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-secondary/30 bg-muted/40 p-3">
                  <CrossSellSection
                    compact
                    heading={upsell.heading}
                    items={recommendations}
                    locale={locale}
                    copy={copy}
                    onAdd={addRecommendation}
                    disabled={offline}
                  />
                </div>
              ) : null}
            </DishIntentCard>
          ))
        )}
      </main>

      {notice ? (
        <div
          className={
            noticeError
              ? "border-destructive/30 bg-background text-destructive fixed inset-x-4 z-30 mx-auto max-w-lg rounded-xl border px-4 py-3 text-sm shadow-lg"
              : "bg-background fixed inset-x-4 z-30 mx-auto max-w-lg rounded-xl border border-emerald-500/30 px-4 py-3 text-sm text-emerald-800 shadow-lg"
          }
          style={{ bottom: dockHeight + vvBottom + 12 }}
        >
          {notice}
        </div>
      ) : null}

      <div
        className="pointer-events-none fixed inset-x-0 z-20"
        style={{ bottom: vvBottom }}
      >
        <div
          ref={dockRef}
          className="pointer-events-auto mx-auto flex max-w-md flex-col gap-2 rounded-t-3xl border-t bg-[#FAF6F0] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
        >
          {table ? (
            <GuestTicketStatus
              restaurantId={restaurant.id}
              tableId={table.id}
              locale={locale}
              copy={copy}
              seed={ticketSeed}
            />
          ) : null}
          <button
            type="button"
            className="flex items-start justify-between gap-3 text-left"
            onClick={() => setCartOpen(true)}
          >
            <span className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">
                {itemCount === 0 ? copy.cartEmpty : copy.items(itemCount)}
              </p>
              <p className="text-muted-foreground line-clamp-1 text-xs">
                {cart.length
                  ? cart
                      .map(
                        (line) =>
                          `${line.quantity}× ${translate(line.name)}`,
                      )
                      .join(" · ")
                  : copy.cartHint}
              </p>
            </span>
            <p className="text-brand-price shrink-0 self-center text-base font-semibold tabular-nums">
              {formatGel(total)}
            </p>
          </button>
          <ChefNavBubble
            text={copy.chefWidgetBubble}
            chatOpen={chatOpen}
            onOpen={() => openHost()}
          />
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              disabled={offline}
              onClick={() => openHost()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#D4AF37] bg-[#FAF6F0] py-3 text-[#5A121A] shadow-sm disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/chef-icon.png"
                alt="შეფ-ასისტენტი"
                className="h-8 w-8 object-contain"
              />
              <span className="min-w-0 truncate text-xs font-bold">
                {copy.chefAssistant}
              </span>
            </button>
            <button
              type="button"
              disabled={!table || calling || offline}
              onClick={requestWaiterOrMenu}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5A121A] py-3 text-white shadow-sm disabled:opacity-60"
            >
              <BellIcon className="size-4 shrink-0" />
              <span className="min-w-0 truncate text-xs font-bold">
                {calling ? copy.sending : copy.callWaiter}
              </span>
            </button>
          </div>
        </div>
      </div>

      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        total={total}
        totals={totals}
        tableLabel={
          table ? formatGuestTableLabel(copy.table, table.table_number) : copy.noTable
        }
        copy={copy}
        locale={locale}
        calling={calling}
        canCall={Boolean(table) && !offline}
        onIncrease={(id) => {
          const line = cart.find((item) => item.id === id);
          if (!line) return;
          if (line.status === "sent") {
            const dish = dishes.find((item) => item.id === (line.dishId ?? line.id));
            if (dish) changeQuantity(dish.id, 1, dish);
            return;
          }
          tableCart.setLineQuantity(id, line.quantity + 1);
        }}
        onDecrease={(id) => {
          const line = cart.find((item) => item.id === id);
          if (!line || line.status === "sent") return;
          tableCart.setLineQuantity(id, line.quantity - 1);
        }}
        onRemove={removeFromCart}
        onNoteChange={updateLineNote}
        onCallWaiter={requestWaiterOrMenu}
        soldOutIds={soldOutIds}
        actionsDisabled={offline}
        shared={tableCart.shared}
        recommendations={recommendations}
        recommendationHeading={upsell.heading}
        onAddRecommendation={addRecommendation}
      />

      <WaiterRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        locale={locale}
        copy={copy}
        sending={calling}
        onSelect={(type) => void callWaiter(type)}
        cart={cart}
        total={total}
        totals={totals}
        recommendations={recommendations}
        recommendationHeading={upsell.heading}
        onAddRecommendation={addRecommendation}
        actionsDisabled={offline}
      />

      {table ? (
        <ServiceFeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          restaurantId={restaurant.id}
          tableId={table.id}
          tableNumber={table.table_number}
          googleReviewUrl={restaurantGoogleMapsUrl(restaurant)}
          locale={locale}
        />
      ) : null}

      <AiChatbot
        key={restaurant.id}
        open={chatOpen}
        onOpenChange={setChatOpen}
        onDietChange={setDiet}
        restaurantId={restaurant.id}
        tableId={table?.id}
        restaurantName={restaurant.name}
        quickPrompts={quickPrompts}
        serviceFeePercent={totals.percent}
        dishes={dishes.map((dish) => ({
          ...dish,
          category:
            categories.find((category) => category.id === dish.category_id)
              ?.name ?? "",
        }))}
        locale={locale}
        pendingPrompt={chatPrompt}
        onPendingPromptConsumed={clearChatPrompt}
        quantityFor={quantityFor}
        cartIds={cart.map((line) => line.dishId ?? line.id)}
        companionSuggestions={recommendations}
        companionMix={upsell.mix}
        onAddToCart={(dish) => {
          const full = dishes.find((item) => item.id === dish.id);
          if (full) addToCart(full);
        }}
        onChangeQuantity={(dish, delta) => {
          const full = dishes.find((item) => item.id === dish.id);
          if (full) changeQuantity(full.id, delta, full);
        }}
        onRemoveFromCart={removeFromCart}
      />
    </div>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function guestDishTitle(
  dish: MenuDish,
  locale: MenuLocale,
  translate: (text: string) => string,
) {
  const stored = storedLocaleText(locale, dish.name_en, dish.name_ru);
  if (stored) return stored;
  const labeled = dishNameFromFields(dish, locale);
  if (locale === "ka" || labeled !== dish.name) return labeled;
  return translate(dish.name);
}

function guestDishDescription(
  dish: MenuDish,
  locale: MenuLocale,
  translate: (text: string) => string,
) {
  const stored = storedLocaleText(
    locale,
    dish.description_en,
    dish.description_ru,
  );
  if (stored) return stored;
  const labeled = dishDescriptionFromFields(dish, locale);
  if (labeled) return labeled;
  return dish.description ? translate(dish.description) : "";
}

function dishMatchesQuery(dish: MenuDish, query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return true;

  const fields = [
    dish.name,
    dish.description,
    dish.name_en,
    dish.name_ru,
    dish.description_en,
    dish.description_ru,
    dishLabel(dish.name, "ka"),
    dishLabel(dish.name, "en"),
    dishLabel(dish.name, "ru"),
    dishDescription(dish.name, dish.description, "ka"),
    dishDescription(dish.name, dish.description, "en"),
    dishDescription(dish.name, dish.description, "ru"),
    ...(dish.ingredients ?? []),
    ...(dish.ingredients ?? []).map((item) => ingredientLabel(item, "en")),
    ...(dish.ingredients ?? []).map((item) => ingredientLabel(item, "ru")),
  ];

  return fields.some((field) => normalizeSearch(field ?? "").includes(needle));
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="shrink-0"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function DishIntentCard({
  restaurantId,
  tableId,
  dish,
  children,
}: {
  restaurantId: string;
  tableId?: string;
  dish: MenuDish;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setDishAttention({
          dishId: dish.id,
          dishName: dish.name,
          categoryId: dish.category_id,
          unitPrice: Number(dish.price),
          visible: Boolean(entry?.isIntersecting),
        });
      },
      { threshold: 0.55 },
    );
    observer.observe(node);
    return () => {
      setDishAttention({
        dishId: dish.id,
        dishName: dish.name,
        categoryId: dish.category_id,
        visible: false,
      });
      observer.disconnect();
    };
  }, [dish.category_id, dish.id, dish.name, dish.price, restaurantId, tableId]);

  return <div ref={ref}>{children}</div>;
}
