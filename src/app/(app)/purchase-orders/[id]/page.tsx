import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { POActions } from "@/components/purchase-orders/po-actions";

export default async function PurchaseOrderDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  try {
    const { requirePermission } = await import("@/lib/rbac");
    await requirePermission(active.id, "purchase_orders", "VIEW");
  } catch { notFound(); }

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: active.companyId },
    include: {
      supplier: true,
      project: true,
      bill: true,
      lines: { include: { taxCode: true } },
    },
  });

  if (!po) notFound();

  const [canEdit, canDelete] = await Promise.all([
    can(active.id, "purchase_orders", "EDIT"),
    can(active.id, "purchase_orders", "DELETE"),
  ]);

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT: "bg-blue-100 text-blue-700",
    ACKNOWLEDGED: "bg-indigo-100 text-indigo-700",
    RECEIVED: "bg-success/10 text-success",
    BILLED: "bg-primary/10 text-primary",
    CANCELLED: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/purchase-orders" className="hover:underline">Purchase Orders</Link>
            {" / "}
            {po.poNumber}
          </p>
          <h1 className="text-xl font-semibold text-foreground">{po.poNumber}</h1>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColor[po.status] ?? ""}`}>
            {po.status}
          </span>
        </div>
        {(canEdit || canDelete) && (
          <POActions
            po={{ id: po.id, status: po.status as "DRAFT" | "SENT" | "ACKNOWLEDGED" | "RECEIVED" | "BILLED" | "CANCELLED", billId: po.billId ?? null }}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </div>

      {po.billId && po.bill && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Converted to bill{" "}
          <Link href={`/purchases/${po.billId}`} className="text-primary hover:underline font-mono">
            {po.bill.billNumber}
          </Link>
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Supplier</p>
          <p className="font-medium">{po.supplier.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-medium">{po.currency}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Issue Date</p>
          <p className="font-medium">{fmt.date(po.issueDate)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Expected Delivery</p>
          <p className="font-medium">{po.expectedDate ? fmt.date(po.expectedDate) : "—"}</p>
        </div>
        {po.project && (
          <div>
            <p className="text-muted-foreground">Project</p>
            <p className="font-medium">{po.project.name}</p>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tax</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {po.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt.money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.taxTotal)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={4} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {po.notes && (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <p className="font-medium mb-1 text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}
    </div>
  );
}
