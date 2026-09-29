import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";

function statusColor(status: string) {
  if (status === "PAID") return "bg-success/10 text-success";
  if (status === "OVERDUE") return "bg-destructive/10 text-destructive";
  if (status === "DRAFT") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

type PurchasesParams = PeriodParams & { supplierId?: string };

export default async function PurchasesPage(props: { searchParams?: Promise<PurchasesParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  const sp = searchParams;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "bills");
  if (denied) return denied;
  const fmt = await getFormatter(userId);
  const filtered = Boolean(sp.period);
  const period = resolvePeriod(sp);
  const supplierFilter = sp.supplierId ?? undefined;

  // Resolve supplier name when filtering by supplier
  const filterSupplier = supplierFilter
    ? await prisma.supplier.findFirst({
        where: { id: supplierFilter, companyId: active.companyId },
        select: { id: true, name: true },
      })
    : null;

  // Same cap-not-paginate tradeoff as the Sales list (see its comment).
  const where = { companyId: active.companyId, ...(filtered ? { issueDate: { gte: period.from, lte: period.to } } : {}) };
  const [bills, totalsByCurrency] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: { supplier: true },
      take: filtered ? 1000 : 200,
    }),
    // Totals and the count come from the database over the WHOLE filtered
    // set, not from the capped list above — summing the list would silently
    // understate a period with more rows than the cap. Grouped by currency
    // because adding amounts in different currencies isn't a total.
    prisma.bill.groupBy({ by: ["currency"], where, _sum: { total: true }, _count: { _all: true }, orderBy: { currency: "asc" } }),
  ]);
  const totalCount = totalsByCurrency.reduce((n, g) => n + g._count._all, 0);

  const newBillHref = filterSupplier
    ? `/purchases/new?supplierId=${filterSupplier.id}`
    : "/purchases/new";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {filterSupplier ? `Bills — ${filterSupplier.name}` : "Purchases — Bills"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {filterSupplier ? (
              <>
                <Link href="/suppliers" className="hover:underline">{active.company.name}</Link>
                {" · "}
                <Link href={`/suppliers/${filterSupplier.id}`} className="hover:underline">{filterSupplier.name}</Link>
                {" · "}
                <Link href="/purchases" className="hover:underline text-primary/70">Clear filter</Link>
              </>
            ) : active.company.name}
          </p>
        </div>
        <Link href={newBillHref} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          New Bill
        </Link>
      </div>

      {!filterSupplier && <PeriodPicker {...pickerProps(period)} showingAll={!filtered} clearable={filtered} />}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Bill #</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Issue date</th>
                <th className="px-4 py-2">Due date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {filterSupplier ? `No bills from ${filterSupplier.name}.` : filtered ? `No bills in ${period.label}.` : "No bills yet."}
                </td></tr>
              )}
              {bills.map((b: any) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/purchases/${b.id}`} className="font-mono text-xs text-primary">{b.billNumber}</Link>
                  </td>
                  <td className="px-4 py-2 text-card-foreground">{b.supplier.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(b.issueDate)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(b.dueDate)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(b.total)} {b.currency}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(b.status)}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered && bills.length > 0 && (
              <tfoot className="border-t border-border font-medium">
                <tr>
                  <td className="px-4 py-2" colSpan={4}>Total · {period.label} · {totalCount} bills</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totalsByCurrency.map((g) => (
                      <div key={g.currency}>{fmt.money(g._sum.total ?? 0)} {g.currency}</div>
                    ))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {bills.length < totalCount && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Showing the latest {bills.length} of {totalCount} bills{filtered ? "" : " — pick a period to see older ones"}.{filtered ? " The total above covers all of them." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
