import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { profitAndLoss, arAging, apAging, trialBalance, type AgingRow } from "@/lib/reports";
import { roundMoney } from "@/lib/currency";
import { getDashboardLayout, getFormatter } from "@/lib/customization/server";
import { RANGES, WIDGETS, type WidgetId } from "@/lib/customization/widgets";
import { periodFromRange, pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer";

// Every figure here comes from a real Prisma query or the Phase 2/4 report
// functions, all reading posted journal entries — there is no hard-coded
// or fabricated total, and no separate cached number that could disagree
// with the ledger. A fresh company legitimately shows zeros.
//
// Which cards appear, their order, and the period for "Net profit" are each
// user's own choice (the Customize button); see src/lib/customization/widgets.ts.
export default async function DashboardPage({ searchParams = {} }: { searchParams?: PeriodParams }) {
  const { active, userId } = await requireTenantContext();
  const companyId = active.companyId;
  const now = new Date();
  const [layout, fmt] = await Promise.all([getDashboardLayout(active.id), getFormatter(userId)]);
  // The picker (Daily … Yearly, any past period) wins; with no choice in the
  // URL the user's saved default from Customize applies.
  const period = searchParams.period ? resolvePeriod(searchParams, now) : periodFromRange(layout.range, now);
  const { from, to } = period;
  // Balances are shown as at the end of the period (or today, for the current one).
  const asOf = to < now ? to : now;

  const [customerCount, supplierCount, openInvoiceCount, unpostedJournalCount, cash, pnl, ar, ap] = await Promise.all([
    prisma.customer.count({ where: { companyId } }),
    prisma.supplier.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } } }),
    prisma.journalEntry.count({ where: { companyId, status: "DRAFT" } }),
    trialBalance(companyId, asOf).then((rows) => {
      const bank = rows.find((r) => r.accountCode === "1000");
      return bank ? roundMoney(bank.debit.minus(bank.credit)).toNumber() : 0;
    }),
    profitAndLoss(companyId, from, to),
    arAging(companyId, asOf),
    apAging(companyId, asOf),
  ]);

  const totalAr = ar.reduce((a, r) => a + r.balance, 0);
  const totalAp = ap.reduce((a, r) => a + r.balance, 0);
  const rangeLabel = searchParams.period ? period.label : RANGES[layout.range];
  const asOfLabel = asOf === now ? undefined : `as at ${fmt.date(asOf)}`;

  const stat = (label: string, value: string, opts: { negative?: boolean; hint?: string; href?: string } = {}) => (
    <div className="h-full rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${opts.negative ? "text-destructive" : "text-card-foreground"}`}>{value}</div>
      {opts.hint && <div className="mt-1 text-xs text-muted-foreground">{opts.hint}</div>}
      {opts.href && <Link href={opts.href} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">View →</Link>}
    </div>
  );

  const topList = (title: string, rows: AgingRow[], href: string, empty: string) => (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <Link href={href} className="text-xs font-medium text-primary hover:underline">Full report →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {[...rows].sort((a, b) => b.balance - a.balance).slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate text-card-foreground">{r.partyName}</div>
                <div className="text-xs text-muted-foreground">{r.number} · due {fmt.date(r.dueDate)}{r.bucket !== "current" ? ` · ${r.bucket} days late` : ""}</div>
              </div>
              <div className={`shrink-0 font-medium tabular-nums ${r.bucket === "current" ? "text-card-foreground" : "text-destructive"}`}>{fmt.money(r.balance)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const render: Record<WidgetId, () => React.ReactNode> = {
    cash: () => stat("Cash (Bank)", fmt.money(cash), { href: "/banking", hint: asOfLabel }),
    profit: () => stat("Net profit", fmt.money(pnl.netProfit), { negative: pnl.netProfit.isNegative(), hint: rangeLabel }),
    revenue: () => stat("Income", fmt.money(pnl.totalRevenue), { hint: rangeLabel, href: "/accounting/reports/profit-and-loss" }),
    expenses: () => stat("Expenses", fmt.money(pnl.totalExpense), { hint: rangeLabel, href: "/expenses" }),
    receivables: () => stat("Receivables outstanding", fmt.money(totalAr), { href: "/reports/ar-aging" }),
    payables: () => stat("Payables outstanding", fmt.money(totalAp), { href: "/reports/ap-aging" }),
    customers: () => stat("Customers", String(customerCount), { href: "/customers" }),
    suppliers: () => stat("Suppliers", String(supplierCount), { href: "/suppliers" }),
    openInvoices: () => stat("Open invoices", String(openInvoiceCount), { href: "/sales" }),
    draftJournals: () => stat("Draft journal entries", String(unpostedJournalCount), { href: "/accounting/journals" }),
    quickActions: () => (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["/sales/new", "New invoice"],
            ["/purchases/new", "New bill"],
            ["/expenses", "Record expense"],
            ["/accounting/journals/new", "Journal entry"],
            ["/customers", "Add customer"],
            ["/documents", "Upload document"],
            ["/import", "Import past data"],
          ].map(([href, label]) => (
            <Link key={href} href={href!} className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-primary hover:text-primary">
              {label}
            </Link>
          ))}
        </div>
      </div>
    ),
    topReceivables: () => topList("Who owes you most", ar, "/reports/ar-aging", "Nobody owes you anything right now."),
    topPayables: () => topList("Who you owe most", ap, "/reports/ap-aging", "You don't owe any suppliers right now."),
    reports: () => (
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/reports/cash-flow" className="rounded-md border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">30/60/90-day cash-flow forecast →</Link>
        <Link href="/accounting/reports/profit-and-loss" className="rounded-md border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">Full P&amp;L →</Link>
        <Link href="/accounting/reports/balance-sheet" className="rounded-md border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">Balance sheet →</Link>
      </div>
    ),
  };

  const sizes = new Map(WIDGETS.map((w) => [w.id, w.size]));
  const visible = layout.widgets.filter((w) => w.visible);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <DashboardCustomizer
          widgets={layout.widgets}
          range={layout.range}
          catalog={WIDGETS.map((w) => ({ id: w.id, label: w.label }))}
          ranges={Object.entries(RANGES).map(([id, label]) => ({ id, label }))}
        />
      </div>

      <PeriodPicker {...pickerProps(period)} />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Your dashboard is empty. Use <b>Customize</b> to choose the cards you want to see.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visible.map((w) => (
            <div key={w.id} className={sizes.get(w.id) === "lg" ? "col-span-2 lg:col-span-4" : ""}>
              {render[w.id]()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
