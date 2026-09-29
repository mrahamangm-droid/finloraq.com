import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listLeads } from "@/lib/crm";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { NewLeadForm } from "@/components/crm/new-lead-form";

const STATUS_LABEL: Record<string, string> = {
  NEW:         "New",
  CONTACTED:   "Contacted",
  QUALIFIED:   "Qualified",
  UNQUALIFIED: "Unqualified",
  CONVERTED:   "Converted",
};
const STATUS_COLOR: Record<string, string> = {
  NEW:         "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  QUALIFIED:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UNQUALIFIED: "bg-muted text-muted-foreground",
  CONVERTED:   "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const [canCreate, canEdit] = await Promise.all([
    can(active.id, "crm", "CREATE"),
    can(active.id, "crm", "EDIT"),
  ]);

  const page  = parseInt(sp.page ?? "1", 10);
  const result = await listLeads(active.companyId, {
    status: sp.status as never,
    page,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">{result.total} total</p>
        </div>
        <Link href="/crm" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to CRM
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {["", "NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"].map((s) => (
          <Link
            key={s}
            href={s ? `/crm/leads?status=${s}` : "/crm/leads"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              (sp.status ?? "") === s
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s ? STATUS_LABEL[s] : "All"}
          </Link>
        ))}
      </div>

      {/* New lead form */}
      {canCreate && <NewLeadForm />}

      {/* Leads table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="hidden px-4 py-3 sm:table-cell">Company</th>
                <th className="hidden px-4 py-3 md:table-cell">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Assigned</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No leads found. Add your first lead above.
                  </td>
                </tr>
              )}
              {result.items.map((lead: any) => (
                <tr key={lead.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {lead.firstName} {lead.lastName}
                    </div>
                    {lead.email && (
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {lead.companyName ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {lead.source ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[lead.status]}`}
                    >
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {lead.assignedTo?.user.name ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result.total > result.limit && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              {(page - 1) * result.limit + 1}–{Math.min(page * result.limit, result.total)} of{" "}
              {result.total}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/crm/leads?page=${page - 1}${sp.status ? `&status=${sp.status}` : ""}`} className="hover:text-foreground">
                  ← Prev
                </Link>
              )}
              {page * result.limit < result.total && (
                <Link href={`/crm/leads?page=${page + 1}${sp.status ? `&status=${sp.status}` : ""}`} className="hover:text-foreground">
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
