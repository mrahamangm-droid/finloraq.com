import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NewBillForm } from "@/components/forms/new-bill-form";

export default async function NewBillPage() {
  const { active } = await requireTenantContext();

  const [suppliers, taxCodes] = await Promise.all([
    prisma.supplier.findMany({ where: { companyId: active.companyId }, orderBy: { name: "asc" } }),
    // The starter UAE tax pack seeds one shared rate set for now (see
    // src/lib/onboarding.ts) rather than separate input/output codes, so
    // this doesn't filter on isInput yet — a real country tax pack would.
    prisma.taxCode.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Bill</h1>
      <NewBillForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        taxCodes={taxCodes.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
      />
    </div>
  );
}
