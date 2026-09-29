import { requireTenantContext } from "@/lib/tenant";
import { getRecurringInvoice } from "@/lib/recurring-invoices";
import { getFormatter } from "@/lib/customization/server";
import { can } from "@/lib/rbac";
import { RecurringInvoiceActions } from "@/components/recurring-invoices/recurring-invoice-actions";
import Link from "next/link";

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  PAUSED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ENDED: "bg-muted text-muted-foreground",
};

export default async function RecurringInvoicePage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const [ri, canEdit, canDelete] = await Promise.all([
    getRecurringInvoice(active.companyId, active.id, id),
    can(active.id, "invoices", "EDIT"),
    can(active.id, "invoices", "DELETE"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/recurring-invoices" className="hover:underline">Recurring Invoices</Link>
            {" / "}{ri.customer.name}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            Recurring Invoice — {ri.customer.name}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[ri.status] ?? ""}`}>
              {ri.status}
            </span>
            <span className="text-sm text-muted-foreground">
              {FREQUENCY_LABELS[ri.frequency] ?? ri.frequency}
            </span>
          </div>
        </div>
        <RecurringInvoiceActions ri={{ id: ri.id, status: ri.status as "ACTIVE" | "PAUSED" | "ENDED" }} canEdit={canEdit} canDelete={canDelete} hasInvoices={(ri.invoices?.length ?? 0) > 0} />
      </div>

      {/* Schedule info */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Frequency</div>
          <div className="mt-1 font-medium text-card-foreground">{FREQUENCY_LABELS[ri.frequency]}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Start Date</div>
          <div className="mt-1 font-medium text-card-foreground">{fmt.date(ri.startDate)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Next Run</div>
          <div className="mt-1 font-medium text-card-foreground">
            {ri.status === "ACTIVE" ? fmt.date(ri.nextRunAt) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">End Date</div>
          <div className="mt-1 font-medium text-card-foreground">
            {ri.endDate ? fmt.date(ri.endDate) : "No end"}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Line Items (template)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2">Tax</th>
              </tr>
            </thead>
            <tbody>
              {ri.lines.map((line: any) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-card-foreground">{line.description}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{fmt.money(Number(line.quantity))}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{ri.currency} {fmt.money(Number(line.unitPrice))}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {line.taxCode ? `${line.taxCode.code} (${(Number(line.taxCode.rate) * 100).toFixed(0)}%)` : "No tax"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generated invoices */}
      {ri.invoices.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Generated Invoices (last 10)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2">Issue Date</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ri.invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/sales/${inv.id}`} className="text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.issueDate)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.dueDate)}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs text-muted-foreground">{inv.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-card-foreground">
                      {inv.currency} {fmt.money(Number(inv.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ri.notes && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">Notes</div>
          <p className="text-sm text-card-foreground whitespace-pre-wrap">{ri.notes}</p>
        </div>
      )}
    </div>
  );
}
