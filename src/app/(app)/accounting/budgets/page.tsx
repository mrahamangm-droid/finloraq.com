import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { can } from "@/lib/rbac";
import { listBudgets } from "@/lib/budget";

export const metadata = { title: "Budgets — Finloraq" };

export default async function BudgetsPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "reports");
  if (denied) return denied;
  const [budgets, canCreate] = await Promise.all([
    listBudgets(active.companyId, active.id),
    can(active.id, "reports", "CREATE"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Budgets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Annual budgets by account and month, used in the Budget vs Actual report.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/accounting/budgets/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New Budget
          </Link>
        )}
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No budgets yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create an annual budget to track planned vs actual spending.
          </p>
          {canCreate && (
            <Link
              href="/accounting/budgets/new"
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create your first budget
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fiscal Year</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Currency</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Line Items</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {budgets.map((b: {
                id: string;
                name: string;
                fiscalYear: number;
                currency: string;
                createdAt: Date;
                _count: { items: number };
              }) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.fiscalYear}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.currency}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{b._count.items}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/reports/budget-vs-actual?budgetId=${b.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted/50"
                      >
                        View Report
                      </Link>
                      <Link
                        href={`/accounting/budgets/${b.id}/edit`}
                        className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded border border-primary/30 hover:bg-primary/5"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <Link href="/reports/budget-vs-actual" className="text-primary hover:underline">
          Open Budget vs Actual report →
        </Link>
      </div>
    </div>
  );
}
