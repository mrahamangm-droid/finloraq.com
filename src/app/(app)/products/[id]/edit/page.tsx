import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getProduct } from "@/lib/products";
import { prisma } from "@/lib/db";
import { updateProductAction, archiveProductAction, restoreProductAction } from "@/app/(app)/products/actions";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "EDIT");

  const [product, taxCodes] = await Promise.all([
    getProduct(active.companyId, id),
    prisma.taxCode.findMany({
      where: { companyId: active.companyId, isActive: true, isInput: false },
      orderBy: { code: "asc" },
    }),
  ]);

  if (!product) notFound();

  const unitPrice = typeof product.unitPrice === "number"
    ? product.unitPrice
    : (product.unitPrice as { toNumber: () => number }).toNumber();

  const qtyOnHand = typeof product.quantityOnHand === "number"
    ? product.quantityOnHand
    : (product.quantityOnHand as { toNumber: () => number }).toNumber();

  const reorderPt = product.reorderPoint
    ? (typeof product.reorderPoint === "number"
        ? product.reorderPoint
        : (product.reorderPoint as { toNumber: () => number }).toNumber())
    : null;

  const updateAction = updateProductAction.bind(null, id);
  const archiveAction = archiveProductAction.bind(null, id);
  const restoreAction = restoreProductAction.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
          ← Products &amp; Services
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Edit: {product.name}</h1>
          {product.sku && (
            <p className="text-sm text-muted-foreground mt-0.5">SKU: {product.sku}</p>
          )}
        </div>
        {product.isActive ? (
          <form action={archiveAction}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
            >
              Archive
            </button>
          </form>
        ) : (
          <form action={restoreAction}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-success/10 hover:text-success hover:border-success/50"
            >
              Restore
            </button>
          </form>
        )}
      </div>

      {!product.isActive && (
        <div className="rounded-md bg-muted border border-border px-4 py-3 text-sm text-muted-foreground">
          This item is archived and won&apos;t appear in catalog dropdowns. Restore it to make it
          available again.
        </div>
      )}

      <form action={updateAction} className="space-y-6">
        {/* Core fields */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Basic Information</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                maxLength={255}
                defaultValue={product.name}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                name="type"
                defaultValue={product.type}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="PRODUCT">Product (physical good)</option>
                <option value="SERVICE">Service</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">SKU / Code</label>
              <input
                type="text"
                name="sku"
                maxLength={100}
                defaultValue={product.sku ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea
                name="description"
                maxLength={1000}
                rows={2}
                defaultValue={product.description ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Pricing &amp; Tax</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Unit Price <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {active.company.baseCurrency}
                </span>
                <input
                  type="number"
                  name="unitPrice"
                  required
                  min={0}
                  step="0.0001"
                  defaultValue={unitPrice.toFixed(4)}
                  className="w-full rounded-md border border-border bg-background pl-14 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Unit of Measure</label>
              <input
                type="text"
                name="unit"
                maxLength={50}
                defaultValue={product.unit ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Default Tax</label>
              <select
                name="taxCodeId"
                defaultValue={product.taxCodeId ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— No default tax —</option>
                {taxCodes.map((t: { id: string; code: string; name: string; rate: unknown }) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name} ({(Number(t.rate) * 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Accounts */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Chart of Accounts Mapping</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Income Account Code
              </label>
              <input
                type="text"
                name="incomeAccountCode"
                maxLength={20}
                defaultValue={product.incomeAccountCode ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Expense / COGS Account Code
              </label>
              <input
                type="text"
                name="expenseAccountCode"
                maxLength={20}
                defaultValue={product.expenseAccountCode ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="trackInventory"
              name="trackInventory"
              defaultChecked={product.trackInventory}
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="trackInventory" className="text-sm font-medium text-foreground cursor-pointer">
              Track inventory quantity
            </label>
          </div>

          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            id="inventory-fields"
            style={{ opacity: product.trackInventory ? 1 : 0.5, pointerEvents: product.trackInventory ? "auto" : "none" }}
          >
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Quantity On Hand</label>
              <input
                type="number"
                name="quantityOnHand"
                min={0}
                step="0.0001"
                defaultValue={qtyOnHand.toFixed(4)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Reorder Point</label>
              <input
                type="number"
                name="reorderPoint"
                min={0}
                step="0.0001"
                defaultValue={reorderPt?.toFixed(4) ?? ""}
                placeholder="Alert when below…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/products"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save Changes
          </button>
        </div>
      </form>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var cb = document.getElementById('trackInventory');
              var fields = document.getElementById('inventory-fields');
              if(!cb||!fields) return;
              function sync(){ fields.style.opacity = cb.checked ? '1' : '0.5'; fields.style.pointerEvents = cb.checked ? '' : 'none'; }
              cb.addEventListener('change', sync);
            })();
          `,
        }}
      />
    </div>
  );
}
