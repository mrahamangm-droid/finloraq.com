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
  POSTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  APPLIED: "bg-success/10 text-success",
  VOID: "bg-destructive/10 text-destructive",
};

export default async function CreditNotesPage(props: { searchParams?: Promise<{ page?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const page = parsePage(sp.page);
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "credit_notes");
  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const [creditNotes, canCreate, total] = await Promise.all([
    prisma.creditNote.findMany({
      where: { companyId: active.companyId },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }], // id breaks ties so pages never overlap
      include: { customer: true, invoice: { select: { invoiceNumber: true } } },
      ...pageWindow(page),
    }),
    can(active.id, "credit_notes", "CREATE"),
    prisma.creditNote.count({ where: { companyId: active.companyId } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Credit Notes</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        {canCreate && (
          <Link
            href="/credit-notes/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            New Credit Note
          </Link>
        )}
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Number</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Invoice</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {creditNotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No credit notes yet.{" "}
                  {canCreate && (
                    <Link href="/credit-notes/new" className="text-primary underline">
                      Issue a credit note
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {creditNotes.map((cn: any) => (
              <tr key={cn.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/credit-notes/${cn.id}`} className="text-primary hover:underline">
                    {cn.creditNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{cn.customer.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {cn.invoice ? (
                    <Link href={`/sales/${cn.invoiceId}`} className="text-primary hover:underline">
                      {cn.invoice.invoiceNumber}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 tabular-nums">{fmt.date(cn.issueDate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(cn.total)} {cn.currency}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[cn.status] ?? "bg-muted text-muted-foreground"}`}>
                    {cn.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination path="/credit-notes" params={sp} page={page} total={total} noun="credit notes" />
    </div>
  );
}
