import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listProducts } from "@/lib/products";
import type { ProductType } from "@prisma/client";

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  type: ProductType;
  unitPrice: unknown;
  currency: string;
  unit: string | null;
  quantityOnHand: unknown;
  trackInventory: boolean;
  isActive: boolean;
  taxCode: { code: string; name: string; rate: unknown } | null;
}

function typeBadge(type: string) {
  return type === "SERVICE"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
}

export default async function ProductsPage(props: {
  searchParams?: Promise<{ search?: string; type?: string; inactive?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const sp = searchParams;

  const { active } = await requireTenantContext();
  await requirePermission(active.id, "products", "VIEW");
  const canCreate = await can(active.id, "products", "CREATE");
  const canEdit = await can(active.id, "products", "EDIT");

  const typeFilter = sp.type === "PRODUCT" || sp.type === "SERVICE" ? sp.type : undefined;
  const includeInactive = sp.inactive === "true";

  const { items: products, total } = await listProducts(active.companyId, {
    search: sp.search,
    type: typeFilter,
    includeInactive,
    limit: 200,
  });

  const currency = active.company.baseCurrency;

  function fmt(n: number | { toNumber: () => number }) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(typeof n === "number" ? n : n.toNumber());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Products &amp; Services</h1>
          <p className="text-sm text-muted-foreground">{total} item{total !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Link
            href="/products/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New Item
          </Link>
        )}
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="search"
          defaultValue={sp.search}
          placeholder="Search name or SKU…"
          className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-48"
        />
        <select
          name="type"
          defaultValue={sp.type ?? ""}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All types</option>
          <option value="PRODUCT">Products</option>
          <option value="SERVICE">Services</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            name="inactive"
            value="true"
            defaultChecked={includeInactive}
            className="accent-primary"
          />
          Include inactive
        </label>
        <button
          type="submit"
          className="h-8 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Filter
        </button>
        {(sp.search || sp.type || includeInactive) && (
          <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground underline">
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Unit</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">On Hand</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tax</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                {canEdit && (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 9 : 8}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {sp.search || sp.type
                      ? "No items match your filter."
                      : "No products or services yet. Click \"+ New Item\" to add one."}
                  </td>
                </tr>
              ) : (
                products.map((p: ProductRow) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="max-w-[240px]">
                        <span className="truncate block">{p.name}</span>
                        {p.description && (
                          <span className="text-xs text-muted-foreground truncate block mt-0.5">
                            {p.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(p.type)}`}
                      >
                        {p.type === "SERVICE" ? "Service" : "Product"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {fmt(p.unitPrice as number)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.unit ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.trackInventory
                        ? (typeof p.quantityOnHand === "number"
                            ? p.quantityOnHand
                            : (p.quantityOnHand as { toNumber: () => number }).toNumber()
                          ).toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(p as { taxCode?: { code: string; rate: { toNumber?: () => number } | number } }).taxCode
                        ? `${(p as { taxCode: { code: string; rate: number | { toNumber: () => number } } }).taxCode.code}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {p.trackInventory && (
                            <Link
                              href={`/inventory/${p.id}`}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Stock
                            </Link>
                          )}
                          <Link
                            href={`/products/${p.id}/edit`}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
