import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { POActions } from "@/components/purchase-orders/po-actions";
import { billableQuantity } from "@/lib/purchase-orders";

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
      lines: {
        include: {
          taxCode: true,
          product: { select: { id: true, name: true, trackInventory: true } },
          billLines: { select: { bill: { select: { id: true, billNumber: true, status: true } } } },
        },
      },
      receives: { include: { lines: true }, orderBy: [{ receiveDate: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!po) notFound();

  const [canEdit, canDelete, canCreateBill] = await Promise.all([
    can(active.id, "purchase_orders", "EDIT"),
    can(active.id, "purchase_orders", "DELETE"),
    can(active.id, "bills", "CREATE"),
  ]);

  const lineDescription = new Map(po.lines.map((l: any) => [l.id, l.description as string]));
  const billableQty = po.lines.reduce((s: number, l: any) => s + billableQuantity(l).toNumber(), 0);
  const fulfilmentStarted = po.lines.some((l: any) => Number(l.receivedQuantity) > 0 || Number(l.billedQuantity) > 0);
  const bills = new Map<string, { id: string; billNumber: string; status: string }>();
  for (const l of po.lines as any[]) for (const bl of l.billLines) bills.set(bl.bill.id, bl.bill);
  const isForeign = po.currency !== active.company.baseCurrency;

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT: "bg-blue-100 text-blue-700",
    ACKNOWLEDGED: "bg-indigo-100 text-indigo-700",
    PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
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
            {po.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {(canEdit || canDelete) && (
        <POActions
          po={{ id: po.id, status: po.status as "DRAFT" | "SENT" | "ACKNOWLEDGED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "BILLED" | "CANCELLED" }}
          lines={po.lines.map((l: any) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity) }))}
          billableQty={billableQty}
          fulfilmentStarted={fulfilmentStarted}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateBill={canCreateBill}
        />
      )}

      {bills.size > 0 && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Bills:{" "}
          {[...bills.values()].map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <Link href={`/purchases/${b.id}`} className="text-primary hover:underline font-mono">{b.billNumber}</Link>
              <span className="text-muted-foreground"> ({b.status.toLowerCase()})</span>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Supplier</p>
          <p className="font-medium">{po.supplier.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-medium">
            {po.currency}
            {isForeign && <span className="text-muted-foreground"> @ {Number(po.exchangeRate)} {active.company.baseCurrency}</span>}
          </p>
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

      <div className="rounded-md border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Ordered</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Received</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Billed</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tax</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {po.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2">
                  {l.description}
                  {l.product && (
                    <span className="block text-xs text-muted-foreground">
                      {l.product.name}{l.product.trackInventory ? " · stock item" : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.receivedQuantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(l.billedQuantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.taxCode?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt.money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.taxTotal)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={6} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.money(po.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {po.receives.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Purchase receives</h2>
          <ul className="divide-y divide-border text-sm">
            {po.receives.map((r: any) => (
              <li key={r.id} className="px-4 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono">{r.receiveNumber}</span>
                  <span className="text-muted-foreground">{fmt.date(r.receiveDate)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.lines.map((rl: any) => `${Number(rl.quantity)} × ${lineDescription.get(rl.purchaseOrderLineId) ?? "line"}`).join(" · ")}
                </p>
                {r.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {po.notes && (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <p className="font-medium mb-1 text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}
    </div>
  );
}
