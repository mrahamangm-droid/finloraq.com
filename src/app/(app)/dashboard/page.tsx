import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { profitAndLoss, arAging, apAging } from "@/lib/reports";
import { currentCashPosition } from "@/lib/cashflow";

// Every figure here comes from a real Prisma query or the Phase 2/4 report
// functions, all reading posted journal entries — there is no hard-coded
// or fabricated total, and no separate cached number that could disagree
// with the ledger. A fresh company legitimately shows zeros.
export default async function DashboardPage() {
  const { active } = await requireTenantContext();
  const companyId = active.companyId;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    customerCount,
    supplierCount,
    openInvoiceCount,
    unpostedJournalCount,
    cash,
    pnl,
    ar,
    ap,
  ] = await Promise.all([
    prisma.customer.count({ where: { companyId } }),
    prisma.supplier.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } } }),
    prisma.journalEntry.count({ where: { companyId, status: "DRAFT" } }),
    currentCashPosition(companyId),
    profitAndLoss(companyId, monthStart, now),
    arAging(companyId, now),
    apAging(companyId, now),
  ]);

  const totalAr = ar.reduce((a, r) => a + r.balance, 0);
  const totalAp = ap.reduce((a, r) => a + r.balance, 0);

  const kpis = [
    { label: "Cash (Bank)", value: cash.toFixed(2) },
    { label: "Net profit (MTD)", value: pnl.netProfit.toFixed(2), negative: pnl.netProfit.isNegative() },
    { label: "Receivables outstanding", value: totalAr.toFixed(2) },
    { label: "Payables outstanding", value: totalAp.toFixed(2) },
  ];

  const counts = [
    { label: "Customers", value: customerCount },
    { label: "Suppliers", value: supplierCount },
    { label: "Open invoices", value: openInvoiceCount },
    { label: "Draft journal entries", value: unpostedJournalCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className={`mt-2 text-2xl font-semibold ${c.negative ? "text-destructive" : "text-card-foreground"}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-card-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 text-sm">
        <Link href="/reports/cash-flow" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted">
          30/60/90-day cash-flow forecast →
        </Link>
        <Link href="/accounting/reports/profit-and-loss" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted">
          Full P&amp;L →
        </Link>
      </div>

      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Project profitability, VAT owed, budget-vs-actual and AI insights are one click away
        (Projects, Taxes, Reports in the nav) rather than duplicated here — an AI-generated
        insights feed on the dashboard itself is Phase 6.
      </div>
    </div>
  );
}
