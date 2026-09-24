import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { cashFlowForecast, customerPaymentBehavior } from "@/lib/cashflow";

export default async function CashFlowPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const [forecast, behavior] = await Promise.all([
    cashFlowForecast(active.companyId),
    customerPaymentBehavior(active.companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Cash-Flow Forecast</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase text-muted-foreground">Current cash (Bank, from posted entries)</div>
        <div className="mt-1 text-2xl font-semibold text-card-foreground">{fmt.money(forecast.currentCash)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {forecast.buckets.map((b) => (
          <div key={b.days} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">Next {b.days} days</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between text-success"><span>Expected in</span><span>+{fmt.money(b.expectedInflow)}</span></div>
              <div className="flex justify-between text-destructive"><span>Expected out</span><span>-{fmt.money(b.expectedOutflow)}</span></div>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold text-card-foreground">
              <span>Projected cash</span>
              <span className={b.projectedCash < 0 ? "text-destructive" : ""}>{fmt.money(b.projectedCash)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Assumes every outstanding invoice/bill is paid exactly on its due date — this is a
        receivables/payables-due projection, not a statistical prediction of actual behavior.
      </p>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Customer Payment Behavior
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2 text-right">Avg. days late</th>
                <th className="px-4 py-2 text-right">Paid invoices</th>
              </tr>
            </thead>
            <tbody>
              {behavior.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No paid invoices with payment history yet.</td></tr>
              )}
              {behavior.map((b) => (
                <tr key={b.customerId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-card-foreground">{b.customerName}</td>
                  <td className={`px-4 py-2 text-right ${b.avgDaysLate > 0 ? "text-destructive" : "text-success"}`}>{b.avgDaysLate}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{b.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
