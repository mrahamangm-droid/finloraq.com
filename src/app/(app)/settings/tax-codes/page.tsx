import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { viewGate } from "@/lib/page-access";
import { listTaxCodes } from "@/lib/taxCodes";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { TaxCodesManager } from "@/components/settings/tax-codes-manager";

export const metadata = { title: "Tax Codes — Finloraq" };

export default async function TaxCodesSettingsPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "taxes");
  if (denied) return denied;

  const [canEdit, taxCodes] = await Promise.all([
    can(active.id, "settings", "EDIT"),
    listTaxCodes(active.companyId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Tax codes set the rate and VAT treatment on invoice, bill and other document lines. A code that&apos;s already
          been used keeps its rate forever — deactivate it and add a new one when a rate changes. The{" "}
          <Link href="/taxes" className="text-primary hover:underline">VAT return</Link> is computed from the ledger.
        </p>
      </div>

      <SettingsTabs />

      <TaxCodesManager
        canEdit={canEdit}
        rows={taxCodes.map((tc) => ({
          id: tc.id,
          code: tc.code,
          name: tc.name,
          rate: tc.rate.toString(),
          treatment: tc.treatment,
          isInput: tc.isInput,
          isActive: tc.isActive,
          usageCount: tc.usageCount,
        }))}
      />
    </div>
  );
}
