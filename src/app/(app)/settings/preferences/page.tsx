import { requireTenantContext } from "@/lib/tenant";
import { getPreferences } from "@/lib/customization/server";
import { NAV } from "@/components/nav/nav-items";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { PreferencesForm } from "@/components/settings/customize/preferences-form";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const { userId } = await requireTenantContext();
  const prefs = await getPreferences(userId);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">These choices are yours alone and follow you into every company you belong to.</p>
      </div>
      <SettingsTabs />
      <PreferencesForm initial={prefs} pages={NAV.map((n) => ({ href: n.href, label: n.label }))} />
    </div>
  );
}
