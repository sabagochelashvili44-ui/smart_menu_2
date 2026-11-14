"use client";

import type { WaiterCallAlert } from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dishLabel, formatGel } from "@/lib/menu-copy";
import {
  isServiceFeeItem,
  parseServiceFeePercent,
  ticketPriceBreakdown,
} from "@/lib/service-fee";
import type { WaiterCallLine } from "@/lib/waiter-call-items";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type KitchenMenuDish = {
  id: string;
  name: string;
  price: number;
};

function lineBatch(item: { batch?: number }) {
  return item.batch && item.batch > 0 ? item.batch : 1;
}

function OrderEditGroups({
  draft,
  locale,
  alreadyLabel,
  addedLabel,
  deleteLabel,
  onQuantity,
}: {
  draft: WaiterCallLine[];
  locale: "ka" | "en" | "ru";
  alreadyLabel: string;
  addedLabel: string;
  deleteLabel: string;
  onQuantity: (index: number, quantity: number) => void;
}) {
  const rows = draft.map((item, index) => ({ item, index }));
  const newest = rows.reduce((max, row) => Math.max(max, lineBatch(row.item)), 1);
  const groups =
    newest <= 1
      ? [{ key: "all", label: null as string | null, rows }]
      : [
          {
            key: "previous",
            label: alreadyLabel,
            rows: rows.filter((row) => lineBatch(row.item) < newest),
          },
          {
            key: "added",
            label: addedLabel,
            rows: rows.filter((row) => lineBatch(row.item) === newest),
          },
        ].filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section
          key={group.key}
          className={
            group.key === "added"
              ? "space-y-2 rounded-lg border-2 border-amber-500 bg-amber-50 p-2 dark:bg-amber-950/50"
              : "space-y-2"
          }
        >
          {group.label ? (
            <p
              className={
                group.key === "added"
                  ? "text-xs font-bold tracking-wide text-amber-950 uppercase dark:text-amber-100"
                  : "text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              }
            >
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-2">
            {group.rows.map(({ item, index }) => (
              <li
                key={`${item.dish_id}-${item.batch ?? 1}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-secondary/30 bg-muted/30 px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {dishLabel(item.name, locale)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatGel(item.unit_price)}
                  </p>
                  {item.note ? (
                    <p className="text-muted-foreground mt-1 text-xs">{item.note}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="-"
                    onClick={() => onQuantity(index, item.quantity - 1)}
                  >
                    <MinusIcon className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="+"
                    onClick={() => onQuantity(index, item.quantity + 1)}
                  >
                    <PlusIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={deleteLabel}
                    onClick={() => onQuantity(index, 0)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OrderEditDialog({
  call,
  dishes,
  serviceFeePercent = 0,
  onClose,
  onSave,
}: {
  call: WaiterCallAlert | null;
  dishes: KitchenMenuDish[];
  serviceFeePercent?: number;
  onClose: () => void;
  onSave: (items: WaiterCallLine[]) => Promise<string | null>;
}) {
  const { locale, t } = useAdminLocale();
  const [draft, setDraft] = useState<WaiterCallLine[]>([]);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!call) {
      setDraft([]);
      setQuery("");
      setError(null);
      return;
    }
    setDraft(
      call.items
        .filter((item) => !isServiceFeeItem(item))
        .map((item) => ({ ...item })),
    );
    setQuery("");
    setError(null);
  }, [call]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dishes
      .filter((dish) => {
        if (!needle) return true;
        const label = dishLabel(dish.name, locale).toLowerCase();
        return label.includes(needle) || dish.name.toLowerCase().includes(needle);
      })
      .slice(0, 12);
  }, [dishes, locale, query]);

  function setQuantity(index: number, quantity: number) {
    setDraft((current) => {
      if (quantity < 1) {
        return current.filter((_, itemIndex) => itemIndex !== index);
      }
      return current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, quantity: Math.min(99, quantity) }
          : item,
      );
    });
  }

  function addDish(dish: KitchenMenuDish) {
    setDraft((current) => {
      const newest = current.reduce(
        (max, item) => Math.max(max, lineBatch(item)),
        1,
      );
      const existing = current.findIndex(
        (item) => item.dish_id === dish.id && lineBatch(item) === newest,
      );
      if (existing >= 0) {
        return current.map((item, index) =>
          index === existing
            ? {
                ...item,
                quantity: Math.min(99, item.quantity + 1),
                batch: newest,
              }
            : item,
        );
      }
      return [
        ...current,
        {
          dish_id: dish.id,
          name: dish.name,
          quantity: 1,
          unit_price: Number(dish.price) || 0,
          batch: newest,
        },
      ];
    });
    setQuery("");
  }

  async function save() {
    if (!call) return;
    setPending(true);
    setError(null);
    try {
      const message = await onSave(draft);
      if (message) {
        setError(message);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(call)} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.editOrder}</DialogTitle>
          <DialogDescription>
            {call?.table_number || call?.table_id.slice(0, 8) || ""}
          </DialogDescription>
        </DialogHeader>

        {draft.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.emptyWaiterCall}</p>
        ) : (
          <OrderEditGroups
            draft={draft}
            locale={locale}
            alreadyLabel={t.alreadyOrdered}
            addedLabel={t.justAdded}
            deleteLabel={t.delete}
            onQuantity={setQuantity}
          />
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{t.addDishToOrder}</p>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchDish}
            aria-label={t.searchDish}
          />
          {dishes.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t.noMenuDishes}</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-secondary/30">
              {matches.map((dish) => (
                <li key={dish.id}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                    onClick={() => addDish(dish)}
                  >
                    <span className="truncate">{dishLabel(dish.name, locale)}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatGel(dish.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {draft.length ? (
          <OrderEditTotals
            items={draft}
            percent={parseServiceFeePercent(serviceFeePercent)}
            dishesLabel={t.dishesSubtotal}
            serviceLabel={t.serviceFee}
            dueLabel={t.grandTotalDue}
          />
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t.cancel}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? t.savingOrder : t.saveOrder}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderEditTotals({
  items,
  percent,
  dishesLabel,
  serviceLabel,
  dueLabel,
}: {
  items: WaiterCallLine[];
  percent: number;
  dishesLabel: string;
  serviceLabel: string;
  dueLabel: string;
}) {
  const breakdown = ticketPriceBreakdown(items, percent);
  if (breakdown.percent > 0) {
    return (
      <div className="space-y-1 border-t pt-2 text-sm">
        <p className="flex justify-between">
          <span>{dishesLabel}</span>
          <span className="tabular-nums">{formatGel(breakdown.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>
            {serviceLabel} ({breakdown.percent}%)
          </span>
          <span className="tabular-nums">{formatGel(breakdown.serviceFee)}</span>
        </p>
        <p className="flex justify-between font-semibold">
          <span>{dueLabel}</span>
          <span className="tabular-nums">{formatGel(breakdown.grandTotal)}</span>
        </p>
      </div>
    );
  }
  return (
    <p className="flex justify-between border-t pt-2 text-sm font-semibold">
      <span>{dueLabel}</span>
      <span className="tabular-nums">{formatGel(breakdown.grandTotal)}</span>
    </p>
  );
}
