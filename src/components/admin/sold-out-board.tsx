"use client";

import { toggleKitchenDishAvailable } from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { categoryLabel, dishLabel } from "@/lib/menu-copy";
import { BanIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export type SoldOutDish = {
  id: string;
  name: string;
  category_id: string;
  is_available: boolean;
};

export type SoldOutCategory = {
  id: string;
  name: string;
};

export function SoldOutBoard({
  dishes,
  categories,
}: {
  dishes: SoldOutDish[];
  categories: SoldOutCategory[];
}) {
  const { locale, t } = useAdminLocale();
  const router = useRouter();
  const [items, setItems] = useState(dishes);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(dishes);
  }, [dishes]);

  const soldOutCount = items.filter((dish) => !dish.is_available).length;
  const needle = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const visible = needle
      ? items.filter((dish) => dish.name.toLowerCase().includes(needle))
      : items;
    const byCategory = new Map<string, SoldOutDish[]>();
    for (const dish of visible) {
      const list = byCategory.get(dish.category_id) ?? [];
      list.push(dish);
      byCategory.set(dish.category_id, list);
    }
    const sections = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        dishes: byCategory.get(category.id) ?? [],
      }))
      .filter((section) => section.dishes.length > 0);
    const known = new Set(categories.map((category) => category.id));
    const leftover = visible.filter((dish) => !known.has(dish.category_id));
    if (leftover.length) {
      sections.push({ id: "other", name: t.category, dishes: leftover });
    }
    return sections;
  }, [categories, items, needle, t.category]);

  async function toggle(dish: SoldOutDish, available: boolean) {
    if (pendingId === dish.id) return;
    const previous = dish.is_available;
    setPendingId(dish.id);
    setItems((current) =>
      current.map((row) =>
        row.id === dish.id ? { ...row, is_available: available } : row,
      ),
    );
    const result = await toggleKitchenDishAvailable(dish.id, available);
    setPendingId(null);
    if (result.error) {
      setItems((current) =>
        current.map((row) =>
          row.id === dish.id ? { ...row, is_available: previous } : row,
        ),
      );
      setError(result.error);
      return;
    }
    if (result.dish) {
      setItems((current) =>
        current.map((row) =>
          row.id === result.dish!.id
            ? {
                ...row,
                is_available: result.dish!.is_available,
                name: result.dish!.name,
                category_id: result.dish!.category_id,
              }
            : row,
        ),
      );
    }
    setError(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
              <BanIcon className="size-4" />
            </span>
            {t.soldOutBoard}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t.soldOutBoardHint}
          </p>
        </div>
        {soldOutCount > 0 ? (
          <Badge variant="destructive">
            {soldOutCount} · {t.soldOut}
          </Badge>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noDishes}</p>
      ) : (
        <>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchDish}
            className="mb-3"
            aria-label={t.searchDish}
          />
          {error ? (
            <p className="text-destructive mb-2 text-sm">{error}</p>
          ) : null}
          {grouped.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.noDishes}</p>
          ) : (
            <div className="max-h-112 space-y-3 overflow-y-auto pr-1">
              {grouped.map((section) => (
                <div key={section.id}>
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                    {categoryLabel(section.name, locale)}
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {section.dishes.map((dish) => (
                      <li
                        key={dish.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {dishLabel(dish.name, locale)}
                          </p>
                          <Badge
                            variant={
                              dish.is_available ? "secondary" : "destructive"
                            }
                          >
                            {dish.is_available ? t.inStock : t.soldOut}
                          </Badge>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Label
                            className="text-xs"
                            htmlFor={`kitchen-stock-${dish.id}`}
                          >
                            {dish.is_available ? t.inStock : t.soldOut}
                          </Label>
                          <Switch
                            id={`kitchen-stock-${dish.id}`}
                            size="sm"
                            checked={dish.is_available}
                            disabled={pendingId === dish.id}
                            onCheckedChange={(checked) =>
                              void toggle(dish, checked)
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
