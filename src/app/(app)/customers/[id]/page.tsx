import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getFormatter } from "@/lib/customization/server";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Customer — Finloraq` };
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:           "bg-muted text-muted-foreground",
  SENT:            "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  OVERDUE:         "bg-destructive/10 text-destructive",
  PARTIALLY_PAID:  "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PAID:            "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  VOID:            "bg-muted/40 text-muted-foreground line-through",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", OVERDUE: "Overdue",
  PARTIALLY_PAID: "Part paid", PAID: "Paid", VOID: "Void",
};

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: active.companyId },
  });
  if (!customer) notFound();

  // Load invoices, credit notes and CRM activities concurrently
  const [invoices, creditNotes, activities] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: id, companyId: active.companyId },
      orderBy: { issueDate: "desc" },
      take: 50,
      select: {
        id: true, invoiceNumber: true, issueDate: true, dueDate: true,
        status: true, total: true, currency: true,
      },
    }),
    prisma.creditNote.findMany({
      where: { customerId: id, companyId: active.companyId },
      orderBy: { issueDate: "desc" },
      take: 20,
      select: { id: true, creditNumber: true, issueDate: true, total: true, status: true },
    }).catch(() => []),  // graceful if CreditNote model not available
    prisma.crmActivity.findMany({
      where: { companyId: active.companyId, customerId: id },
      orderBy: { dueDate: "desc" },
      take: 10,
      select: { id: true, type: true, subject: true, dueDate: true, completedAt: true },
    }).catch(() => []),
  ]);

  // Calculate AR balance from open invoices
  const openInvoices = invoices.filter(
    (i: any) => i.status === "SENT" || i.status === "OVERDUE" || i.status === "PARTIALLY_PAID"
  );
  const totalOutstanding = openInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalInvoiced    = invoices.reduce((s: number, i: any) => s + Number(i.total), 0);

  const currency = (customer as any).currency ?? active.company.baseCurrency ?? "USD";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/customers" className="hover:text-foreground">Customers</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{customer.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{customer.name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {customer.email && <span>{customer.email}</span>}
            {customer.phone && <span>{customer.phone}</span>}
            {(customer as any).taxRegNumber && (
              <span>TRN: {(customer as any).taxRegNumber}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/customers/${id}/statement`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            Statement
          </Link>
          <Link
            href={`/sales/new?customerId=${id}`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New invoice
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${totalOutstanding > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
            {fmt.money(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{openInvoices.length} open invoice{openInvoices.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total invoiced</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{fmt.money(totalInvoiced)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment terms</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {(customer as any).paymentTermsDays ?? 30}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">days net</p>
        </div>
      </div>

      {/* Invoices */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Invoices
          </h2>
          <Link href={`/sales?customerId=${id}`} className="text-xs text-muted-foreground hover:text-foreground">
            All invoices →
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No invoices yet.{" "}
            <Link href={`/sales/new?customerId=${id}`} className="text-primary hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Issued</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link href={`/sales/${inv.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {fmt.date(new Date(inv.issueDate))}
                    </td>
                    <td className={`px-4 py-2 text-xs ${inv.status === "OVERDUE" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                      {fmt.date(new Date(inv.dueDate))}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOUR[inv.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-foreground">
                      {fmt.money(Number(inv.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credit notes (if any) */}
      {creditNotes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Credit Notes</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left">Number</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creditNotes.map((cn: any) => (
                  <tr key={cn.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link href={`/credit-notes/${cn.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {cn.creditNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{fmt.date(new Date(cn.issueDate))}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {cn.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-foreground">
                      {fmt.money(Number(cn.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent CRM activities */}
      {activities.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activities</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {activities.map((a: any) => (
              <div key={a.id} className="flex items-start justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.type}</p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{fmt.date(new Date(a.dueDate))}</p>
                  {a.completedAt && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Done</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
