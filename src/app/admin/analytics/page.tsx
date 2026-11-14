import { AdminEmptyRestaurant } from "@/components/admin/admin-empty-restaurant";
import { AdminPageIntro } from "@/components/admin/admin-page-intro";
import { AnalyticsBoard } from "@/components/admin/analytics-board";
import { loadSalesSummary } from "@/lib/admin-analytics-load";
import { getTenant } from "@/lib/tenant";
import { Suspense } from "react";

export default async function AdminAnalyticsPage() {
  const restaurant = await getTenant();
  const initialData = restaurant
    ? await loadSalesSummary(restaurant.id, "last7").catch(() => null)
    : null;

  return (
    <section className="space-y-4">
      <AdminPageIntro titleKey="analytics" />
      {restaurant ? (
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm">…</p>
          }
        >
          <AnalyticsBoard
            restaurantId={restaurant.id}
            initialData={initialData}
          />
        </Suspense>
      ) : (
        <AdminEmptyRestaurant />
      )}
    </section>
  );
}
