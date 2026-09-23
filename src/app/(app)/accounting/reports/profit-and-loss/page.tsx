import { requireTenantContext } from "@/lib/tenant";
import { profitAndLoss } from "@/lib/reports";

export default async function ProfitAndLossPage() {
  const { active } = await requireTenantContext();
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = now;

  const report = await profitAndLoss(active.companyId, from, to);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Profit &amp; Loss</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · {from.toISOString().slice(0, 10)} to {to.toISOString().slice(0, 10)}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Revenue</h2>
        {report.revenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue posted this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {report.revenue.map((r) => (
                  <tr key={r.accountCode}>
                    <td className="py-1 text-card-foreground">{r.accountName}</td>
                    <td className="py-1 text-right text-card-foreground">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Total Revenue</span>
          <span>{report.totalRevenue.toFixed(2)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Expenses</h2>
        {report.expense.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses posted this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {report.expense.map((r) => (
                  <tr key={r.accountCode}>
                    <td className="py-1 text-card-foreground">{r.accountName}</td>
                    <td className="py-1 text-right text-card-foreground">{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Total Expenses</span>
          <span>{report.totalExpense.toFixed(2)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-primary/5 p-4">
        <div className="flex justify-between text-base font-semibold text-foreground">
          <span>Net Profit</span>
          <span className={report.netProfit.isNegative() ? "text-destructive" : "text-success"}>
            {report.netProfit.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
