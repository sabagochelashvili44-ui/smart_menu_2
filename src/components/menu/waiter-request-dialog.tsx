"use client";

import { CrossSellSection } from "@/components/menu/cross-sell-section";
import type { CartLine } from "@/components/menu/cart-drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CrossSellDish } from "@/lib/cross-sell";
import { dishLabel, formatGel, type MenuLocale, ui } from "@/lib/menu-copy";
import type { UpsellHeading } from "@/lib/recommendations";
import type { CartTotals } from "@/lib/service-fee";
import {
  GUEST_WAITER_CALL_TYPES,
  WAITER_CALL_LABELS,
  WAITER_CALL_STYLE,
  type WaiterCallType,
} from "@/lib/waiter-call-types";
import {
  BanknoteIcon,
  BellIcon,
  BrushCleaningIcon,
  CreditCardIcon,
} from "lucide-react";
import type { ComponentType } from "react";

const ICONS: Record<
  (typeof GUEST_WAITER_CALL_TYPES)[number],
  ComponentType<{ className?: string }>
> = {
  call_waiter: BellIcon,
  clean_table: BrushCleaningIcon,
  bill_card: CreditCardIcon,
  bill_cash: BanknoteIcon,
};

export function WaiterRequestDialog({
  open,
  onOpenChange,
  locale,
  copy,
  sending,
  onSelect,
  cart,
  total,
  totals,
  recommendations,
  recommendationHeading = "together",
  onAddRecommendation,
  actionsDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: MenuLocale;
  copy: (typeof ui)[MenuLocale];
  sending: boolean;
  onSelect: (type: WaiterCallType) => void;
  cart: CartLine[];
  total: number;
  totals?: CartTotals;
  recommendations: CrossSellDish[];
  recommendationHeading?: UpsellHeading;
  onAddRecommendation: (dish: CrossSellDish) => void;
  actionsDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-(--vv-bottom,0px) left-0 flex max-h-[min(40rem,calc(100dvh-var(--vv-bottom,0px)))] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-2xl rounded-b-none p-0 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:translate-y-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 px-4 pt-4 pr-12 pb-3">
          <DialogTitle>{copy.requestTitle}</DialogTitle>
          <DialogDescription>{copy.requestHint}</DialogDescription>
        </DialogHeader>
        {cart.length > 0 ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4">
            <ul className="space-y-2">
              {cart.map((line) => (
                <li key={line.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">
                      {line.quantity}× {dishLabel(line.name, locale)}
                    </span>
                    {line.status === "sent" ? (
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {copy.cartSent}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatGel(line.price * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            {totals && totals.percent > 0 ? (
              <div className="space-y-1 border-t border-secondary/30 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{copy.dishesSubtotal}</span>
                  <span className="tabular-nums">{formatGel(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{copy.serviceFee(totals.percent)}</span>
                  <span className="tabular-nums">{formatGel(totals.serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span>{copy.grandTotalDue}</span>
                  <span className="text-brand-price tabular-nums">
                    {formatGel(totals.grandTotal)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between border-t border-secondary/30 pt-3 text-sm font-semibold">
                <span>{copy.grandTotalDue}</span>
                <span className="text-brand-price tabular-nums">{formatGel(total)}</span>
              </div>
            )}
            <CrossSellSection
              layout="bar"
              heading={recommendationHeading}
              items={recommendations}
              locale={locale}
              copy={copy}
              onAdd={onAddRecommendation}
              disabled={actionsDisabled || sending}
            />
          </div>
        ) : null}
        <div className="relative z-10 max-h-[46dvh] min-h-0 shrink overflow-y-auto overscroll-contain border-t border-secondary/30 bg-popover p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid gap-2">
          {GUEST_WAITER_CALL_TYPES.map((type) => {
            const Icon = ICONS[type];
            const style = WAITER_CALL_STYLE[type];
            return (
              <button
                key={type}
                type="button"
                disabled={sending}
                className={`flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-transform active:translate-y-px disabled:opacity-60 ${style.card}`}
                onClick={() => onSelect(type)}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold leading-snug">
                  {WAITER_CALL_LABELS[type][locale]}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
