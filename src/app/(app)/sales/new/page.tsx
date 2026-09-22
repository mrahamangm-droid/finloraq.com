import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NewInvoiceForm } from "@/components/forms/new-invoice-form";

export default async function NewInvoicePage() {
  const { active } = await requireTenantContext();

  const [customers, taxCodes] = await Promise.all([
    prisma.customer.findMany({ where: { companyId: active.companyId }, orderBy: { name: "asc" } }),
    prisma.taxCode.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Invoice</h1>
      <NewInvoiceForm
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        taxCodes={taxCodes.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
      />
    </div>
  );
}
