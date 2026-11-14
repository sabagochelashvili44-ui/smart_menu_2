"use client";

import type {
  MenuCategory,
  MenuDish,
} from "@/components/menu/restaurant-menu";
import { useEffect, useState } from "react";

const POLL_MS = 5000;
const STORAGE_PREFIX = "smart-ai-menu-guest:";

function asDish(row: Record<string, unknown>): MenuDish | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    category_id: String(row.category_id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    image_url: row.image_url ? String(row.image_url) : null,
    allergens: Array.isArray(row.allergens)
      ? row.allergens.map((item) => String(item))
      : null,
    is_available: row.is_available !== false,
    ingredients: Array.isArray(row.ingredients)
      ? row.ingredients.map((item) => String(item))
      : null,
    wine_pairing: row.wine_pairing ? String(row.wine_pairing) : null,
    calories: row.calories == null ? null : Number(row.calories) || null,
    protein: row.protein == null ? null : Number(row.protein) || null,
    carbs: row.carbs == null ? null : Number(row.carbs) || null,
    fat: row.fat == null ? null : Number(row.fat) || null,
    prep_minutes:
      row.prep_minutes == null ? null : Number(row.prep_minutes) || null,
    name_en: row.name_en ? String(row.name_en) : null,
    name_ru: row.name_ru ? String(row.name_ru) : null,
    description_en: row.description_en ? String(row.description_en) : null,
    description_ru: row.description_ru ? String(row.description_ru) : null,
  };
}

function asCategory(row: Record<string, unknown>): MenuCategory | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name ?? ""),
    order_index: Number(row.order_index) || 0,
    name_en: row.name_en ? String(row.name_en) : null,
    name_ru: row.name_ru ? String(row.name_ru) : null,
  };
}

function cacheKey(restaurantId: string) {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

function readCache(restaurantId: string): {
  categories: MenuCategory[];
  dishes: MenuDish[];
} | null {
  if (typeof window === "undefined" || !restaurantId) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(restaurantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      categories?: Record<string, unknown>[];
      dishes?: Record<string, unknown>[];
    };
    const categories = (parsed.categories ?? [])
      .map(asCategory)
      .filter((row): row is MenuCategory => Boolean(row));
    const dishes = (parsed.dishes ?? [])
      .map(asDish)
      .filter((row): row is MenuDish => Boolean(row));
    if (!categories.length && !dishes.length) return null;
    return { categories, dishes };
  } catch {
    return null;
  }
}

function writeCache(
  restaurantId: string,
  categories: MenuCategory[],
  dishes: MenuDish[],
) {
  if (typeof window === "undefined" || !restaurantId) return;
  if (!categories.length && !dishes.length) return;
  try {
    window.localStorage.setItem(
      cacheKey(restaurantId),
      JSON.stringify({ categories, dishes, savedAt: Date.now() }),
    );
  } catch {
    // Quota or private mode — keep the in-memory snapshot.
  }
}

export function useLiveGuestMenu(
  restaurantId: string,
  initialCategories: MenuCategory[],
  initialDishes: MenuDish[],
) {
  const [categories, setCategories] = useState(initialCategories);
  const [dishes, setDishes] = useState(initialDishes);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setCategories(initialCategories);
    setDishes(initialDishes);
    writeCache(restaurantId, initialCategories, initialDishes);
  }, [initialCategories, initialDishes, restaurantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOffline(!window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/menu/${restaurantId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          categories?: Record<string, unknown>[];
          dishes?: Record<string, unknown>[];
        };
        if (cancelled) return;
        const nextCategories = (json.categories ?? [])
          .map(asCategory)
          .filter((row): row is MenuCategory => Boolean(row));
        const nextDishes = (json.dishes ?? [])
          .map(asDish)
          .filter((row): row is MenuDish => Boolean(row));
        if (nextCategories.length) setCategories(nextCategories);
        setDishes(nextDishes);
        writeCache(restaurantId, nextCategories, nextDishes);
        setOffline(false);
      } catch {
        if (cancelled) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setOffline(true);
        }
        const cached = readCache(restaurantId);
        setCategories((current) =>
          current.length ? current : cached?.categories ?? current,
        );
        setDishes((current) =>
          current.length ? current : cached?.dishes ?? current,
        );
      } finally {
        inFlight = false;
      }
    }

    const onOnline = () => {
      setOffline(false);
      void refresh();
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [restaurantId]);

  return { categories, dishes, offline };
}
