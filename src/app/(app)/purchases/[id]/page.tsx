import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { BillActions } from "@/components/forms/bill-actions";
import { VoidDocument } from "@/components/forms/void-document";
import { getBankAccountCode } from "@/lib/accounts";

export default async function BillDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "bills");
  if (denied) return denied;
  const [fmt, canEdit, canDelete, canVoid] = await Promise.all([
    getFormatter(userId),
    can(active.id, "bills", "EDIT"),
    can(active.id, "bills", "DELETE"),
    // Voiding reverses the bill's posting: bills:APPROVE plus journals:APPROVE.
    Promise.all([can(active.id, "bills", "APPROVE"), can(active.id, "journals", "APPROVE")]).then(([a, b]) => a && b),
  ]);

  const bill = await prisma.bill.findFirst({
    where: { id: id, companyId: active.companyId },
    include: { supplier: true, lines: { include: { taxCode: true } } },
  });
  if (!bill) notFound();

  const [payments, bankAccountCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId: active.companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${bill.id}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    getBankAccountCode(active.companyId),
  ]);
  const paid = payments
    .flatMap((e: any) => e.lines.filter((l: any) => l.account.code === bankAccountCode))
    .reduce((a: any, l: any) => a + l.credit.toNumber(), 0);
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
              {bill.lines.map((l: any) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-card-foreground">{l.description}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.quantity.toString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt.money(l.unitPrice)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-card-foreground">{fmt.money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-border px-3 py-2 text-right text-sm">
          <div className="text-muted-foreground">Subtotal {fmt.money(bill.subtotal)}</div>
          <div className="text-muted-foreground">Tax {fmt.money(bill.taxTotal)}</div>
          <div className="font-medium text-card-foreground">Total {fmt.money(bill.total)} {bill.currency}</div>
          {paid > 0 && <div className="text-success">Paid {fmt.money(paid)}</div>}
          {bill.status !== "PAID" && bill.status !== "DRAFT" && (
            <div className="font-medium text-card-foreground">Balance due {fmt.money(balanceDue)}</div>
          )}
        </div>
      </div>

      <BillActions billId={bill.id} status={bill.status} balanceDue={balanceDue} canEdit={canEdit} canDelete={canDelete} />

      {["APPROVED", "OVERDUE"].includes(bill.status) && payments.length === 0 && canVoid && <VoidDocument kind="bill" id={bill.id} />}
    </div>
  );
}
