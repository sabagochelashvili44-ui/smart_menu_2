import { loadAdminMenu, loadKitchenOrders, loadShiftNotes } from "@/app/admin/actions";
import { AdminEmptyRestaurant } from "@/components/admin/admin-empty-restaurant";
import { AdminPageIntro } from "@/components/admin/admin-page-intro";
import { KitchenBoard } from "@/components/admin/kitchen-board";
import { ShiftBulletinBoard } from "@/components/admin/shift-bulletin-board";
import { SoldOutBoard } from "@/components/admin/sold-out-board";
import { parseServiceFeePercent } from "@/lib/service-fee";
import { requireTenantRestaurant } from "@/lib/tenant";
import { filterKitchenBoardTickets } from "@/lib/waiter-call-types";

export default async function AdminKitchenPage() {
  const ctx = await requireTenantRestaurant();
  const isWaiter = ctx.staffRole === "waiter";
  const [{ restaurant, waiterCalls }, menu] = await Promise.all([
    loadKitchenOrders(),
    loadAdminMenu().catch(() => ({
      dishes: [] as Awaited<ReturnType<typeof loadAdminMenu>>["dishes"],
      categories: [] as Awaited<ReturnType<typeof loadAdminMenu>>["categories"],
    })),
  ]);
  const activeRestaurant = restaurant ?? ctx.restaurant;
  const notes =
    activeRestaurant && !isWaiter
      ? await loadShiftNotes(activeRestaurant.id)
      : [];
  const canCompose =
    ctx.staffRole === "owner" || ctx.staffRole === "manager";
  const menuDishes = menu.dishes ?? [];
  const dishes = menuDishes
    .filter((dish) => dish.is_available !== false)
    .map((dish) => ({
      id: dish.id,
      name: dish.name,
      price: Number(dish.price) || 0,
    }));
  const stockDishes = menuDishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    category_id: dish.category_id,
    is_available: dish.is_available !== false,
  }));
  const stockCategories = (menu.categories ?? []).map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <section className="space-y-4">
      <AdminPageIntro titleKey="kitchenDisplay" subtitleKey="kitchenSubtitle" />
      {activeRestaurant ? (
        <>
          <KitchenBoard
            restaurantId={activeRestaurant.id}
            initialCalls={filterKitchenBoardTickets(waiterCalls)}
            dishes={dishes}
            serviceFeePercent={parseServiceFeePercent(
              activeRestaurant.service_fee_percent,
            )}
          />
          {!isWaiter ? (
            <>
              <SoldOutBoard dishes={stockDishes} categories={stockCategories} />
              <ShiftBulletinBoard
                restaurantId={activeRestaurant.id}
                initialNotes={notes}
                canCompose={canCompose}
              />
            </>
          ) : null}
        </>
      ) : (
        <AdminEmptyRestaurant />
      )}
    </section>
  );
}
