import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import { Pagination } from "@/components/pagination";
import { pageWindow, parsePage } from "@/lib/pagination";

function statusColor(status: string) {
  if (status === "PAID") return "bg-success/10 text-success";
  if (status === "OVERDUE") return "bg-destructive/10 text-destructive";
  if (status === "DRAFT") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

type SalesParams = PeriodParams & { customerId?: string; page?: string };

export default async function SalesPage(props: { searchParams?: Promise<SalesParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  const sp = searchParams;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "invoices");
  if (denied) return denied;
  const fmt = await getFormatter(userId);
  const filtered = Boolean(sp.period);
  const period = resolvePeriod(sp);
  const customerFilter = sp.customerId ?? undefined;

  // Resolve customer name for display when filtering by customer
  const filterCustomer = customerFilter
    ? await prisma.customer.findFirst({
        where: { id: customerFilter, companyId: active.companyId },
        select: { id: true, name: true },
      })
    : null;

  // Paginated 50 per page like the Audit Log. The customer filter goes into
  // the query itself; it's safe to pass the raw id because companyId scopes
  // the same query, so another company's id simply matches nothing.
  const page = parsePage(sp.page);
  const where = {
    companyId: active.companyId,
    ...(filtered ? { issueDate: { gte: period.from, lte: period.to } } : {}),
    ...(customerFilter ? { customerId: customerFilter } : {}),
  };
  const [invoices, totalsByCurrency] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }], // id breaks ties so pages never overlap
      include: { customer: true },
      ...pageWindow(page),
    }),
    // Totals and the count come from the database over the WHOLE filtered
    // set, not from the page above — summing one page would silently
    // understate a period with more rows than fit on it. Grouped by currency
    // because adding amounts in different currencies isn't a total.
    prisma.invoice.groupBy({ by: ["currency"], where, _sum: { total: true }, _count: { _all: true }, orderBy: { currency: "asc" } }),
  ]);
  const totalCount = totalsByCurrency.reduce((n, g) => n + g._count._all, 0);

  const newInvoiceHref = filterCustomer
    ? `/sales/new?customerId=${filterCustomer.id}`
    : "/sales/new";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {filterCustomer ? `Invoices — ${filterCustomer.name}` : "Sales — Invoices"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {filterCustomer ? (
              <>
                <Link href="/customers" className="hover:underline">{active.company.name}</Link>
                {" · "}
                <Link href={`/customers/${filterCustomer.id}`} className="hover:underline">{filterCustomer.name}</Link>
                {" · "}
                <Link href="/sales" className="hover:underline text-primary/70">Clear filter</Link>
              </>
            ) : active.company.name}
          </p>
        </div>
        <Link href={newInvoiceHref} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          New Invoice
        </Link>
      </div>

      {!filterCustomer && <PeriodPicker {...pickerProps(period)} showingAll={!filtered} clearable={filtered} />}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Issue date</th>
                <th className="px-4 py-2">Due date</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{filtered ? `No invoices in ${period.label}.` : "No invoices yet."}</td></tr>
              )}
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/sales/${inv.id}`} className="font-mono text-xs text-primary">{inv.invoiceNumber}</Link>
                  </td>
                  <td className="px-4 py-2 text-card-foreground">{inv.customer.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.issueDate)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt.date(inv.dueDate)}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(inv.total)} {inv.currency}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(inv.status)}`}>{inv.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {(filtered || customerFilter) && invoices.length > 0 && (
              <tfoot className="border-t border-border font-medium">
                <tr>
                  <td className="px-4 py-2" colSpan={4}>Total{filtered ? ` · ${period.label}` : ""} · {totalCount} invoices</td>
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
      </div>

      <Pagination path="/sales" params={sp} page={page} total={totalCount} noun="invoices" />
    </div>
  );
}
