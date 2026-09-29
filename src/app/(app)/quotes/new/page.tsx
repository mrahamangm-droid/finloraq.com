import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NewQuoteForm } from "@/components/forms/new-quote-form";

export default async function NewQuotePage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "quotes", "CREATE");

  const [customers, taxCodes, deals, projects] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    prisma.taxCode.findMany({
      where: { companyId: active.companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, rate: true },
    }),
    prisma.deal.findMany({
      where: { companyId: active.companyId, closedWon: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
      take: 100,
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
      <h1 className="text-xl font-semibold text-foreground">New Quote</h1>
      <NewQuoteForm
        customers={customers.map((c: any) => ({ id: c.id, name: c.name, currency: c.currency ?? "USD" }))}
        taxCodes={taxCodes.map((t: any) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        deals={deals}
        projects={projects}
      />
    </div>
  );
}
