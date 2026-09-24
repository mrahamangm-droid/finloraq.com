import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { balanceSheet } from "@/lib/reports";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";

function Section({ title, rows, total, money }: { title: string; money: (v: import("decimal.js").default) => string; rows: { accountName: string; amount: import("decimal.js").default }[]; total: import("decimal.js").default }) {
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
                  <td className="py-1 text-right text-card-foreground">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-medium">
        <span>Total {title}</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}

export default async function BalanceSheetPage({ searchParams = {} }: { searchParams?: PeriodParams }) {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const now = new Date();
  const period = resolvePeriod(searchParams, now);
  // As at the end of the chosen period — or now, if that's still ahead.
  const asOf = period.to < now ? period.to : now;
  const sheet = await balanceSheet(active.companyId, asOf);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Balance Sheet</h1>
        <p className="text-sm text-muted-foreground">{active.company.name} · as of {fmt.date(asOf)}</p>
      </div>

      <PeriodPicker {...pickerProps(period)} allow={["day", "week", "month", "quarter", "year"]} />

      <Section money={fmt.money} title="Assets" rows={sheet.assets} total={sheet.totalAssets} />
      <Section money={fmt.money} title="Liabilities" rows={sheet.liabilities} total={sheet.totalLiabilities} />
      <Section money={fmt.money} title="Equity" rows={sheet.equity} total={sheet.totalEquity} />

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
