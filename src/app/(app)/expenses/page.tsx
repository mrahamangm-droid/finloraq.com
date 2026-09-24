import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { listRecentExpenses } from "@/lib/expenses";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { NewExpenseForm } from "@/components/forms/new-expense-form";
import { ExpenseApproveButton } from "@/components/forms/expense-approve-button";

export default async function ExpensesPage({ searchParams = {} }: { searchParams?: PeriodParams }) {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const filtered = Boolean(searchParams.period);
  const period = resolvePeriod(searchParams);
  const expenses = await listRecentExpenses(active.companyId, filtered ? period : undefined);
  const amountOf = (e: (typeof expenses)[number]) => {
    const bankLine = e.lines.find((l) => l.account.code === "1000");
    return bankLine ? bankLine.credit.toNumber() : e.lines.reduce((a, l) => a + l.debit.toNumber(), 0);
  };
  const total = expenses.reduce((a, e) => a + amountOf(e), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link href="/import" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Import past data</Link>
      </div>

      <NewExpenseForm />

      <PeriodPicker {...pickerProps(period)} showingAll={!filtered} clearable={filtered} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{filtered ? `No expenses in ${period.label}.` : "No expenses yet."}</td></tr>
              )}
              {expenses.map((e) => {
                // The Bank line's credit is the single line equal to the full
                // amount (expense + tax); the debit side splits across 1-2 lines.
                const bankLine = e.lines.find((l) => l.account.code === "1000");
                const amount = bankLine ? bankLine.credit.toNumber() : e.lines.reduce((a, l) => a + l.debit.toNumber(), 0);
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{fmt.date(e.date)}</td>
                    <td className="px-4 py-2 text-card-foreground">{e.memo}</td>
                    <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(amount)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.status === "POSTED" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {e.status === "DRAFT" && <ExpenseApproveButton journalEntryId={e.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered && expenses.length > 0 && (
              <tfoot className="border-t border-border font-medium">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>Total · {period.label} · {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt.money(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
