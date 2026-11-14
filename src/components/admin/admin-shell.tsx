"use client";

import { AdminLanguageSwitcher, useAdminLocale } from "@/components/admin/admin-locale";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { Button } from "@/components/ui/button";
import { exitSuperAdminViewAs } from "@/app/admin/super-admin/actions";
import { switchActiveTenant } from "@/app/admin/tenant-session";
import type { StaffRole } from "@/lib/staff-role-shared";
import { Building2, LayoutGrid } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export type AdminRestaurantOption = {
  id: string;
  name: string;
  slug: string | null;
};

export function AdminShell({
  children,
  showSuperAdmin = false,
  showRestaurantTabs = true,
  staffRole = null,
  restaurantName = null,
  restaurantLogo = null,
  activeRestaurantId = null,
  restaurants = [],
  viewingAsName = null,
}: {
  children: ReactNode;
  showSuperAdmin?: boolean;
  showRestaurantTabs?: boolean;
  staffRole?: StaffRole | null;
  restaurantName?: string | null;
  restaurantLogo?: string | null;
  activeRestaurantId?: string | null;
  restaurants?: AdminRestaurantOption[];
  viewingAsName?: string | null;
}) {
  const { t } = useAdminLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [exitingViewAs, setExitingViewAs] = useState(false);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const isSuperAdminPage =
    pathname === "/admin/super-admin" || pathname.startsWith("/admin/super-admin/");
  const useNetworkHeader = isSuperAdminPage;
  const canSwitchRestaurant = !useNetworkHeader && restaurants.length > 1;

  async function onSwitchRestaurant(nextRestaurantId: string) {
    if (!nextRestaurantId || nextRestaurantId === activeRestaurantId || switchingTenant) {
      return;
    }
    setSwitchingTenant(true);
    try {
      const result = await switchActiveTenant(nextRestaurantId);
      if (!result.error) {
        router.refresh();
        window.location.reload();
        return;
      }
    } finally {
      setSwitchingTenant(false);
    }
  }

  async function exitViewAs() {
    if (exitingViewAs) return;
    setExitingViewAs(true);
    try {
      await exitSuperAdminViewAs();
    } catch {
      // Still leave the cached manager view.
    }
    window.location.href = "/admin/super-admin";
  }

  return (
    <div className="mx-auto flex w-full max-w-350 flex-col gap-6 p-6">
      <header className="border-secondary/30 flex items-start justify-between gap-4 border-b pb-4 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          {useNetworkHeader ? (
            <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full ring-1 ring-foreground/10">
              <LayoutGrid className="size-5" aria-hidden />
            </span>
          ) : restaurantLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurantLogo}
              alt=""
              className="size-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {useNetworkHeader
                ? t.superAdminPanel
                : restaurantName || t.brand}
            </h1>
            <p className="text-muted-foreground text-sm">
              {useNetworkHeader ? t.superAdminPanelHint : t.brandHint}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canSwitchRestaurant ? (
            <label className="border-input bg-background inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm shadow-xs">
              <Building2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t.switchRestaurant}</span>
              <select
                aria-label={t.switchRestaurant}
                value={activeRestaurantId ?? restaurants[0]?.id ?? ""}
                disabled={switchingTenant}
                onChange={(e) => void onSwitchRestaurant(e.target.value)}
                className="bg-transparent pr-1 text-sm font-medium outline-none"
              >
                {restaurants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <AdminLanguageSwitcher />
          <SignOutButton />
        </div>
      </header>
      {viewingAsName ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-50"
        >
          <p className="font-medium">
            {t.managingAsSuperAdmin.replace("{name}", viewingAsName)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exitingViewAs}
            onClick={() => void exitViewAs()}
          >
            {t.returnToSuperAdmin}
          </Button>
        </div>
      ) : null}
      <AdminNav
        showSuperAdmin={showSuperAdmin}
        showRestaurantTabs={showRestaurantTabs}
        staffRole={staffRole}
      />
      {children}
    </div>
  );
}
