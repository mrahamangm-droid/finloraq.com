import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NAV } from "@/components/nav/nav-items";
import { LOCKED_NAV, readNavConfig } from "@/lib/customization/server";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { NavEditor } from "@/components/settings/customize/nav-editor";

export const metadata = { title: "Menu" };

export default async function NavigationSettingsPage() {
  const { active } = await requireTenantContext();
  const [company, canEdit] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: active.companyId }, select: { navConfig: true } }),
    can(active.id, "settings", "EDIT"),
  ]);
  const cfg = readNavConfig(company.navConfig);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Choose which sections appear in the menu, and in what order, for everyone in the company.</p>
      </div>
      <SettingsTabs />
      <NavEditor
        items={NAV.map((n) => ({ href: n.href, label: n.label }))}
        initialOrder={cfg.order}
        initialHidden={cfg.hidden}
        locked={[...LOCKED_NAV]}
        canEdit={canEdit}
      />
    </div>
  );
}
