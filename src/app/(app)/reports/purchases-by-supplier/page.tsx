import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { ReportActions } from "@/components/reports/report-actions";
import Link from "next/link";

export const metadata = { title: "Purchases by Supplier — Finloraq" };

export default async function PurchasesBySupplierPage(props: {
  searchParams?: Promise<PeriodParams>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const { active, userId } = await requireTenantContext();
  const fmt    = await getFormatter(userId);
  const period = resolvePeriod(searchParams, new Date(), "year");
  const { from, to } = period;

  // Aggregate posted bills by supplier for the period.
  // Bill has no amountPaid field — balance is computed from journal
  // entries, not stored on the Bill row. We show total billed only;
  // for an outstanding balance breakdown, use the AP Aging report.
  const rows = await prisma.bill.groupBy({
    by:    ["supplierId"],
    where: {
      companyId: active.company.id,
      status:    { in: ["APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      issueDate: { gte: from, lte: to },
    },
    _count: { id: true },
    _sum:   { total: true },
  });

  // Load supplier names
  const supplierIds = rows.map((r: any) => r.supplierId);
  const suppliers   = await prisma.supplier.findMany({
    where:  { id: { in: supplierIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(suppliers.map((s: any) => [s.id, s.name]));

  // Build result rows
  type ResultRow = { supplierId: string; name: string; billCount: number; total: number };
  const result: ResultRow[] = rows
    .map((r: any): ResultRow => {
      const total = Number(r._sum.total ?? 0);
      return {
        supplierId: r.supplierId as string,
        name:       (nameMap.get(r.supplierId as string) ?? "Unknown") as string,
        billCount:  r._count.id,
        total,
      };
    })
    .sort((a: ResultRow, b: ResultRow) => b.total - a.total);

  const grandTotal = result.reduce((s: number, r: ResultRow) => s + r.total, 0);

  return (
    <div id="report-content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Purchases by Supplier</h1>
          <p className="text-sm text-muted-foreground">
            {active.company.name} · {period.label}
          </p>
        </div>
        <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          ← All reports
        </Link>
      </div>

      <PeriodPicker {...pickerProps(period)} />
      <ReportActions title={`Purchases by Supplier — ${period.label}`} company={active.company.name} />

      {result.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No bills found for this period.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-right">Bills</th>
                <th className="px-4 py-3 text-right">Total Billed</th>
                <th className="px-4 py-3 text-right">% of Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((row: ResultRow) => (
                <tr key={row.supplierId} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link
                      href={`/suppliers/${row.supplierId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.billCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">
                    {fmt.money(row.total)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {grandTotal > 0
                      ? ((row.total / grandTotal) * 100).toFixed(1) + "%"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td className="px-4 py-3 text-sm font-semibold text-foreground">
                  Total ({result.length} supplier{result.length !== 1 ? "s" : ""})
                </td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">
                  {result.reduce((s: number, r: ResultRow) => s + r.billCount, 0)}
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
    </div>
  );
}
