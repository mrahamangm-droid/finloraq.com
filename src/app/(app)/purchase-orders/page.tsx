import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  ACKNOWLEDGED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  RECEIVED: "bg-success/10 text-success",
  BILLED: "bg-primary/10 text-primary",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default async function PurchaseOrdersPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const [pos, canCreate] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: active.companyId },
      orderBy: { issueDate: "desc" },
      include: { supplier: true },
      take: 200,
    }),
    can(active.id, "purchase_orders", "CREATE"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        {canCreate && (
          <Link
            href="/purchase-orders/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            New PO
          </Link>
        )}
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">PO Number</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Supplier</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Expected</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No purchase orders yet.{" "}
                  {canCreate && (
                    <Link href="/purchase-orders/new" className="text-primary underline">
                      Create your first PO
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {pos.map((po: any) => (
              <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/purchase-orders/${po.id}`} className="text-primary hover:underline">
                    {po.poNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{po.supplier.name}</td>
                <td className="px-4 py-2 tabular-nums">{fmt.date(po.issueDate)}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {po.expectedDate ? fmt.date(po.expectedDate) : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.total)} {po.currency}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[po.status] ?? "bg-muted text-muted-foreground"}`}>
                    {po.status.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
