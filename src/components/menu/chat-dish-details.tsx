"use client";

import { DishNutritionFacts } from "@/components/guest/dish-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChatSuggestDish } from "@/lib/chat-suggestions";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  allergenLabel,
  categoryLabel,
  dishDescription,
  dishLabel,
  formatGel,
  ingredientLabel,
  type MenuLocale,
  ui,
} from "@/lib/menu-copy";

export function ChatDishDetailsDialog({
  dish,
  open,
  onOpenChange,
  locale,
  copy,
  serviceFeePercent = 0,
  canAdd,
  onAdd,
}: {
  dish: ChatSuggestDish | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: MenuLocale;
  copy: (typeof ui)[MenuLocale];
  serviceFeePercent?: number;
  canAdd?: boolean;
  onAdd?: (dish: ChatSuggestDish) => void;
}) {
  useBodyScrollLock(open);

  if (!dish) return null;

  const title = dishLabel(dish.name, locale);
  const description =
    dishDescription(dish.name, dish.description, locale) ||
    dish.description?.trim() ||
    "";
  const category = dish.category?.trim()
    ? categoryLabel(dish.category, locale)
    : "";
  const ingredients = (dish.ingredients ?? []).map((item) =>
    ingredientLabel(item, locale),
  );
  const allergens = (dish.allergens ?? []).map((item) =>
    allergenLabel(item, locale),
  );
  const safeFee = Math.max(0, Math.min(100, Number(serviceFeePercent) || 0));
  const totalWithFee =
    safeFee > 0
      ? Math.round(dish.price * (1 + safeFee / 100) * 100) / 100
      : dish.price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-100"
        className="z-100 max-h-[85dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {category ? <span>{category}</span> : null}
            {category ? <span aria-hidden>·</span> : null}
            <span className="text-brand-price font-semibold tabular-nums">
              {formatGel(dish.price)}
            </span>
            {safeFee > 0 ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                ({copy.serviceFee(safeFee)}: {formatGel(totalWithFee)})
              </span>
            ) : null}
            {dish.prep_minutes ? (
              <span className="text-muted-foreground text-xs">
                {copy.prepTime}: {dish.prep_minutes} {copy.prepMinutes}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {dish.image_url?.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element -- dish detail preview
          <img
            src={dish.image_url}
            alt={title}
            className="bg-muted h-44 w-full rounded-xl object-contain"
          />
        ) : (
          <div
            className="from-muted to-secondary/30 h-28 rounded-xl bg-linear-to-br"
            aria-hidden
          />
        )}

        {description ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        ) : null}

        {ingredients.length > 0 ? (
          <section className="space-y-1">
            <p className="text-foreground text-sm font-medium">
              {copy.ingredients}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {ingredients.join(", ")}
            </p>
          </section>
        ) : null}

        {allergens.length > 0 ? (
          <section className="space-y-1.5">
            <p className="text-foreground text-sm font-medium">
              {copy.allergens}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((allergen) => (
                <Badge key={allergen} variant="secondary">
                  {allergen}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <DishNutritionFacts
          dish={dish}
          heading={copy.nutritionHeading}
          labels={copy}
        />

        {canAdd ? (
          <DialogFooter className="sm:justify-stretch">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onAdd?.(dish);
                onOpenChange(false);
              }}
            >
              {copy.addFromChat}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
