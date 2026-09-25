import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fieldDefs } from "@/lib/customization/server";
import { displayFieldValue } from "@/lib/customization/customFields";
import { CustomFieldInputs, fieldValues } from "@/components/custom-fields/custom-field-inputs";
import { createCustomerAction } from "./actions";
import { FileIntelligencePanel, type QueueDocument } from "@/components/customers/file-intelligence-panel";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";

export default async function CustomersPage({ searchParams }: { searchParams: { archived?: string } }) {
  const { active } = await requireTenantContext();
  const showArchived = searchParams.archived === "1";

  const [customers, defs, canDelete, archivedCount] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: active.companyId, isActive: !showArchived },
      orderBy: { createdAt: "desc" },
    }),
    fieldDefs(active.companyId, "CUSTOMER"),
    can(active.id, "customers", "DELETE"),
    prisma.customer.count({ where: { companyId: active.companyId, isActive: false } }),
  ]);

  // Customer File Intelligence review queue (spec item 5): documents still
  // waiting on a human decision. A document stays EXTRACTED/MATCHED until
  // every record on it has been applied or ignored — see
  // src/lib/ai/customer-extraction.ts's saveResolution().
  const pendingDocuments = await prisma.document.findMany({
    where: { companyId: active.companyId, kind: "CUSTOMER_RECORD", status: { in: ["EXTRACTED", "MATCHED"] } },
    orderBy: { createdAt: "desc" },
  });
  const queue: QueueDocument[] = pendingDocuments.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    createdAt: d.createdAt.toISOString(),
    extractedData: d.extractedData as unknown as QueueDocument["extractedData"],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Customers</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <FileIntelligencePanel queue={queue} />

      <form action={createCustomerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-card p-4">
        <input name="name" required placeholder="Customer name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <CustomFieldInputs defs={defs} />
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Add customer
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {showArchived ? "Archived customers" : "Active customers"}
          </span>
          {(showArchived || archivedCount > 0) && (
            <a href={showArchived ? "/customers" : "/customers?archived=1"} className="text-xs font-medium text-muted-foreground underline hover:text-foreground">
              {showArchived ? "Back to active customers" : `Show archived (${archivedCount})`}
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
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4 + defs.length + (canDelete ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                    {showArchived ? "No archived customers." : "No customers yet."}
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-card-foreground">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.paymentTermsDays} days</td>
                  {defs.map((d) => <td key={d.key} className="px-4 py-2 text-muted-foreground">{displayFieldValue(fieldValues(c.customFields)[d.key])}</td>)}
                  {canDelete && (
                    <td className="px-4 py-2">
                      <CustomerRowActions customerId={c.id} name={c.name} isActive={c.isActive} />
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
