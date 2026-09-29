import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getReconciliation } from "@/lib/bank-reconciliation";
import { getFormatter } from "@/lib/customization/server";
import { toggleTransactionAction, completeReconciliationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReconciliationWorkspacePage(props: {
  params: Promise<{ accountId: string; reconId: string }>;
}) {
  const params = await props.params;
  const { accountId, reconId } = params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const data = await getReconciliation(active.companyId, reconId);
  if (!data || data.bankAccount.id !== accountId) notFound();

  const canEdit = await can(active.id, "banking", "EDIT");
  const { summary, transactions, bankAccount } = data;
  const isLocked = summary.status === "COMPLETED";
  const balanced = Math.abs(summary.difference) < 0.005;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Reconcile · {bankAccount.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Statement date: {fmt.date(summary.statementDate)}
          </p>
        </div>
        <Link
          href={`/banking/${accountId}/reconcile`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All reconciliations
        </Link>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Opening balance</div>
          <div className="mt-1 font-mono text-sm font-semibold text-card-foreground">
            {fmt.money(summary.openingBalance)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Statement closing</div>
          <div className="mt-1 font-mono text-sm font-semibold text-card-foreground">
            {fmt.money(summary.closingBalance)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Cleared transactions</div>
          <div className="mt-1 font-mono text-sm font-semibold text-card-foreground">
            {fmt.money(summary.clearedBalance)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({summary.clearedCount} items)
            </span>
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${balanced ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
          <div className="text-xs uppercase text-muted-foreground">Difference</div>
          <div className={`mt-1 font-mono text-sm font-semibold ${balanced ? "text-success" : "text-warning"}`}>
            {fmt.money(summary.difference)}
            {balanced && <span className="ml-1 text-xs">✓ Balanced</span>}
          </div>
        </div>
      </div>

      {/* Status / complete button */}
      {!isLocked && canEdit && (
        <form action={completeReconciliationAction.bind(null, accountId, reconId)}>
          <button
            type="submit"
            disabled={!balanced}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {balanced ? "Complete Reconciliation" : "Balance to complete"}
          </button>
        </form>
      )}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-2 text-sm text-success">
          <span>✓</span>
          <span>
            Reconciliation completed
            {summary.completedAt && ` on ${fmt.date(summary.completedAt)}`}.
          </span>
        </div>
      )}

      {/* Transaction table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {!isLocked && canEdit && <th className="w-10 px-3 py-2" />}
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No transactions available. Add transactions from the Banking page first.
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className={`bg-card ${tx.cleared ? "bg-success/5" : "hover:bg-muted/20"}`}
              >
                {!isLocked && canEdit && (
                  <td className="px-3 py-2 text-center">
                    <form
                      action={toggleTransactionAction.bind(
                        null,
                        accountId,
                        reconId,
                        tx.id,
                        !tx.cleared
                      )}
                    >
                      <button
                        type="submit"
                        className={`h-4 w-4 rounded border transition-colors ${
                          tx.cleared
                            ? "border-success bg-success text-success-foreground"
                            : "border-border bg-background"
                        }`}
                        aria-label={tx.cleared ? "Unmark cleared" : "Mark cleared"}
                      >
                        {tx.cleared && <span className="block text-[10px] leading-none">✓</span>}
                      </button>
                    </form>
                  </td>
                )}
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {fmt.date(tx.date)}
                </td>
                <td className="px-4 py-2 text-card-foreground">{tx.description}</td>
                <td
                  className={`px-4 py-2 text-right font-mono text-sm font-medium ${
                    tx.amount >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {fmt.money(tx.amount)}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className="text-xs capitalize text-muted-foreground">
                    {tx.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
