import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const products = await prisma.product.findMany({
    where: { companyId: active.companyId, trackInventory: true, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      quantityOnHand: true,
      reorderPoint: true,
      unit: true,
      unitPrice: true,
      _count: { select: { stockMovements: true } },
    },
    orderBy: { name: "asc" },
  });

  type PRow = (typeof products)[number];

  const totalValue = products.reduce((sum: number, p: PRow) => {
    return sum + p.quantityOnHand.toNumber() * p.unitPrice.toNumber();
  }, 0);

  const belowReorder = products.filter((p: PRow) => {
    const rp = p.reorderPoint?.toNumber();
    return rp != null && p.quantityOnHand.toNumber() <= rp;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Products catalog
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Tracked products</div>
          <div className="mt-1 text-xl font-semibold text-card-foreground">{products.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Stock value</div>
          <div className="mt-1 text-xl font-semibold text-card-foreground">{fmt.money(totalValue)}</div>
          <div className="text-xs text-muted-foreground">at unit price</div>
        </div>
        <div className={`rounded-lg border p-4 ${belowReorder.length > 0 ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}>
          <div className="text-xs uppercase text-muted-foreground">Below reorder point</div>
          <div className={`mt-1 text-xl font-semibold ${belowReorder.length > 0 ? "text-warning" : "text-success"}`}>
            {belowReorder.length}
          </div>
          {belowReorder.length > 0 && (
            <div className="text-xs text-warning">Action needed</div>
          )}
        </div>
      </div>

      {/* Alert: items below reorder point */}
      {belowReorder.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-sm font-medium text-warning">⚠ Low stock alerts</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {belowReorder.map((p: PRow) => (
              <li key={p.id}>
                <Link href={`/inventory/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                {" "}— {p.quantityOnHand.toNumber().toFixed(2)} {p.unit ?? "units"}
                {p.reorderPoint && ` (reorder at ${p.reorderPoint.toNumber().toFixed(2)})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Products table */}
      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No inventory-tracked products. Enable &quot;Track inventory&quot; on a product to see it here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">On hand</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Reorder at</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">Movements</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p: PRow) => {
                const qty = p.quantityOnHand.toNumber();
                const rp = p.reorderPoint?.toNumber();
                const isLow = rp != null && qty <= rp;
                return (
                  <tr key={p.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium text-card-foreground">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {p.sku ?? "—"}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-sm font-medium ${isLow ? "text-warning" : "text-card-foreground"}`}>
                      {qty.toFixed(2)} {p.unit ?? ""}
                      {isLow && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      {rp != null ? `${rp.toFixed(2)} ${p.unit ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm text-card-foreground">
                      {fmt.money(qty * p.unitPrice.toNumber())}
                    </td>
                    <td className="px-4 py-2 text-center text-muted-foreground">
                      {p._count.stockMovements}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/inventory/${p.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
