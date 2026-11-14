"use client";

import { addAdminTable, deleteAdminTable } from "@/app/admin/actions";
import { useAdminLocale } from "@/components/admin/admin-locale";
import { Button } from "@/components/ui/button";
import { guestMenuUrl } from "@/lib/app-url";
import { restaurantPublicKey } from "@/lib/restaurant-brand";
import type { AdminRestaurant, AdminTable } from "@/lib/supabaseAdmin";
import { PrinterIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

function nextTableNumber(tables: AdminTable[], prefix: string) {
  const used = new Set(
    tables.map((table) => table.table_number.trim().toLowerCase()),
  );
  let max = 0;
  for (const table of tables) {
    const match = table.table_number.match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let next = max + 1;
  let candidate = `${prefix} ${next}`;
  while (used.has(candidate.toLowerCase())) {
    next += 1;
    candidate = `${prefix} ${next}`;
  }
  return candidate;
}

export function QrTables({
  restaurant,
  tables,
}: {
  restaurant: AdminRestaurant;
  tables: AdminTable[];
}) {
  const { t } = useAdminLocale();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminTable[]>(tables);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  useEffect(() => {
    setRows(tables);
  }, [tables]);

  useEffect(() => {
    function clearPrintTarget() {
      setPrintId(null);
    }
    window.addEventListener("afterprint", clearPrintTarget);
    return () => window.removeEventListener("afterprint", clearPrintTarget);
  }, []);

  const restaurantKey = useMemo(
    () => restaurantPublicKey(restaurant),
    [restaurant],
  );

  useEffect(() => {
    let cancelled = false;

    async function build() {
      const generated: Record<string, string> = {};
      for (const table of rows) {
        if (table.id.startsWith("temp-")) continue;
        const url = guestMenuUrl(restaurantKey, table.id);
        generated[table.id] = await QRCode.toDataURL(url, {
          margin: 1,
          width: 240,
        });
      }
      if (!cancelled) setCodes(generated);
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [restaurantKey, rows]);

  const addTable = useCallback(async () => {
    if (pending) return;
    const tableNumber = nextTableNumber(rows, t.tableNamePrefix);
    setPending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: AdminTable = {
      id: tempId,
      restaurant_id: restaurant.id,
      table_number: tableNumber,
    };
    setRows((current) => [...current, optimistic]);
    const result = await addAdminTable(tableNumber);
    setPending(false);
    if (result.error || !result.table) {
      setRows((current) => current.filter((row) => row.id !== tempId));
      setError(result.error ?? t.addTable);
      return;
    }
    setRows((current) =>
      current.map((row) => (row.id === tempId ? result.table! : row)),
    );
    setError(null);
  }, [pending, restaurant.id, rows, t.addTable, t.tableNamePrefix]);

  const removeTable = useCallback(
    async (table: AdminTable) => {
      if (deletingId || table.id.startsWith("temp-")) return;
      if (!window.confirm(t.deleteTableConfirm)) return;
      setDeletingId(table.id);
      setRows((current) => current.filter((row) => row.id !== table.id));
      const result = await deleteAdminTable(table.id);
      setDeletingId(null);
      if (result.error) {
        setRows((current) =>
          [...current, table].sort((a, b) =>
            a.table_number.localeCompare(b.table_number, undefined, {
              numeric: true,
            }),
          ),
        );
        setError(result.error);
        return;
      }
      setError(null);
    },
    [deletingId, t.deleteTableConfirm],
  );

  const printOne = useCallback((tableId: string) => {
    setPrintId(tableId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm print:hidden">
        {t.restaurant}: <span className="font-medium">{restaurant.name}</span>
      </p>
      <div className="flex flex-col gap-2 print:hidden sm:flex-row">
        <Button disabled={pending} onClick={() => void addTable()}>
          {t.addTable}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          {t.printQr}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm print:hidden">{error}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-2">
        {rows.map((table) => (
          <div
            key={table.id}
            className={
              printId && printId !== table.id
                ? "flex flex-col items-center gap-2 rounded-xl border p-4 print:hidden"
                : "flex flex-col items-center gap-2 rounded-xl border p-4 print:break-inside-avoid"
            }
          >
            {codes[table.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={codes[table.id]}
                alt={`QR ${table.table_number}`}
                className="size-40 print:size-56"
              />
            ) : (
              <div className="bg-muted size-40 animate-pulse rounded-lg print:hidden" />
            )}
            <p className="font-medium">
              {restaurant.name} · {table.table_number}
            </p>
            <p className="text-muted-foreground break-all text-center text-xs print:hidden">
              {table.id.startsWith("temp-")
                ? ""
                : guestMenuUrl(restaurantKey, table.id)}
            </p>
            <div className="mt-1 flex w-full flex-col gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                disabled={table.id.startsWith("temp-") || !codes[table.id]}
                onClick={() => printOne(table.id)}
              >
                <PrinterIcon data-icon="inline-start" />
                {t.printThisQr}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={Boolean(deletingId) || table.id.startsWith("temp-")}
                onClick={() => void removeTable(table)}
              >
                <Trash2Icon data-icon="inline-start" />
                {t.delete}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
