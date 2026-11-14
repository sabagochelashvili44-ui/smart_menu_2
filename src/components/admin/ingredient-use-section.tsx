"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ingredientLabel } from "@/lib/menu-copy";
import type { IngredientUseRow } from "@/lib/sold-dishes";
import { useMemo, useState } from "react";

function formatUseQty(quantity: number) {
  if (Number.isInteger(quantity)) return String(quantity);
  return quantity.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function IngredientUseSection({
  rows,
}: {
  rows: IngredientUseRow[] | null | undefined;
}) {
  const { locale, t } = useAdminLocale();
  const [query, setQuery] = useState("");
  const list = rows ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list.filter((row) => {
      const label = ingredientLabel(row.name, locale);
      if (!needle) return true;
      return (
        label.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle)
      );
    });
  }, [list, locale, query]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.ingredientUse}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t.ingredientUseHint}
        </p>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.ingredientUseEmpty}</p>
        ) : (
          <>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchIngredient}
              aria-label={t.searchIngredient}
            />
            {visible.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.noIngredientMatch}</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {visible.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {ingredientLabel(row.name, locale)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatUseQty(row.quantity)} {row.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
