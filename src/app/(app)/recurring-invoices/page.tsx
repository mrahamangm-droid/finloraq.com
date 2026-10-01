import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { listRecurringInvoices } from "@/lib/recurring-invoices";
import { getFormatter } from "@/lib/customization/server";
import { can } from "@/lib/rbac";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

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

export default async function RecurringInvoicesPage() {
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "recurring_invoices");
  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const [items, canCreate] = await Promise.all([
    listRecurringInvoices(active.companyId, active.id),
    can(active.id, "invoices", "CREATE"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Recurring Invoices</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        {canCreate && (
          <Link
            href="/recurring-invoices/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            + New Schedule
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Frequency</th>
                <th className="px-4 py-2">Next Run</th>
                <th className="px-4 py-2">Currency</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    No recurring schedules yet.{" "}
                    {canCreate && (
                      <Link href="/recurring-invoices/new" className="text-primary hover:underline">
                        Create one
                      </Link>
                    )}
                  </td>
                </tr>
              )}
              {items.map((ri: any) => (
                <tr key={ri.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/recurring-invoices/${ri.id}`}
                      className="font-medium text-card-foreground hover:text-primary hover:underline"
                    >
                      {ri.customer.name}
                    </Link>
                    {ri.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-xs">{ri.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {FREQUENCY_LABELS[ri.frequency] ?? ri.frequency}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ri.status === "ACTIVE" ? fmt.date(ri.nextRunAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ri.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[ri.status] ?? ""}`}>
                      {ri.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {ri._count.invoices}
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
