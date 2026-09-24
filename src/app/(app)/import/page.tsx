import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getPreferences } from "@/lib/customization/server";
import { TEMPLATES } from "@/lib/import/rows";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import past data" };

export default async function ImportPage() {
  const { active, userId } = await requireTenantContext();
  const [canPost, canInvoice, canBill, canAddAccounts, prefs] = await Promise.all([
    can(active.id, "journals", "APPROVE"),
    can(active.id, "invoices", "CREATE"),
    can(active.id, "bills", "APPROVE"),
    can(active.id, "settings", "EDIT"),
    getPreferences(userId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Import past data</h1>
        <p className="text-sm text-muted-foreground">
          Bring in previous years from a spreadsheet. Every row keeps the date in your sheet, so it shows up in the right
          day, week, month and year on the dashboard and in every report.
        </p>
      </div>
      <ImportWizard
        templates={TEMPLATES}
        currency={active.company.baseCurrency}
        dateFormat={prefs.dateFormat}
        permissions={{ transactions: canPost, invoices: canInvoice && canPost, bills: canBill && canPost, addAccounts: canAddAccounts }}
      />
    </div>
  );
}
