import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { listReconciliations } from "@/lib/bank-reconciliation";
import { getFormatter } from "@/lib/customization/server";
import { createReconciliationAction } from "./actions";

export async function generateMetadata(props: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await props.params;
  return { title: `Reconcile · ${accountId}` };
}

export default async function ReconcileListPage(props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  const { accountId } = params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, companyId: active.companyId },
  });
  if (!account) notFound();

  const [reconciliations, canEdit] = await Promise.all([
    listReconciliations(active.companyId, accountId),
    can(active.id, "banking", "EDIT"),
  ]);

  const currency = account.currency;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reconcile · {account.name}</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link href="/banking" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Banking
        </Link>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">New Reconciliation</h2>
          <form action={createReconciliationAction.bind(null, accountId)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Statement date</label>
              <input
                type="date"
                name="statementDate"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Opening balance ({currency})</label>
              <input
                type="number"
                step="0.01"
                name="openingBalance"
                required
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Statement closing balance ({currency})</label>
              <input
                type="number"
                step="0.01"
                name="closingBalance"
                required
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start Reconciliation
              </button>
            </div>
          </form>
        </div>
      )}

      {reconciliations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No reconciliations yet. Start one above to match your bank statement.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Statement date</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Opening</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Closing</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">Txns</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reconciliations.map((r: (typeof reconciliations)[number]) => (
                <tr key={r.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-2 text-card-foreground">{fmt.date(r.statementDate)}</td>
                  <td className="px-4 py-2 text-right font-mono text-card-foreground">{fmt.money(r.openingBalance)}</td>
                  <td className="px-4 py-2 text-right font-mono text-card-foreground">{fmt.money(r.closingBalance)}</td>
                  <td className="px-4 py-2 text-center text-muted-foreground">{r.transactionCount}</td>
                  <td className="px-4 py-2 text-center">
                    {r.status === "COMPLETED" ? (
                      <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.status === "DRAFT" && canEdit && (
                      <Link
                        href={`/banking/${accountId}/reconcile/${r.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Continue →
                      </Link>
                    )}
                    {r.status === "COMPLETED" && (
                      <Link
                        href={`/banking/${accountId}/reconcile/${r.id}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
