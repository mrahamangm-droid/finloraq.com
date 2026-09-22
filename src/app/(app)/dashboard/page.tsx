import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// Every figure here comes from a real Prisma query over the active
// company's own rows (tenant-scoped via requireTenantContext). There is no
// hard-coded or fabricated total: a fresh company legitimately shows
// zeros, because the accounting engine (Phase 2) hasn't posted anything
// yet — that's the honest state, not a bug to paper over with sample data.
export default async function DashboardPage() {
  const { active } = await requireTenantContext();
  const companyId = active.companyId;

  const [customerCount, supplierCount, openInvoiceCount, unpostedJournalCount] =
    await Promise.all([
      prisma.customer.count({ where: { companyId } }),
      prisma.supplier.count({ where: { companyId } }),
      prisma.invoice.count({ where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } } }),
      prisma.journalEntry.count({ where: { companyId, status: "DRAFT" } }),
    ]);

  const cards = [
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
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-card-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Revenue, gross/net profit, cash position, AR/AP aging, VAT owed, cash-flow forecast and
        AI insights populate this dashboard once the accounting engine (Phase 2) and banking
        module (Phase 4) are live — they read directly from posted journal entries, never from a
        separate cached number, so the dashboard can never disagree with the ledger.
      </div>
    </div>
  );
}
