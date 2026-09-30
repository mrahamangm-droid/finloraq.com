import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { listRecentExpenses, expenseTotals } from "@/lib/expenses";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { can } from "@/lib/rbac";
import { PeriodPicker } from "@/components/periods/period-picker";
import { NewExpenseForm } from "@/components/forms/new-expense-form";
import { ExpenseRow } from "@/components/forms/expense-row";
import { getBankAccountCode, getInputTaxReceivableCode } from "@/lib/accounts";

type ExpenseStatus = "DRAFT" | "POSTED" | "REVERSED";
const STATUS_TABS: { value: ExpenseStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "POSTED", label: "Posted" },
  { value: "REVERSED", label: "Reversed" },
];

type ExpensesPageParams = PeriodParams & { status?: string };

export default async function ExpensesPage(props: { searchParams?: Promise<ExpensesPageParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  const sp = searchParams;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "expenses");
  if (denied) return denied;
  const [fmt, canEdit] = await Promise.all([getFormatter(userId), can(active.id, "expenses", "EDIT")]);
  const filtered = Boolean(sp.period);
  const period = resolvePeriod(sp);
  // Deliberately checked against the three real JournalStatus values, not
  // STATUS_TABS (which also carries the synthetic "ALL" entry) — "ALL"
  // means "no filter" and must never reach the Prisma `where` clause below
  // as a literal status value.
  const VALID_STATUSES: ExpenseStatus[] = ["DRAFT", "POSTED", "REVERSED"];
  const statusFilter = VALID_STATUSES.includes(sp.status as ExpenseStatus)
    ? (sp.status as ExpenseStatus)
    : undefined;
  const [expenses, totals, bankAccountCode, inputTaxCode] = await Promise.all([
    listRecentExpenses(active.companyId, filtered ? period : undefined, statusFilter),
    expenseTotals(active.companyId, filtered ? period : undefined, statusFilter),
    getBankAccountCode(active.companyId),
    getInputTaxReceivableCode(active.companyId),
  ]);

  // Preserves every other query param (period/date/from/to) when switching
  // status tabs, same "keep the rest of the URL" behavior PeriodPicker uses
  // for its own tabs — so a filtered-by-period view stays filtered when you
  // also filter by status, and vice versa.
  const statusHref = (value: (typeof STATUS_TABS)[number]["value"]) => {
    const params = new URLSearchParams();
    if (sp.period) params.set("period", sp.period);
    if (sp.date) params.set("date", sp.date);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (value !== "ALL") params.set("status", value);
    const qs = params.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link href="/import" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Import past data</Link>
      </div>

      <NewExpenseForm baseCurrency={active.company.baseCurrency} />

      <PeriodPicker {...pickerProps(period)} showingAll={!filtered} clearable={filtered} />

      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-md bg-muted/60 p-1 text-sm">
        {STATUS_TABS.map((tab) => {
          const isActive = (statusFilter ?? "ALL") === tab.value;
          return (
            <Link
              key={tab.value}
              href={statusHref(tab.value)}
              role="tab"
              aria-selected={isActive}
              className={`rounded px-2.5 py-1 text-xs font-medium sm:text-sm ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

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
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {statusFilter ? `No ${statusFilter.toLowerCase()} expenses${filtered ? ` in ${period.label}` : ""}.` : filtered ? `No expenses in ${period.label}.` : "No expenses yet."}
                  </td>
                </tr>
              )}
              {expenses.map((e: any) => {
                // The Bank line's credit is the single line equal to the full
                // amount (expense + tax); the debit side splits across 1-2 lines.
                // Always base currency — see createExpense in src/lib/expenses.ts.
                const bankLine = e.lines.find((l: any) => l.account.code === bankAccountCode);
                const amount = bankLine ? bankLine.credit.toNumber() : e.lines.reduce((a: any, l: any) => a + l.debit.toNumber(), 0);
                const taxLine = e.lines.find((l: any) => l.account.code === inputTaxCode);
                const exchangeRate = e.exchangeRate.toNumber();
                const isForeignCurrency = e.currency !== active.company.baseCurrency;
                return (
                  <ExpenseRow
                    key={e.id}
                    expense={{
                      id: e.id,
                      date: e.date.toISOString().slice(0, 10),
                      memo: e.memo ?? "",
                      amount,
                      taxAmount: taxLine ? taxLine.debit.toNumber() : undefined,
                      status: e.status,
                      currency: e.currency,
                      exchangeRate,
                    }}
                    baseCurrency={active.company.baseCurrency}
                    canEdit={canEdit}
                    moneyDisplay={fmt.money(amount)}
                    // The amount actually entered, in the expense's own
                    // currency — shown alongside the base-currency amount
                    // for a foreign-currency expense.
                    originalDisplay={isForeignCurrency ? `${(amount / exchangeRate).toFixed(2)} ${e.currency}` : undefined}
                    dateDisplay={fmt.date(e.date)}
                  />
                );
              })}
            </tbody>
            {filtered && expenses.length > 0 && (
              <tfoot className="border-t border-border font-medium">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>Total · {period.label} · {totals.count} {totals.count === 1 ? "expense" : "expenses"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt.money(totals.total)} {active.company.baseCurrency}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {expenses.length < totals.count && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Showing the latest {expenses.length} of {totals.count} expenses{filtered ? "" : " — pick a period to see older ones"}.{filtered ? " The total above covers all of them." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
