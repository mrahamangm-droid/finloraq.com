import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import Link from "next/link";
import { profitAndLoss, profitAndLossSeries } from "@/lib/reports";
import { pickerProps, periodQuery, resolvePeriod, subPeriods, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";

export default async function ProfitAndLossPage({ searchParams = {} }: { searchParams?: PeriodParams }) {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const period = resolvePeriod(searchParams);
  const { from, to } = period;
  const slices = subPeriods(period);

  const [report, series] = await Promise.all([
    profitAndLoss(active.companyId, from, to),
    profitAndLossSeries(active.companyId, slices),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Profit &amp; Loss</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · {period.label} ({fmt.date(from)} to {fmt.date(to)})
        </p>
      </div>

      <PeriodPicker {...pickerProps(period)} />

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
                    <td className="py-1 text-right text-card-foreground">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Total Revenue</span>
          <span>{fmt.money(report.totalRevenue)}</span>
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
                    <td className="py-1 text-right text-card-foreground">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Total Expenses</span>
          <span>{fmt.money(report.totalExpense)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-primary/5 p-4">
        <div className="flex justify-between text-base font-semibold text-foreground">
          <span>Net Profit</span>
          <span className={report.netProfit.isNegative() ? "text-destructive" : "text-success"}>
            {fmt.money(report.netProfit)}
          </span>
        </div>
      </div>

      {slices.length > 1 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Breakdown by {slices[0]!.granularity}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2 text-right">Income</th>
                  <th className="px-4 py-2 text-right">Expenses</th>
                  <th className="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((sl, i) => {
                  const row = series[i]!;
                  return (
                    <tr key={sl.date} className="border-t border-border">
                      <td className="px-4 py-1.5">
                        <Link href={`?${periodQuery({ granularity: sl.granularity, date: sl.date })}`} className="text-primary hover:underline">{sl.label}</Link>
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fmt.money(row.income)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fmt.money(row.expense)}</td>
                      <td className={`px-4 py-1.5 text-right font-medium tabular-nums ${row.net.isNegative() ? "text-destructive" : ""}`}>{fmt.money(row.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
