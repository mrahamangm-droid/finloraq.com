import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { BillActions } from "@/components/forms/bill-actions";

export default async function BillDetailPage({ params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();

  const bill = await prisma.bill.findFirst({
    where: { id: params.id, companyId: active.companyId },
    include: { supplier: true, lines: { include: { taxCode: true } } },
  });
  if (!bill) notFound();

  const payments = await prisma.journalEntry.findMany({
    where: { companyId: active.companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${bill.id}:` }, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const paid = payments
    .flatMap((e) => e.lines.filter((l) => l.account.code === "1000"))
    .reduce((a, l) => a + l.credit.toNumber(), 0);
  const balanceDue = bill.total.toNumber() - paid;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Bill {bill.billNumber}</h1>
        <p className="text-sm text-muted-foreground">{bill.supplier.name} · {bill.status}</p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-card-foreground">{l.description}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.quantity.toString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-card-foreground">{l.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-border px-3 py-2 text-right text-sm">
          <div className="text-muted-foreground">Subtotal {bill.subtotal.toFixed(2)}</div>
          <div className="text-muted-foreground">Tax {bill.taxTotal.toFixed(2)}</div>
          <div className="font-medium text-card-foreground">Total {bill.total.toFixed(2)} {bill.currency}</div>
          {paid > 0 && <div className="text-success">Paid {paid.toFixed(2)}</div>}
          {bill.status !== "PAID" && bill.status !== "DRAFT" && (
            <div className="font-medium text-card-foreground">Balance due {balanceDue.toFixed(2)}</div>
          )}
        </div>
      </div>

      <BillActions billId={bill.id} status={bill.status} balanceDue={balanceDue} />
    </div>
  );
}
