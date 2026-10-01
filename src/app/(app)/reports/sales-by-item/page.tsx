import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { ReportActions } from "@/components/reports/report-actions";
import Link from "next/link";

export const metadata = { title: "Sales by Item — Finloraq" };

export default async function SalesByItemPage(props: {
  searchParams?: Promise<PeriodParams>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "reports");
  if (denied) return denied;
  const fmt    = await getFormatter(userId);
  const period = resolvePeriod(searchParams, new Date(), "year");
  const { from, to } = period;

  // Aggregate invoice lines by productId for posted invoices in the period
  const rows = await prisma.invoiceLine.groupBy({
    by:    ["productId"],
    where: {
      invoice: {
        companyId: active.company.id,
        status:    { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        issueDate: { gte: from, lte: to },
      },
    },
    _count: { id: true },
    _sum:   { lineTotal: true, quantity: true },
  });

  // Load product names for non-null productIds
  const productIds: string[] = (rows
    .map((r: any): string | null => r.productId as string | null)
    .filter((id: string | null): id is string => id !== null));

  type ProductRow = { id: string; name: string; sku: string | null };
  const products = await prisma.product.findMany({
    where:  { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });
  const productMap = new Map<string, ProductRow>(
    products.map((p: ProductRow) => [p.id, p] as [string, ProductRow])
  );

  // Build result rows — group null productId as "Ad-hoc / Description only"
  type ResultRow = {
    key:        string;
    name:       string;
    sku:        string | null;
    lineCount:  number;
    quantity:   number;
    total:      number;
    isAdhoc:    boolean;
  };

  const result: ResultRow[] = rows
    .map((r: any): ResultRow => {
      const productId = r.productId as string | null;
      const product: ProductRow | undefined = productId ? productMap.get(productId) : undefined;
      return {
        key:       productId ?? "__adhoc__",
        name:      product ? product.name : "Ad-hoc / no product",
        sku:       product ? product.sku : null,
        lineCount: r._count.id as number,
        quantity:  Number(r._sum.quantity ?? 0),
        total:     Number(r._sum.lineTotal ?? 0),
        isAdhoc:   productId === null,
      };
    })
    .sort((a: ResultRow, b: ResultRow) => {
      // Ad-hoc row always last
      if (a.isAdhoc) return 1;
      if (b.isAdhoc) return -1;
      return b.total - a.total;
    });

  const grandTotal    = result.reduce((s: number, r: ResultRow) => s + r.total, 0);
  const grandQuantity = result.reduce((s: number, r: ResultRow) => s + r.quantity, 0);
  const grandLines    = result.reduce((s: number, r: ResultRow) => s + r.lineCount, 0);

  return (
    <div id="report-content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sales by Item</h1>
          <p className="text-sm text-muted-foreground">
            {active.company.name} · {period.label}
          </p>
        </div>
        <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          ← All reports
        </Link>
      </div>

      <PeriodPicker {...pickerProps(period)} />
      <ReportActions title={`Sales by Item — ${period.label}`} company={active.company.name} />

      {result.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No invoice lines found for this period.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Item / Product</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Lines</th>
                <th className="px-4 py-3 text-right">Qty Sold</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">% of Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((row: ResultRow) => (
                <tr
                  key={row.key}
                  className={`hover:bg-muted/20 ${row.isAdhoc ? "text-muted-foreground" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.isAdhoc ? (
                      <span className="italic text-muted-foreground">{row.name}</span>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.lineCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {row.quantity.toFixed(2)}
                  </td>
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
                <td className="px-4 py-3 font-semibold text-foreground" colSpan={2}>
                  Total ({result.length} item{result.length !== 1 ? "s" : ""})
                </td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{grandLines}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                  {grandQuantity.toFixed(2)}
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
