import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getFormatter } from "@/lib/customization/server";
import { listStockMovements } from "@/lib/inventory";
import { adjustStockAction, setOpeningStockAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ productId: string }> }) {
  const { productId } = await props.params;
  return { title: `Inventory · ${productId}` };
}

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Receipt",
  SHIPMENT: "Shipment",
  ADJUSTMENT: "Adjustment",
  OPENING: "Opening",
  RETURN_IN: "Return (in)",
  RETURN_OUT: "Return (out)",
};

const MOVEMENT_COLORS: Record<string, string> = {
  RECEIPT: "text-success",
  SHIPMENT: "text-destructive",
  ADJUSTMENT: "text-foreground",
  OPENING: "text-primary",
  RETURN_IN: "text-success",
  RETURN_OUT: "text-destructive",
};

export default async function InventoryProductPage(props: {
  params: Promise<{ productId: string }>;
}) {
  const params = await props.params;
  const { productId } = params;

  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: active.companyId },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      quantityOnHand: true,
      reorderPoint: true,
      unitPrice: true,
      trackInventory: true,
    },
  });
  if (!product) notFound();
  if (!product.trackInventory) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Inventory tracking is not enabled for <strong>{product.name}</strong>.
          Enable it on the{" "}
          <Link href="/products" className="text-primary hover:underline">
            Products page
          </Link>
          .
        </p>
      </div>
    );
  }

  const [movements, canEdit] = await Promise.all([
    listStockMovements(active.companyId, productId),
    can(active.id, "inventory", "EDIT"),
  ]);

  const qty = product.quantityOnHand.toNumber();
  const rp = product.reorderPoint?.toNumber();
  const isLow = rp != null && qty <= rp;
  const today = new Date().toISOString().substring(0, 10);
  const hasMovements = movements.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{product.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">
            {product.sku ?? "No SKU"} · Inventory
          </p>
        </div>
        <Link
          href="/inventory"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Inventory
        </Link>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={`rounded-lg border p-4 ${isLow ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}>
          <div className="text-xs uppercase text-muted-foreground">On hand</div>
          <div className={`mt-1 text-2xl font-semibold ${isLow ? "text-warning" : "text-card-foreground"}`}>
            {qty.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {product.unit ?? "units"}
            </span>
          </div>
          {isLow && (
            <div className="text-xs text-warning">⚠ Below reorder point ({rp?.toFixed(2)})</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Stock value</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">
            {fmt.money(qty * product.unitPrice.toNumber())}
          </div>
          <div className="text-xs text-muted-foreground">at unit price {fmt.money(product.unitPrice.toNumber())}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Total movements</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{movements.length}</div>
        </div>
      </div>

      {/* Opening stock (only if no movements yet) */}
      {canEdit && !hasMovements && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">Set Opening Stock</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await setOpeningStockAction(productId, formData);
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-4"
          >
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Quantity ({product.unit ?? "units"})
              </label>
              <input
                type="number"
                name="quantity"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Unit cost</label>
              <input
                type="number"
                name="unitCost"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date</label>
              <input
                type="date"
                name="date"
                defaultValue={today}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Set opening stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual adjustment form */}
      {canEdit && hasMovements && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">Record Adjustment</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Use a positive quantity to add stock (e.g. +10 for received goods) or a negative quantity to remove it (e.g. -5 for a write-off).
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await adjustStockAction(productId, formData);
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-4"
          >
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Quantity (+ / −)
              </label>
              <input
                type="number"
                name="quantity"
                step="0.01"
                placeholder="+0.00"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Unit cost</label>
              <input
                type="number"
                name="unitCost"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date</label>
              <input
                type="date"
                name="date"
                defaultValue={today}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <input
                type="text"
                name="notes"
                placeholder="Reason for adjustment"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-4">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Save adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Movement history */}
      {movements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No stock movements recorded yet. Set the opening balance above to get started.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit cost</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Notes / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m) => (
                <tr key={m.id} className="bg-card hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {fmt.date(m.date)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium ${MOVEMENT_COLORS[m.type] ?? "text-foreground"}`}>
                      {MOVEMENT_LABELS[m.type] ?? m.type}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-sm font-medium ${m.quantity >= 0 ? "text-success" : "text-destructive"}`}>
                    {m.quantity >= 0 ? "+" : ""}{m.quantity.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm text-card-foreground">
                    {m.balanceAfter.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {m.unitCost != null ? fmt.money(m.unitCost) : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">
                    {m.notes && <span>{m.notes}</span>}
                    {m.referenceType && m.referenceId && (
                      <span className="ml-1 font-mono text-xs opacity-60">
                        [{m.referenceType}:{m.referenceId.slice(0, 8)}]
                      </span>
                    )}
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
