import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewRecurringInvoiceForm } from "@/components/forms/new-recurring-invoice-form";

export default async function NewRecurringInvoicePage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "invoices", "CREATE");

  const [customers, taxCodes] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.taxCode.findMany({
      where: { companyId: active.companyId, isActive: true, isInput: false },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, rate: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Recurring Invoice</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>
      <NewRecurringInvoiceForm
        customers={customers}
        taxCodes={taxCodes.map((t: any) => ({ ...t, rate: t.rate.toString() }))}
        baseCurrency={active.company.baseCurrency ?? "USD"}
      />
    </div>
  );
}
