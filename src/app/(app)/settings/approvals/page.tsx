import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { listExpenseApprovalRules } from "@/lib/approvalRules";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { ApprovalRulesManager } from "@/components/settings/approval-rules-manager";

export const metadata = { title: "Approval rules" };

export default async function ApprovalRulesPage() {
  const { active } = await requireTenantContext();
  const [canView, canEdit] = await Promise.all([can(active.id, "settings", "VIEW"), can(active.id, "settings", "EDIT")]);
  if (!canView) {
    return <p className="text-sm text-muted-foreground">Your role in this company doesn&apos;t include viewing company settings.</p>;
  }
  const rules = await listExpenseApprovalRules(active.companyId);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Decide who must approve an expense, based on its amount.</p>
      </div>
      <SettingsTabs />
      <ApprovalRulesManager rules={rules} canEdit={canEdit} currency={active.company.baseCurrency} />
    </div>
  );
}
