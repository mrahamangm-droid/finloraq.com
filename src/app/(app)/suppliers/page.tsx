import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fieldDefs } from "@/lib/customization/server";
import { displayFieldValue } from "@/lib/customization/customFields";
import { CustomFieldInputs, fieldValues } from "@/components/custom-fields/custom-field-inputs";
import { createSupplierAction } from "./actions";
import { SupplierRowActions } from "@/components/suppliers/supplier-row-actions";

export default async function SuppliersPage({ searchParams }: { searchParams: { archived?: string } }) {
  const { active } = await requireTenantContext();
  const showArchived = searchParams.archived === "1";

  const [suppliers, defs, canDelete, archivedCount] = await Promise.all([
    prisma.supplier.findMany({
      where: { companyId: active.companyId, isActive: !showArchived },
      orderBy: { createdAt: "desc" },
    }),
    fieldDefs(active.companyId, "SUPPLIER"),
    can(active.id, "suppliers", "DELETE"),
    prisma.supplier.count({ where: { companyId: active.companyId, isActive: false } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Suppliers</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <form action={createSupplierAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-card p-4">
        <input name="name" required placeholder="Supplier name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <CustomFieldInputs defs={defs} />
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Add supplier
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {showArchived ? "Archived suppliers" : "Active suppliers"}
          </span>
          {(showArchived || archivedCount > 0) && (
            <a href={showArchived ? "/suppliers" : "/suppliers?archived=1"} className="text-xs font-medium text-muted-foreground underline hover:text-foreground">
              {showArchived ? "Back to active suppliers" : `Show archived (${archivedCount})`}
            </a>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Terms</th>
                {defs.map((d) => <th key={d.key} className="px-4 py-2">{d.label}</th>)}
                {canDelete && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4 + defs.length + (canDelete ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                    {showArchived ? "No archived suppliers." : "No suppliers yet."}
                  </td>
                </tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-card-foreground">{s.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.paymentTermsDays} days</td>
                  {defs.map((d) => <td key={d.key} className="px-4 py-2 text-muted-foreground">{displayFieldValue(fieldValues(s.customFields)[d.key])}</td>)}
                  {canDelete && (
                    <td className="px-4 py-2">
                      <SupplierRowActions supplierId={s.id} name={s.name} isActive={s.isActive} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
