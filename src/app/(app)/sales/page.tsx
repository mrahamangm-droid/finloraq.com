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

export default async function SalesPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  // Capped rather than paginated for now (Phase 9 perf pass) — a company
  // with more than 200 invoices needs a real paginated/searchable list,
  // which is a bigger UI change than a safety cap; this at least stops
  // the page from loading every invoice ever issued into one response.
  const invoices = await prisma.invoice.findMany({
    where: { companyId: active.companyId },
    orderBy: { issueDate: "desc" },
    include: { customer: true },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sales — Invoices</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link href="/sales/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          New Invoice
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Issue date</th>
                <th className="px-4 py-2">Due date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No invoices yet.</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/sales/${inv.id}`} className="font-mono text-xs text-primary">{inv.invoiceNumber}</Link>
                  </td>
                  <td className="px-4 py-2 text-card-foreground">{inv.customer.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.issueDate)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.dueDate)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(inv.total)} {inv.currency}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(inv.status)}`}>{inv.status}</span>
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
