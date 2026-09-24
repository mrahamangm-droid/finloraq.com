import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { listCustomFields } from "@/lib/customization/server";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { CustomFieldsManager } from "@/components/settings/customize/custom-fields-manager";

export const metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const { active } = await requireTenantContext();
  const [fields, canEdit] = await Promise.all([listCustomFields(active.companyId, undefined, false), can(active.id, "settings", "EDIT")]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Track the extra details your business needs on customers, suppliers and invoices.</p>
      </div>
      <SettingsTabs />
      <CustomFieldsManager
        canEdit={canEdit}
        fields={fields.map((f) => ({ id: f.id, entity: f.entity, key: f.key, label: f.label, type: f.type, options: f.options, required: f.required, isActive: f.isActive }))}
      />
    </div>
  );
}
