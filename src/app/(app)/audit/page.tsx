import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";

const PAGE_SIZE = 50;

/**
 * Renders the AuditEvent trail every phase of this app has been writing
 * to since Phase 1 (recordAuditEvent() is called from every mutating
 * server action/API route/webhook — see src/lib/audit.ts) but that,
 * until now, had no UI: this page was a "Coming Soon" stub. Nothing new
 * is logged here — this is purely a read/filter/paginate view over data
 * that already exists.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; entityType?: string; page?: string };
}) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "audit", "VIEW");

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const where = {
    companyId: active.companyId,
    ...(searchParams.action ? { action: { contains: searchParams.action, mode: "insensitive" as const } } : {}),
    ...(searchParams.entityType ? { entityType: searchParams.entityType } : {}),
  };

  const [events, total, entityTypes] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where: { companyId: active.companyId },
      select: { entityType: true },
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (searchParams.action) params.set("action", searchParams.action);
    if (searchParams.entityType) params.set("entityType", searchParams.entityType);
    params.set("page", String(p));
    return `/audit?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded action for {active.company.name} — append-only, never edited or deleted.
          {total.toLocaleString()} event(s) total.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Action contains</label>
          <input
            name="action"
            defaultValue={searchParams.action ?? ""}
            placeholder="e.g. journal.post"
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Entity type</label>
          <select name="entityType" defaultValue={searchParams.entityType ?? ""} className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">All</option>
            {entityTypes.map((e) => (
              <option key={e.entityType} value={e.entityType}>{e.entityType}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Filter
        </button>
        {(searchParams.action || searchParams.entityType) && (
          <Link href="/audit" className="text-xs text-muted-foreground hover:underline">Clear filters</Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">By</th>
                <th className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-card-foreground">{e.action}</td>
                  <td className="px-4 py-2 text-xs text-card-foreground">{e.entityType} · {e.entityId.slice(0, 12)}</td>
                  <td className="px-4 py-2 text-xs text-card-foreground">{e.user?.name ?? "system"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{e.source}</span>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No events match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Previous</Link>}
            {page < totalPages && <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
