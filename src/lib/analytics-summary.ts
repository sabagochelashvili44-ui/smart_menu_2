import { isDishSaleItem } from "@/lib/dish-analytics";
import { percentChange } from "@/lib/analytics-range";
import {
  confirmedSalesInWindow,
  splitCallRevenue,
  type SaleCall,
  type SaleLine,
} from "@/lib/sales-metrics";

export type MenuDishRef = {
  id: string;
  name: string;
};

export type SalesDishRow = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type SalesSummary = {
  revenue: number;
  revenueDishes: number;
  revenueChange: number;
  revenueDishesChange: number;
  orderCount: number;
  orderCountChange: number;
  averageCheck: number | null;
  averageCheckChange: number | null;
  averageWaitMinutes: number | null;
  averageWaitChange: number | null;
  popularDishes: SalesDishRow[];
  rareDishes: SalesDishRow[];
};

type SoldRow = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
};

function money(value: number) {
  return Number(value.toFixed(2));
}

function recordSaleLine(byId: Map<string, SoldRow>, byName: Map<string, SoldRow>, item: SaleLine) {
  if (!isDishSaleItem(item)) return;
  const id = item.dish_id || item.name;
  if (!id) return;
  const current = byId.get(id) ?? {
    id,
    name: item.name,
    quantity: 0,
    revenue: 0,
  };
  current.quantity += item.quantity;
  current.revenue += item.quantity * item.unit_price;
  if (item.name) current.name = item.name;
  byId.set(id, current);
  if (item.name) byName.set(item.name, current);
}

function periodFigures(calls: SaleCall[], from: Date, to: Date) {
  const sales = confirmedSalesInWindow(calls, from, to);
  const byId = new Map<string, SoldRow>();
  const byName = new Map<string, SoldRow>();
  let revenue = 0;
  let revenueDishes = 0;
  const waits: number[] = [];

  for (const call of sales) {
    const split = splitCallRevenue(call.items);
    revenue += split.total;
    revenueDishes += split.dishes;
    for (const item of call.items ?? []) {
      recordSaleLine(byId, byName, item);
    }
    if (!call.created_at || !call.acknowledged_at) continue;
    const minutes =
      (new Date(call.acknowledged_at).getTime() - new Date(call.created_at).getTime()) /
      60000;
    if (Number.isFinite(minutes) && minutes >= 0) waits.push(minutes);
  }

  const orderCount = sales.length;
  const averageCheck = orderCount > 0 ? revenue / orderCount : null;
  const averageWaitMinutes = waits.length
    ? waits.reduce((sum, value) => sum + value, 0) / waits.length
    : null;

  return {
    revenue: money(revenue),
    revenueDishes: money(revenueDishes),
    orderCount,
    averageCheck: averageCheck === null ? null : money(averageCheck),
    averageWaitMinutes:
      averageWaitMinutes === null ? null : Number(averageWaitMinutes.toFixed(1)),
    byId,
    byName,
  };
}

function popularDishes(byId: Map<string, SoldRow>) {
  return [...byId.values()]
    .filter((row) => row.quantity > 0 && row.name)
    .sort(
      (a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name),
    )
    .slice(0, 10)
    .map((row) => ({ ...row, revenue: money(row.revenue) }));
}

function rareDishes(
  dishes: MenuDishRef[],
  byId: Map<string, SoldRow>,
  byName: Map<string, SoldRow>,
) {
  return dishes
    .map((dish) => {
      const sold = byId.get(dish.id) ?? byName.get(dish.name);
      return {
        id: dish.id,
        name: dish.name,
        quantity: sold?.quantity ?? 0,
        revenue: money(sold?.revenue ?? 0),
      };
    })
    .filter((row) => row.name && row.quantity <= 1)
    .sort(
      (a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name),
    );
}

export function computeSalesSummary(input: {
  calls: SaleCall[];
  dishes: MenuDishRef[];
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}): SalesSummary {
  const current = periodFigures(input.calls, input.from, input.to);
  const previous = periodFigures(input.calls, input.previousFrom, input.previousTo);

  return {
    revenue: current.revenue,
    revenueDishes: current.revenueDishes,
    revenueChange: percentChange(current.revenue, previous.revenue),
    revenueDishesChange: percentChange(current.revenueDishes, previous.revenueDishes),
    orderCount: current.orderCount,
    orderCountChange: percentChange(current.orderCount, previous.orderCount),
    averageCheck: current.averageCheck,
    averageCheckChange:
      current.averageCheck === null
        ? null
        : percentChange(current.averageCheck, previous.averageCheck ?? 0),
    averageWaitMinutes: current.averageWaitMinutes,
    averageWaitChange:
      current.averageWaitMinutes === null || previous.averageWaitMinutes === null
        ? null
        : percentChange(current.averageWaitMinutes, previous.averageWaitMinutes),
    popularDishes: popularDishes(current.byId),
    rareDishes: rareDishes(input.dishes, current.byId, current.byName),
  };
}
