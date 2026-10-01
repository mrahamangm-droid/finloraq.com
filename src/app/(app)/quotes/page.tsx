import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { Pagination } from "@/components/pagination";
import { pageWindow, parsePage } from "@/lib/pagination";
import { can } from "@/lib/rbac";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  ACCEPTED: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  INVOICED: "bg-primary/10 text-primary",
};

export default async function QuotesPage(props: { searchParams?: Promise<{ page?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const page = parsePage(sp.page);
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "quotes");
  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const [quotes, canCreate, total] = await Promise.all([
    prisma.quote.findMany({
      where: { companyId: active.companyId },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }], // id breaks ties so pages never overlap
      include: { customer: true },
      ...pageWindow(page),
    }),
    can(active.id, "quotes", "CREATE"),
    prisma.quote.count({ where: { companyId: active.companyId } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quotes</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        {canCreate && (
          <Link
            href="/quotes/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            New Quote
          </Link>
        )}
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Number</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Expiry</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No quotes yet.{" "}
                  {canCreate && (
                    <Link href="/quotes/new" className="text-primary underline">
                      Create your first quote
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {quotes.map((q: any) => (
              <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/quotes/${q.id}`} className="text-primary hover:underline">
                    {q.quoteNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{q.customer.name}</td>
                <td className="px-4 py-2 tabular-nums">
                  {fmt.date(q.issueDate)}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {q.expiryDate ? fmt.date(q.expiryDate) : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {fmt.money(q.total)} {q.currency}
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[q.status] ?? "bg-muted text-muted-foreground"}`}>
                    {q.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination path="/quotes" params={sp} page={page} total={total} noun="quotes" />
    </div>
  );
}
