import { requireTenantContext } from "@/lib/tenant";
import { listRecentExpenses } from "@/lib/expenses";
import { NewExpenseForm } from "@/components/forms/new-expense-form";
import { ExpenseApproveButton } from "@/components/forms/expense-approve-button";

export default async function ExpensesPage() {
  const { active } = await requireTenantContext();
  const expenses = await listRecentExpenses(active.companyId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Expenses</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <NewExpenseForm />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No expenses yet.</td></tr>
            )}
            {expenses.map((e) => {
              // The Bank line's credit is the single line equal to the full
              // amount (expense + tax); the debit side splits across 1-2 lines.
              const bankLine = e.lines.find((l) => l.account.code === "1000");
              const amount = bankLine ? bankLine.credit.toNumber() : e.lines.reduce((a, l) => a + l.debit.toNumber(), 0);
              return (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{e.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-card-foreground">{e.memo}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{amount.toFixed(2)}</td>
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
        </table>
      </div>
    </div>
  );
}
