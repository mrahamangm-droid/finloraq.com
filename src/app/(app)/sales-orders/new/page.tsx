import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { prisma } from "@/lib/db";
import { NewSalesOrderForm } from "@/components/forms/new-sales-order-form";

export default async function NewSalesOrderPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "sales_orders");
  if (denied) return denied;

  const [customers, taxCodes, products] = await Promise.all([
    prisma.customer.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.taxCode.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Sales Order</h1>
      <NewSalesOrderForm
        currency={active.company.baseCurrency}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        taxCodes={taxCodes.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        products={products.map((p) => ({ id: p.id, name: p.name, unitPrice: p.unitPrice.toNumber(), trackInventory: p.trackInventory, quantityOnHand: p.quantityOnHand.toNumber() }))}
      />
    </div>
  );
}
