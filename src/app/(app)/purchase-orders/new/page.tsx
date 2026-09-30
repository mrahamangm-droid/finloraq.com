import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewPurchaseOrderForm } from "@/components/forms/new-purchase-order-form";

export default async function NewPurchaseOrderPage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "purchase_orders", "CREATE");

  const [suppliers, taxCodes, projects, products] = await Promise.all([
    prisma.supplier.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.taxCode.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, rate: true },
    }),
    prisma.project.findMany({
      where: { companyId: active.companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 100,
    }),
    prisma.product.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unitPrice: true, trackInventory: true, quantityOnHand: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Purchase Order</h1>
      <NewPurchaseOrderForm
        baseCurrency={active.company.baseCurrency}
        suppliers={suppliers.map((s: any) => ({ id: s.id, name: s.name, currency: s.currency ?? active.company.baseCurrency }))}
        products={products.map((p: any) => ({ id: p.id, name: p.name, cost: Number(p.unitPrice), trackInventory: p.trackInventory, quantityOnHand: Number(p.quantityOnHand) }))}
        taxCodes={taxCodes.map((t: any) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        projects={projects}
      />
    </div>
  );
}
