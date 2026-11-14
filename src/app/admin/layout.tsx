import { AdminLocaleProvider } from "@/components/admin/admin-locale";
import { AdminShell } from "@/components/admin/admin-shell";
import { BrandTheme } from "@/components/brand-theme";
import { restaurantLogo } from "@/lib/restaurant-brand";
import {
  homePathForRole,
  isSuperAdminPath,
  pathAllowedForRole,
} from "@/lib/staff-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminAccessContext } from "@/lib/tenant";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function enforceAdminRoute({
  pathname,
  isSuperAdmin,
  impersonating,
  staffRole,
}: {
  pathname: string;
  isSuperAdmin: boolean;
  impersonating: boolean;
  staffRole: Parameters<typeof pathAllowedForRole>[1] | null;
}) {
  const onSuperAdminPage = isSuperAdminPath(pathname);
  if (!isSuperAdmin && onSuperAdminPage) {
    redirect(homePathForRole(staffRole));
  }
  // Only force-redirect when middleware gave us a real path. An empty
  // x-pathname would otherwise bounce /admin/super-admin → itself forever.
  if (
    isSuperAdmin &&
    !impersonating &&
    pathname.startsWith("/admin") &&
    !onSuperAdminPage
  ) {
    redirect("/admin/super-admin");
  }
  if (onSuperAdminPage || !staffRole) return onSuperAdminPage;
  if (!pathAllowedForRole(pathname, staffRole)) {
    redirect(homePathForRole(staffRole));
  }
  return onSuperAdminPage;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();
  if (!sessionUser) {
    redirect("/login");
  }

  const {
    user,
    isSuperAdmin,
    viewingAs,
    restaurant,
    restaurants,
    staffRole,
  } = await getAdminAccessContext();

  const pathname = (await headers()).get("x-pathname") ?? "";

  if (!user) {
    redirect("/login");
  }
  const impersonating = Boolean(isSuperAdmin && viewingAs);
  const onSuperAdminPage = enforceAdminRoute({
    pathname,
    isSuperAdmin,
    impersonating,
    staffRole,
  });

  const showRestaurantTabs = Boolean(staffRole) && !onSuperAdminPage;
  const showSuperAdmin = isSuperAdmin && !impersonating;
  const logo = restaurant && showRestaurantTabs ? restaurantLogo(restaurant) : null;
  const switcherRestaurants = showRestaurantTabs
    ? restaurants.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug ?? null,
      }))
    : [];

  return (
    <BrandTheme brand={showRestaurantTabs ? restaurant : null}>
      <AdminLocaleProvider>
        <AdminShell
          showSuperAdmin={showSuperAdmin}
          showRestaurantTabs={showRestaurantTabs}
          staffRole={staffRole}
          restaurantName={showRestaurantTabs ? restaurant?.name ?? null : null}
          restaurantLogo={logo}
          activeRestaurantId={showRestaurantTabs ? restaurant?.id ?? null : null}
          restaurants={switcherRestaurants}
          viewingAsName={impersonating && !onSuperAdminPage ? viewingAs?.name ?? null : null}
        >
          {children}
        </AdminShell>
      </AdminLocaleProvider>
    </BrandTheme>
  );
}
