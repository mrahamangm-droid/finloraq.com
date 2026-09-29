import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { SalesOrderActions } from "@/components/sales-orders/sales-order-actions";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PARTIALLY_SHIPPED: "bg-yellow-100 text-yellow-700",
  SHIPPED: "bg-primary/10 text-primary",
  INVOICED: "bg-success/10 text-success",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default async function SalesOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  if (!(await can(active.id, "sales_orders", "VIEW"))) notFound();
  const fmt = await getFormatter(userId);

  const order = await prisma.salesOrder.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      customer: true,
      lines: { include: { taxCode: true, product: true } },
      shipments: { include: { lines: { include: { salesOrderLine: true } } }, orderBy: { shipDate: "desc" } },
      invoices: { orderBy: { issueDate: "desc" } },
    },
  });
  if (!order) notFound();

  const canEdit = await can(active.id, "sales_orders", "EDIT");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/sales-orders" className="hover:underline">Sales Orders</Link>
            {" / "}
            {order.orderNumber}
          </p>
          <h1 className="text-xl font-semibold text-foreground">{order.orderNumber}</h1>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColor[order.status] ?? ""}`}>
            {order.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <SalesOrderActions
        orderId={order.id}
        status={order.status}
        canEdit={canEdit}
        lines={order.lines.map((l: any) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          shippedQuantity: Number(l.shippedQuantity),
          invoicedQuantity: Number(l.invoicedQuantity),
        }))}
      />

      {order.invoices.length > 0 && (
        <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm">
          Invoiced:{" "}
          {order.invoices.map((inv: any, i: number) => (
            <span key={inv.id}>
              {i > 0 && ", "}
              <Link href={`/sales/${inv.id}`} className="text-primary hover:underline font-mono">{inv.invoiceNumber}</Link>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Customer</p>
          <p className="font-medium">{order.customer.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-medium">{order.currency}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Issue Date</p>
          <p className="font-medium">{fmt.date(order.issueDate)}</p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Shipped</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Invoiced</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2">
                  {l.description}
                  {l.product?.trackInventory && <span className="ml-1 text-xs text-muted-foreground">(tracked)</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.shippedQuantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.invoicedQuantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt.money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(order.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(order.taxTotal)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={5} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground">{fmt.money(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.shipments.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">Shipments</div>
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Shipment #</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.shipments.map((s: any) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-mono text-xs">{s.shipmentNumber}</td>
                  <td className="px-4 py-2 tabular-nums">{fmt.date(s.shipDate)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.lines.map((l: any) => `${l.salesOrderLine.description} × ${Number(l.quantity)}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
