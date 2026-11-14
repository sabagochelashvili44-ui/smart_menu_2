"use client";

import { CrossSellSection } from "@/components/menu/cross-sell-section";
import { QuantityStepper } from "@/components/menu/quantity-stepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CrossSellDish } from "@/lib/cross-sell";
import type { DrinkPour } from "@/lib/menu-lane";
import type { UpsellHeading } from "@/lib/recommendations";
import { dishLabel, formatGel, type MenuLocale, ui } from "@/lib/menu-copy";
import type { CartTotals } from "@/lib/service-fee";
import { BellIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CartLine = {
  id: string;
  dishId?: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  status?: "draft" | "sent";
  batch?: number;
  pour?: DrinkPour;
};

function LineNoteField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (note: string) => void;
  placeholder: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  return (
    <Textarea
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value.slice(0, 200);
        setDraft(next);
        onChange(next);
      }}
      onBlur={() => {
        focusedRef.current = false;
        onChange(draft);
      }}
      rows={2}
      maxLength={200}
      placeholder={placeholder}
      className="mt-2 min-h-16 text-sm"
      aria-label={label}
    />
  );
}

function lineBatch(line: CartLine) {
  return line.batch && line.batch > 0 ? line.batch : 1;
}

function cartGroups(cart: CartLine[], copy: (typeof ui)[MenuLocale]) {
  const sent = cart.filter((line) => line.status === "sent");
  const drafts = cart.filter((line) => line.status !== "sent");
  const newest = sent.reduce((max, line) => Math.max(max, lineBatch(line)), 1);
  const groups: Array<{ key: string; heading: string; lines: CartLine[] }> = [];
  if (newest > 1) {
    const previous = sent.filter((line) => lineBatch(line) < newest);
    const added = sent.filter((line) => lineBatch(line) === newest);
    if (previous.length) {
      groups.push({ key: "sent", heading: copy.cartSent, lines: previous });
    }
    if (added.length) {
      groups.push({ key: "added", heading: copy.cartJustAdded, lines: added });
    }
  } else if (sent.length) {
    groups.push({ key: "sent", heading: copy.cartSent, lines: sent });
  }
  if (drafts.length) {
    groups.push({ key: "draft", heading: copy.cartDraft, lines: drafts });
  }
  return groups;
}

export function CartDrawer({
  open,
  onOpenChange,
  cart,
  total,
  totals,
  tableLabel,
  copy,
  locale,
  calling,
  canCall,
  onIncrease,
  onDecrease,
  onRemove,
  onNoteChange,
  onCallWaiter,
  recommendations,
  recommendationHeading = "together",
  onAddRecommendation,
  soldOutIds,
  actionsDisabled = false,
  shared = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartLine[];
  total: number;
  totals?: CartTotals;
  tableLabel: string;
  copy: (typeof ui)[MenuLocale];
  locale: MenuLocale;
  calling: boolean;
  canCall: boolean;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  onCallWaiter: () => void;
  recommendations: CrossSellDish[];
  recommendationHeading?: UpsellHeading;
  onAddRecommendation: (dish: CrossSellDish) => void;
  soldOutIds?: Set<string>;
  actionsDisabled?: boolean;
  shared?: boolean;
}) {
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const hasSent = cart.some((line) => line.status === "sent");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[min(88dvh,calc(100dvh-var(--vv-bottom,0px)))] max-h-[min(88dvh,calc(100dvh-var(--vv-bottom,0px)))] gap-0 overflow-hidden rounded-t-2xl p-0 max-sm:bottom-(--vv-bottom,0px)! sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,88dvh)] sm:max-h-[min(40rem,88dvh)] sm:max-w-md sm:rounded-2xl sm:border"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{copy.yourOrder}</SheetTitle>
          <SheetDescription>
            {itemCount === 0
              ? copy.addFromMenu
              : `${copy.items(itemCount)} · ${tableLabel}`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
            {shared ? copy.cartShared : copy.summaryHint}
          </p>
          {cart.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {copy.cartEmptyLong}
            </p>
          ) : (
            <div className="space-y-4">
              {cartGroups(cart, copy).map((group) => (
                <section
                  key={group.key}
                  className={
                    group.key === "added"
                      ? "space-y-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-2 dark:bg-amber-950/40"
                      : "space-y-2"
                  }
                >
                  {hasSent && (shared || group.key !== "draft") ? (
                    <h3
                      className={
                        group.key === "added"
                          ? "text-sm font-semibold text-amber-950 dark:text-amber-100"
                          : "text-sm font-medium"
                      }
                    >
                      {group.heading}
                    </h3>
                  ) : null}
                  <ul className="space-y-3">
                    {group.lines.map((line) => {
                      const locked = line.status === "sent";
                      return (
                        <li
                          key={line.id}
                          className="flex items-start gap-3 rounded-xl border border-secondary/35 bg-card p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug">
                              {dishLabel(line.name, locale)}
                              {line.pour === "glass"
                                ? ` · ${copy.priceGlass}`
                                : line.pour === "bottle"
                                  ? ` · ${copy.priceBottle}`
                                  : ""}
                            </p>
                            <p className="text-brand-price text-sm tabular-nums">
                              {formatGel(line.price)} {copy.each} ·{" "}
                              {formatGel(line.price * line.quantity)}
                            </p>
                            <div className="mt-2 max-w-40">
                              <QuantityStepper
                                value={line.quantity}
                                onDecrease={() => onDecrease(line.id)}
                                onIncrease={() => onIncrease(line.id)}
                                disabledIncrease={
                                  actionsDisabled ||
                                  soldOutIds?.has(line.dishId ?? line.id)
                                }
                                disabledDecrease={locked || actionsDisabled}
                              />
                            </div>
                            {locked ? null : (
                              <LineNoteField
                                value={line.note ?? ""}
                                onChange={(note) => onNoteChange(line.id, note)}
                                placeholder={copy.lineNotePlaceholder}
                                label={copy.lineNote}
                              />
                            )}
                          </div>
                          {locked ? null : (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${copy.remove} ${dishLabel(line.name, locale)}`}
                              onClick={() => onRemove(line.id)}
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {cart.length > 0 ? (
            <CrossSellSection
              layout="bar"
              heading={recommendationHeading}
              items={recommendations}
              locale={locale}
              copy={copy}
              onAdd={onAddRecommendation}
              disabled={actionsDisabled}
            />
          ) : null}
        </div>

        <SheetFooter className="shrink-0 border-t border-secondary/30 bg-popover pb-[max(1rem,env(safe-area-inset-bottom))]">
          {totals && totals.percent > 0 ? (
            <div className="w-full space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>{copy.dishesSubtotal}</span>
                <span className="tabular-nums">{formatGel(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{copy.serviceFee(totals.percent)}</span>
                <span className="tabular-nums">
                  {formatGel(totals.serviceFee)}
                </span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>{copy.grandTotalDue}</span>
                <span className="text-brand-price tabular-nums">
                  {formatGel(totals.grandTotal)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between text-sm font-medium">
              <span>{copy.total}</span>
              <span className="text-brand-price tabular-nums">{formatGel(total)}</span>
            </div>
          )}
          <Button
            type="button"
            className="h-11 w-full gap-2"
            disabled={!canCall || calling}
            onClick={onCallWaiter}
          >
            <BellIcon className="size-4" />
            {calling ? copy.sending : copy.callWaiter}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
