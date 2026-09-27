import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NewBillForm } from "@/components/forms/new-bill-form";

export default async function EditBillPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active } = await requireTenantContext();

  const [bill, suppliers, taxCodes] = await Promise.all([
    prisma.bill.findFirst({
      where: { id: params.id, companyId: active.companyId },
      include: { lines: true },
    }),
    prisma.supplier.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.taxCode.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!bill) notFound();
  if (bill.status !== "DRAFT") notFound(); // only a draft can be edited — see updateBill() in src/lib/purchases.ts

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Edit Bill {bill.billNumber}</h1>
      <NewBillForm
        billId={bill.id}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        taxCodes={taxCodes.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        initial={{
          supplierId: bill.supplierId,
          issueDate: bill.issueDate.toISOString().slice(0, 10),
          dueDate: bill.dueDate.toISOString().slice(0, 10),
          lines: bill.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            taxCodeId: l.taxCodeId ?? "",
          })),
        }}
      />
    </div>
  );
}
