import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { ReportActions } from "@/components/reports/report-actions";
import Link from "next/link";

export const metadata = { title: "Expenses by Category — Finloraq" };

export default async function ExpenseByCategoryPage(props: {
  searchParams?: Promise<PeriodParams>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const { active, userId } = await requireTenantContext();
  const fmt    = await getFormatter(userId);
  const period = resolvePeriod(searchParams, new Date(), "year");
  const { from, to } = period;

  // Pre-fetch expense account IDs for this company
  const expenseAccounts = await prisma.account.findMany({
    where:   { companyId: active.company.id, type: "EXPENSE" },
    select:  { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const expenseAccountIds = expenseAccounts.map((a: any) => a.id as string);

  // Aggregate net debit on EXPENSE accounts from POSTED journal entries in period
  const rows = await prisma.journalLine.groupBy({
    by:    ["accountId"],
    where: {
      accountId:    { in: expenseAccountIds },
      journalEntry: {
        companyId: active.company.id,
        status:    "POSTED",
        date:      { gte: from, lte: to },
      },
    },
    _sum: { debit: true, credit: true },
  });

  // Build account name map (explicit type so .get() returns the right shape)
  type AccountRow = { id: string; code: string; name: string };
  const accountMap = new Map<string, AccountRow>(
    expenseAccounts.map((a: AccountRow) => [a.id, a] as [string, AccountRow])
  );
  // Build result rows — net = debit - credit (expense increases with debit)
  type ResultRow = { accountId: string; code: string; name: string; net: number };
  const result: ResultRow[] = rows
    .map((r: any): ResultRow => {
      const debit  = Number(r._sum.debit  ?? 0);
      const credit = Number(r._sum.credit ?? 0);
      const net    = debit - credit;
      const acct   = accountMap.get(r.accountId as string);
      return {
        accountId: r.accountId as string,
        code:      (acct?.code ?? "") as string,
        name:      (acct?.name ?? "Unknown account") as string,
        net,
      };
    })
    .filter((r: ResultRow) => r.net !== 0)
    .sort((a: ResultRow, b: ResultRow) => b.net - a.net);

  const grandTotal = result.reduce((s: number, r: ResultRow) => s + r.net, 0);

  return (
    <div id="report-content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Expenses by Category</h1>
          <p className="text-sm text-muted-foreground">
            {active.company.name} · {period.label}
          </p>
        </div>
        <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          ← All reports
        </Link>
      </div>

      <PeriodPicker {...pickerProps(period)} />
      <ReportActions title={`Expenses by Category — ${period.label}`} company={active.company.name} />

      {result.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No posted expense entries found for this period.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Account / Category</th>
                <th className="px-4 py-3 text-right">Net Expense</th>
                <th className="px-4 py-3 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((row: ResultRow) => (
                <tr key={row.accountId} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.code}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                  <td className={`px-4 py-3 text-right font-mono ${row.net < 0 ? "text-emerald-600" : "text-foreground"}`}>
                    {fmt.money(row.net)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {grandTotal !== 0
                      ? ((row.net / grandTotal) * 100).toFixed(1) + "%"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td className="px-4 py-3 font-semibold text-foreground" colSpan={2}>
                  Total ({result.length} categor{result.length !== 1 ? "ies" : "y"})
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                  {fmt.money(grandTotal)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Based on posted journal entries. Debit-positive; a negative value indicates a net credit (reversal or refund) for that account.
      </p>
    </div>
  );
}
