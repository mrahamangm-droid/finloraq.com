import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";

function statusColor(status: string) {
  if (status === "PAID") return "bg-success/10 text-success";
  if (status === "OVERDUE") return "bg-destructive/10 text-destructive";
  if (status === "DRAFT") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

export default async function PurchasesPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  // Same cap-not-paginate tradeoff as the Sales list (see its comment).
  const bills = await prisma.bill.findMany({
    where: { companyId: active.companyId },
    orderBy: { issueDate: "desc" },
    include: { supplier: true },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Purchases — Bills</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link href="/purchases/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          New Bill
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Bill #</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Issue date</th>
                <th className="px-4 py-2">Due date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No bills yet.</td></tr>
              )}
              {bills.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/purchases/${b.id}`} className="font-mono text-xs text-primary">{b.billNumber}</Link>
                  </td>
                  <td className="px-4 py-2 text-card-foreground">{b.supplier.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(b.issueDate)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(b.dueDate)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(b.total)} {b.currency}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(b.status)}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
