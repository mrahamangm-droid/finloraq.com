import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewPurchaseOrderForm } from "@/components/forms/new-purchase-order-form";

export default async function NewPurchaseOrderPage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "purchase_orders", "CREATE");

  const [suppliers, taxCodes, projects] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Purchase Order</h1>
      <NewPurchaseOrderForm
        suppliers={suppliers.map((s: any) => ({ id: s.id, name: s.name, currency: s.currency ?? "USD" }))}
        taxCodes={taxCodes.map((t: any) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        projects={projects}
      />
    </div>
  );
}
