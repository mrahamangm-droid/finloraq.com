import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: Date;
  total: { toFixed: (d: number) => string } | number;
  currency: string;
  status: string;
  customer: { name: string; email: string | null };
}

interface AuditRow {
  id: string;
  entityId: string;
  action: string;
  createdAt: Date;
  newValue: unknown;
}

export const metadata = { title: "Payment Reminders — Finloraq" };

/**
 * Read-only view of all payment reminder activity for this company.
 * Pulls from AuditEvent rows where action IN ("payment_reminder.sent",
 * "payment_reminder.failed") so nothing extra is stored.
 *
 * Also shows invoices that are currently overdue and haven't had a
 * reminder sent yet (or haven't had one in the last 7 days), giving
 * the user a clear action list.
 */
export default async function PaymentRemindersPage(props: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await props.searchParams;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "invoices", "VIEW");

  const page = Math.max(1, Number(sp.page ?? 1));
  const PAGE = 50;

  // Reminder history from AuditEvent
  const [historyRows, historyTotal] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        companyId: active.companyId,
        action: { in: ["payment_reminder.sent", "payment_reminder.failed"] },
        entityType: "Invoice",
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.auditEvent.count({
      where: {
        companyId: active.companyId,
        action: { in: ["payment_reminder.sent", "payment_reminder.failed"] },
        entityType: "Invoice",
      },
    }),
  ]);

  // Invoices currently overdue with a customer email but NO recent reminder
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentReminderInvoiceIds = await prisma.auditEvent
    .findMany({
      where: {
        companyId: active.companyId,
        action: "payment_reminder.sent",
        entityType: "Invoice",
        createdAt: { gte: cutoff },
      },
      select: { entityId: true },
    })
    .then((rows: Array<{ entityId: string }>) => rows.map((r) => r.entityId));

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      companyId: active.companyId,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      dueDate: { lt: new Date() },
      customer: { email: { not: null } },
      id: { notIn: recentReminderInvoiceIds },
    },
    include: { customer: { select: { name: true, email: true } } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });

  const totalPages = Math.ceil(historyTotal / PAGE);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Payment Reminders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated daily reminders for overdue invoices. Reminders are sent at most once every 7 days per invoice.
        </p>
      </div>

      {/* Awaiting reminder */}
      {overdueInvoices.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Overdue — No Recent Reminder</h2>
            <span className="text-xs bg-destructive/10 text-destructive rounded-full px-2 py-0.5">
              {overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Due</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {overdueInvoices.map((inv: OverdueInvoice) => {
                  const daysOverdue = Math.floor((Date.now() - inv.dueDate.getTime()) / 86_400_000);
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/sales/${inv.id}`} className="font-mono text-xs text-primary hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{inv.customer.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{inv.customer.email}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {inv.currency} {Number(inv.total).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-destructive whitespace-nowrap">
                        {inv.dueDate.toLocaleDateString()}
                        <span className="ml-1 text-muted-foreground">({daysOverdue}d ago)</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          inv.status === "OVERDUE"
                            ? "bg-destructive/10 text-destructive"
                            : inv.status === "PARTIALLY_PAID"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-blue-500/10 text-blue-600"
                        }`}>
                          {inv.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            These invoices will receive a reminder the next time the daily reminder job runs (08:00 UTC).
            Make sure <code className="bg-muted px-1 rounded">RESEND_API_KEY</code> is configured to send live emails.
          </p>
        </section>
      )}

      {overdueInvoices.length === 0 && historyTotal === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No overdue invoices awaiting reminders and no reminder history yet.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Reminders are sent automatically each day for overdue invoices where the customer has an email address on file.
          </p>
        </div>
      )}

      {/* History */}
      {historyTotal > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Reminder History</h2>
            <span className="text-xs text-muted-foreground">{historyTotal.toLocaleString()} events</span>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date &amp; Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Recipient</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row: AuditRow) => {
                  const meta = (row.newValue ?? {}) as Record<string, unknown>;
                  const success = row.action === "payment_reminder.sent";
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.createdAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {meta.invoiceNumber ? (
                          <Link href={`/sales/${row.entityId}`} className="font-mono text-xs text-primary hover:underline">
                            {String(meta.invoiceNumber)}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">{row.entityId.slice(0, 12)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {meta.to ? String(meta.to) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {success ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                            Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive" title={meta.error ? String(meta.error) : undefined}>
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />
                            Failed
                            {Boolean(meta.error) && (
                              <span className="text-muted-foreground ml-1 truncate max-w-xs">— {String(meta.error).slice(0, 80)}</span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={`?page=${page - 1}`} className="rounded border border-border px-2.5 py-1 hover:bg-muted/50">
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={`?page=${page + 1}`} className="rounded border border-border px-2.5 py-1 hover:bg-muted/50">
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
