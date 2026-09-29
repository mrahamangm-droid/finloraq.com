import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";

const REPORTS = [
  {
    group: "Financial Statements",
    items: [
      { href: "/accounting/reports/trial-balance", name: "Trial Balance", description: "Every account's debit/credit balance from posted entries." },
      { href: "/accounting/reports/profit-and-loss", name: "Profit & Loss", description: "Revenue and expenses with period picker." },
      { href: "/accounting/reports/balance-sheet", name: "Balance Sheet", description: "Assets, liabilities and equity as of any date." },
      { href: "/reports/cash-flow", name: "Cash-Flow Forecast", description: "30/60/90-day projection from AR/AP due dates, plus customer payment behaviour." },
    ],
  },
  {
    group: "Ledger",
    items: [
      { href: "/reports/ledger?period=monthly", name: "General Ledger — Monthly", description: "Every posted entry per account for a month, with opening, running and closing balances." },
      { href: "/reports/ledger?period=yearly", name: "General Ledger — Yearly", description: "Month-by-month debits, credits and closing balance per account for a full year." },
    ],
  },
  {
    group: "Sales",
    items: [
      { href: "/reports/sales-by-customer", name: "Sales by Customer", description: "Total invoiced, paid, and outstanding per customer for the period." },
      { href: "/reports/sales-by-item", name: "Sales by Item", description: "Revenue, quantity sold and line count broken down by product or item." },
    ],
  },
  {
    group: "Purchases",
    items: [
      { href: "/reports/purchases-by-supplier", name: "Purchases by Supplier", description: "Total billed, paid, and outstanding per supplier for the period." },
    ],
  },
  {
    group: "Expenses",
    items: [
      { href: "/reports/expense-by-category", name: "Expenses by Category", description: "Net spend per expense account from posted journal entries." },
    ],
  },
  {
    group: "Receivables & Payables",
    items: [
      { href: "/reports/ar-aging", name: "AR Aging", description: "Outstanding customer invoices by days overdue." },
      { href: "/reports/ap-aging", name: "AP Aging", description: "Outstanding supplier bills by days overdue." },
    ],
  },
  {
    group: "Tax",
    items: [
      { href: "/taxes", name: "VAT Return", description: "Output tax vs input tax for the period." },
    ],
  },
  {
    group: "Budgets",
    items: [
      { href: "/reports/budget-vs-actual", name: "Budget vs Actual", description: "Compare actual income and spending to your budget line by line." },
      { href: "/accounting/budgets", name: "Budget List", description: "View and manage all budgets." },
    ],
  },
  {
    group: "Inventory",
    items: [
      { href: "/inventory", name: "Inventory Summary", description: "Current stock levels, values and low-stock alerts for all tracked products." },
    ],
  },
];

export default async function ReportsPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "reports");
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      {REPORTS.map((group) => (
        <div key={group.group}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.group}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium text-card-foreground">{r.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{r.description}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Project profitability, time summaries and budget variance also live on each project&apos;s page
        (Projects in the nav). Customer and supplier account statements are available from each
        customer&apos;s or supplier&apos;s row in the Customers / Suppliers section.
      </p>
    </div>
  );
}
