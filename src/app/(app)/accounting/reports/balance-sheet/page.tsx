import { requireTenantContext } from "@/lib/tenant";
import { balanceSheet } from "@/lib/reports";

function Section({ title, rows, total }: { title: string; rows: { accountName: string; amount: import("decimal.js").default }[]; total: import("decimal.js").default }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None posted.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountName}>
                  <td className="py-1 text-card-foreground">{r.accountName}</td>
                  <td className="py-1 text-right text-card-foreground">{r.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
        <span>Total {title}</span>
        <span>{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default async function BalanceSheetPage() {
  const { active } = await requireTenantContext();
  const asOf = new Date();
  const sheet = await balanceSheet(active.companyId, asOf);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Balance Sheet</h1>
        <p className="text-sm text-muted-foreground">{active.company.name} · as of {asOf.toISOString().slice(0, 10)}</p>
      </div>

      <Section title="Assets" rows={sheet.assets} total={sheet.totalAssets} />
      <Section title="Liabilities" rows={sheet.liabilities} total={sheet.totalLiabilities} />
      <Section title="Equity" rows={sheet.equity} total={sheet.totalEquity} />

      {!sheet.outOfBalance.isZero() && (
        <p className="text-sm font-medium text-destructive">
          Assets ≠ Liabilities + Equity by {sheet.outOfBalance.toFixed(2)} — this should be
          structurally impossible given the posting engine; treat it as a bug report, not a
          normal reading.
        </p>
      )}
    </div>
  );
}
