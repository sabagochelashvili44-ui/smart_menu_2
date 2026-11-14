import { loadAdminAiPrompts } from "@/app/admin/ai-prompts/actions";
import { loadAdminBranding } from "@/app/admin/actions";
import { AdminEmptyRestaurant } from "@/components/admin/admin-empty-restaurant";
import { AdminPageIntro } from "@/components/admin/admin-page-intro";
import { AiPromptsManager } from "@/components/admin/ai-prompts-manager";
import { BrandingSettings } from "@/components/admin/branding-settings";
import { requireTenantRestaurant } from "@/lib/tenant";

export default async function AdminSettingsPage() {
  const [{ restaurant }, access, prompts] = await Promise.all([
    loadAdminBranding(),
    requireTenantRestaurant(),
    loadAdminAiPrompts(),
  ]);
  const canEditBrand =
    access.isSuperAdmin || access.staffRole === "owner";

  return (
    <section className="space-y-4">
      <AdminPageIntro titleKey="settings" subtitleKey="settingsSubtitle" />
      {restaurant ? (
        <div className="space-y-6">
          {canEditBrand ? <BrandingSettings restaurant={restaurant} /> : null}
          <AiPromptsManager
            prompts={prompts.prompts}
            tableReady={prompts.tableReady}
          />
        </div>
      ) : (
        <AdminEmptyRestaurant />
      )}
    </section>
  );
}
