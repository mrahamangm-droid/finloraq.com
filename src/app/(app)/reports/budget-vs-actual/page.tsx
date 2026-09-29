import { requireTenantContext } from "@/lib/tenant";
import { listBudgets, budgetVsActual } from "@/lib/budget";
import { getFormatter } from "@/lib/customization/server";
import { ReportActions } from "@/components/reports/report-actions";
import Link from "next/link";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function BudgetVsActualPage(
  props: { searchParams: Promise<{ budgetId?: string; months?: string }> }
) {
  const sp = await props.searchParams;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const budgets = await listBudgets(active.companyId, active.id);

  const selectedBudgetId = sp.budgetId ?? budgets[0]?.id;
  const selectedMonths = sp.months
    ? sp.months.split(",").map(Number).filter((m) => m >= 1 && m <= 12)
    : undefined;

  let data: Awaited<ReturnType<typeof budgetVsActual>> | null = null;
  if (selectedBudgetId) {
    data = await budgetVsActual(active.companyId, active.id, selectedBudgetId, selectedMonths);
  }

  const displayMonths = selectedMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div id="report-content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Budget vs Actual</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <ReportActions title="Budget vs Actual" company={active.company.name} />
      </div>

      {/* Filters */}
      <form method="get" className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Budget</label>
          <select name="budgetId" defaultValue={selectedBudgetId}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            {budgets.map((b: { id: string; name: string; fiscalYear: number }) => (
              <option key={b.id} value={b.id}>{b.name} ({b.fiscalYear})</option>
            ))}
          </select>
        </div>
        <button type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          Apply
        </button>
        {budgets.length === 0 && (
          <span className="text-sm text-muted-foreground">
            No budgets yet.{" "}
            <Link href="/accounting/budgets/new" className="text-primary hover:underline">Create your first budget</Link>
          </span>
        )}
      </form>

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs uppercase text-muted-foreground">Total Budget</div>
              <div className="mt-1 text-lg font-semibold text-card-foreground">
                {data.budget.currency} {fmt.money(data.rows.reduce((a, r) => a + r.totalBudget, 0))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs uppercase text-muted-foreground">Total Actual</div>
              <div className="mt-1 text-lg font-semibold text-card-foreground">
                {data.budget.currency} {fmt.money(data.rows.reduce((a, r) => a + r.totalActual, 0))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs uppercase text-muted-foreground">Total Variance</div>
              {(() => {
                const v = data.rows.reduce((a, r) => a + r.totalVariance, 0);
                return (
                  <div className={`mt-1 text-lg font-semibold ${v > 0 ? "text-red-600 dark:text-red-400" : v < 0 ? "text-green-600 dark:text-green-400" : "text-card-foreground"}`}>
                    {v > 0 ? "+" : ""}{fmt.money(v)}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Report table — scrolls horizontally for many months */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-muted/40 px-4 py-2 text-left">Account</th>
                    {displayMonths.map((m) => (
                      <th key={m} colSpan={3} className="border-l border-border px-2 py-2 text-center">
                        {MONTH_NAMES[m - 1]}
                      </th>
                    ))}
                    <th colSpan={3} className="border-l border-border px-2 py-2 text-center">Total</th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 bg-muted/40 px-4 py-1" />
                    {displayMonths.map((m) => (
                      <th key={`${m}-sub`} className="px-2 py-1 text-right font-normal text-muted-foreground/70">
                        <span className="block">Bgt</span>
                        <span className="block">Act</span>
                        <span className="block">Var</span>
                      </th>
                    ))}
                    <th className="border-l border-border px-2 py-1 text-right font-normal text-muted-foreground/70">
                      <span className="block">Bgt</span>
                      <span className="block">Act</span>
                      <span className="block">Var</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={displayMonths.length * 3 + 4} className="px-4 py-8 text-center text-muted-foreground">
                        No budget data for the selected period.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row) => (
                    <tr key={row.accountCode} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="sticky left-0 bg-card px-4 py-2">
                        <div className="font-medium text-card-foreground text-xs">{row.accountCode}</div>
                        <div className="text-muted-foreground text-xs">{row.accountName}</div>
                      </td>
                      {row.months.filter((m) => displayMonths.includes(m.month)).map((m) => {
                        const varClass = m.variance > 0.5
                          ? "text-red-600 dark:text-red-400"
                          : m.variance < -0.5
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground";
                        return (
                          <td key={m.month} className="px-2 py-2 text-right text-xs">
                            <div className="text-muted-foreground">{m.budget ? fmt.money(m.budget) : "—"}</div>
                            <div className="text-card-foreground">{m.actual ? fmt.money(m.actual) : "—"}</div>
                            <div className={varClass}>{m.variance !== 0 ? (m.variance > 0 ? "+" : "") + fmt.money(m.variance) : "—"}</div>
                          </td>
                        );
                      })}
                      <td className="border-l border-border px-2 py-2 text-right text-xs">
                        <div className="text-muted-foreground font-medium">{fmt.money(row.totalBudget)}</div>
                        <div className="text-card-foreground font-medium">{fmt.money(row.totalActual)}</div>
                        <div className={`font-medium ${row.totalVariance > 0 ? "text-red-600 dark:text-red-400" : row.totalVariance < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                          {row.totalVariance !== 0 ? (row.totalVariance > 0 ? "+" : "") + fmt.money(row.totalVariance) : "—"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Bgt = Budget · Act = Actual · Var = Actual − Budget · Fiscal Year {data.budget.fiscalYear}
          </p>
        </>
      )}
    </div>
  );
}
