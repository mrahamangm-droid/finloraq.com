import { requireTenantContext } from "@/lib/tenant";
import { arAging } from "@/lib/reports";

const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export default async function ArAgingPage() {
  const { active } = await requireTenantContext();
  const rows = await arAging(active.companyId);

  const totals = Object.fromEntries(BUCKETS.map((b) => [b, rows.filter((r) => r.bucket === b).reduce((a, r) => a + r.balance, 0)]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Accounts Receivable Aging</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">{b}</div>
            <div className="mt-1 text-lg font-semibold text-card-foreground">{(totals[b] ?? 0).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Due date</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nothing outstanding.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-card-foreground">{r.number}</td>
                  <td className="px-4 py-2 text-card-foreground">{r.partyName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.dueDate.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{r.balance.toFixed(2)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
