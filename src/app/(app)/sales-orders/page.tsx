import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { Pagination } from "@/components/pagination";
import { pageWindow, parsePage } from "@/lib/pagination";
import { can } from "@/lib/rbac";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PARTIALLY_SHIPPED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  SHIPPED: "bg-primary/10 text-primary",
  INVOICED: "bg-success/10 text-success",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default async function SalesOrdersPage(props: { searchParams?: Promise<{ page?: string }> }) {
  const sp = (await props.searchParams) ?? {};
  const page = parsePage(sp.page);
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "sales_orders");
  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const [orders, canCreate, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { companyId: active.companyId },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }], // id breaks ties so pages never overlap
      include: { customer: true },
      ...pageWindow(page),
    }),
    can(active.id, "sales_orders", "CREATE"),
    prisma.salesOrder.count({ where: { companyId: active.companyId } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sales Orders</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        {canCreate && (
          <Link href="/sales-orders/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            New Sales Order
          </Link>
        )}
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Number</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No sales orders yet.{" "}
                  {canCreate && (
                    <Link href="/sales-orders/new" className="text-primary underline">
                      Create your first sales order
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {orders.map((o: any) => (
              <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/sales-orders/${o.id}`} className="text-primary hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.customer.name}</td>
                <td className="px-4 py-2 tabular-nums">{fmt.date(o.issueDate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(o.total)} {o.currency}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[o.status] ?? "bg-muted text-muted-foreground"}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination path="/sales-orders" params={sp} page={page} total={total} noun="sales orders" />
    </div>
  );
}
