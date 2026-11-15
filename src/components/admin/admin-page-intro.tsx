"use client";

import { useAdminLocale } from "@/components/admin/admin-locale";
import type { AdminUiStringKey } from "@/lib/admin-i18n";

export function AdminPageIntro({
  titleKey,
  subtitleKey,
}: {
  titleKey: AdminUiStringKey;
  subtitleKey?: AdminUiStringKey;
}) {
  const { t } = useAdminLocale();
  return (
    <div className="print:hidden">
      <h2 className="text-lg font-medium">{t[titleKey]}</h2>
      {subtitleKey ? (
        <p className="text-muted-foreground text-sm">{t[subtitleKey]}</p>
      ) : null}
    </div>
  );
}

export function AdminEmptyRestaurant() {
  const { t } = useAdminLocale();
  return <p className="text-muted-foreground text-sm">{t.noRestaurant}</p>;
}
