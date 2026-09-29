import { requireTenantContext } from "@/lib/tenant";
import { supplierStatement } from "@/lib/statements";
import { getFormatter } from "@/lib/customization/server";
import { ReportActions } from "@/components/reports/report-actions";
import Link from "next/link";

export default async function SupplierStatementPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string; to?: string }>;
  }
) {
  const { id: supplierId } = await props.params;
  const sp = await props.searchParams;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-01-01`;
  const defaultTo = now.toISOString().slice(0, 10);
  const fromStr = sp.from ?? defaultFrom;
  const toStr = sp.to ?? defaultTo;

  const statement = await supplierStatement(
    active.companyId,
    active.id,
    supplierId,
    new Date(fromStr),
    new Date(toStr)
  );

  const balanceColor = statement.closingBalance > 0
    ? "text-red-600 dark:text-red-400"
    : statement.closingBalance < 0
    ? "text-green-600 dark:text-green-400"
    : "text-card-foreground";

  return (
    <div id="report-content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/suppliers" className="hover:underline">Suppliers</Link>
            {" / "}
            <span className="text-foreground font-medium">{statement.supplierName}</span>
            {" / Statement"}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            Account Statement — {statement.supplierName}
          </h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <ReportActions
          title={`Statement — ${statement.supplierName}`}
          company={active.company.name}
        />
      </div>

      {/* Date range picker */}
      <form method="get" className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromStr}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toStr}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Apply
        </button>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Opening Balance</div>
          <div className="mt-1 text-lg font-semibold text-card-foreground">
            {statement.currency} {fmt.money(statement.openingBalance)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Period Activity</div>
          <div className="mt-1 text-lg font-semibold text-card-foreground">
            {statement.entries.length} transactions
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Closing Balance</div>
          <div className={`mt-1 text-lg font-semibold ${balanceColor}`}>
            {statement.currency} {fmt.money(statement.closingBalance)}
          </div>
        </div>
      </div>

      {/* Statement table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Charges</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row */}
              <tr className="border-b border-border bg-muted/20">
                <td className="px-4 py-2 text-xs text-muted-foreground">{fromStr}</td>
                <td className="px-4 py-2 text-muted-foreground">—</td>
                <td className="px-4 py-2 text-muted-foreground italic">Opening Balance</td>
                <td className="px-4 py-2 text-right" />
                <td className="px-4 py-2 text-right" />
                <td className="px-4 py-2 text-right font-medium">
                  {fmt.money(statement.openingBalance)}
                </td>
              </tr>

              {statement.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No transactions in this period.
                  </td>
                </tr>
              )}

              {statement.entries.map((entry, i) => {
                const typeLabel: Record<string, string> = {
                  BILL: "BILL",
                  BILL_PAYMENT: "PMT",
                };
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {fmt.date(entry.date)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <span className="inline-block rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground mr-1">
                        {typeLabel[entry.type] ?? entry.type}
                      </span>
                      {entry.reference}
                    </td>
                    <td className="px-4 py-2 text-card-foreground">{entry.description}</td>
                    <td className="px-4 py-2 text-right text-card-foreground">
                      {entry.debit > 0 ? fmt.money(entry.debit) : ""}
                    </td>
                    <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">
                      {entry.credit > 0 ? fmt.money(entry.credit) : ""}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-card-foreground">
                      {fmt.money(entry.balance)}
                    </td>
                  </tr>
                );
              })}

              {/* Closing balance row */}
              <tr className="bg-muted/20">
                <td className="px-4 py-2 text-xs text-muted-foreground">{toStr}</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 font-semibold text-foreground">Closing Balance</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
                <td className={`px-4 py-2 text-right font-bold text-base ${balanceColor}`}>
                  {statement.currency} {fmt.money(statement.closingBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Statement generated {new Date().toLocaleDateString()} · All amounts in {statement.currency}
      </p>
    </div>
  );
}
