import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createProductAction } from "@/app/(app)/products/actions";

export default async function NewProductPage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "CREATE");

  const taxCodes = await prisma.taxCode.findMany({
    where: { companyId: active.companyId, isActive: true, isInput: false },
    orderBy: { code: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
          ← Products &amp; Services
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">New Product / Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add a reusable item to your catalog for quick line-item entry on invoices and bills.
        </p>
      </div>

      <form action={createProductAction} className="space-y-6">
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
                placeholder="e.g. Web Design Services"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select
                name="type"
                defaultValue="SERVICE"
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
                placeholder="e.g. SVC-001 (optional)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea
                name="description"
                maxLength={1000}
                rows={2}
                placeholder="Optional description shown on invoices…"
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
                  defaultValue="0.00"
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
                placeholder="e.g. hour, each, kg"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Default Tax</label>
              <select
                name="taxCodeId"
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
          <p className="text-xs text-muted-foreground">
            Optional: pre-fill the account code used when this item appears on an invoice or bill.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Income Account Code
              </label>
              <input
                type="text"
                name="incomeAccountCode"
                maxLength={20}
                placeholder="e.g. 4000"
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
                placeholder="e.g. 5000"
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
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="trackInventory" className="text-sm font-medium text-foreground cursor-pointer">
              Track inventory quantity
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 opacity-50 pointer-events-none" id="inventory-fields">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Opening Quantity</label>
              <input
                type="number"
                name="quantityOnHand"
                min={0}
                step="0.0001"
                defaultValue="0"
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
            Create Item
          </button>
        </div>
      </form>

      {/* Progressive enhancement: enable inventory fields when checkbox checked */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var cb = document.getElementById('trackInventory');
              var fields = document.getElementById('inventory-fields');
              if(!cb||!fields) return;
              function sync(){ fields.style.opacity = cb.checked ? '1' : '0.5'; fields.style.pointerEvents = cb.checked ? '' : 'none'; }
              cb.addEventListener('change', sync);
              sync();
            })();
          `,
        }}
      />
    </div>
  );
}
