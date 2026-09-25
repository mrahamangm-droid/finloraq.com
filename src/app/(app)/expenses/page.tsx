import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { listRecentExpenses } from "@/lib/expenses";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { NewExpenseForm } from "@/components/forms/new-expense-form";
import { ExpenseRowActions } from "@/components/forms/expense-row-actions";

type ExpenseStatus = "DRAFT" | "POSTED" | "REVERSED";
const STATUS_TABS: { value: ExpenseStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "POSTED", label: "Posted" },
  { value: "REVERSED", label: "Reversed" },
];

// Same convention as the Journals page's statusColor() — kept as a local
// copy rather than a shared import since that one isn't exported yet and
// this page has no other reason to depend on the Journals route.
function statusColor(status: string) {
  if (status === "POSTED") return "bg-success/10 text-success";
  if (status === "REVERSED") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

type ExpensesPageParams = PeriodParams & { status?: string };

export default async function ExpensesPage({ searchParams = {} }: { searchParams?: ExpensesPageParams }) {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const filtered = Boolean(searchParams.period);
  const period = resolvePeriod(searchParams);
  // Deliberately checked against the three real JournalStatus values, not
  // STATUS_TABS (which also carries the synthetic "ALL" entry) — "ALL"
  // means "no filter" and must never reach the Prisma `where` clause below
  // as a literal status value.
  const VALID_STATUSES: ExpenseStatus[] = ["DRAFT", "POSTED", "REVERSED"];
  const statusFilter = VALID_STATUSES.includes(searchParams.status as ExpenseStatus)
    ? (searchParams.status as ExpenseStatus)
    : undefined;
  const expenses = await listRecentExpenses(active.companyId, filtered ? period : undefined, statusFilter);

  // Preserves every other query param (period/date/from/to) when switching
  // status tabs, same "keep the rest of the URL" behavior PeriodPicker uses
  // for its own tabs — so a filtered-by-period view stays filtered when you
  // also filter by status, and vice versa.
  const statusHref = (value: (typeof STATUS_TABS)[number]["value"]) => {
    const params = new URLSearchParams();
    if (searchParams.period) params.set("period", searchParams.period);
    if (searchParams.date) params.set("date", searchParams.date);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    if (value !== "ALL") params.set("status", value);
    const qs = params.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };
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
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <ExpenseRowActions journalEntryId={e.id} status={e.status} />
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
