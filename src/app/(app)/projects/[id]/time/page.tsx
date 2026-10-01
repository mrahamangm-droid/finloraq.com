import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getFormatter } from "@/lib/customization/server";
import { listTimeEntries, getTimeEntrySummary } from "@/lib/time-tracking";
import { logTimeAction, deleteTimeEntryAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Time Entries · ${id}` };
}

export default async function ProjectTimePage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id: projectId } = params;

  const { active, userId } = await requireTenantContext();

  const denied = await viewGate(active.id, "projects");

  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: active.companyId },
    select: { id: true, name: true, code: true },
  });
  if (!project) notFound();

  const [entries, summary, canEdit] = await Promise.all([
    listTimeEntries(active.companyId, projectId),
    getTimeEntrySummary(active.companyId, projectId),
    can(active.id, "projects", "EDIT"),
  ]);

  const today = new Date().toISOString().substring(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Time — {project.name}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">{project.code}</p>
        </div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to project
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Total hours</div>
          <div className="mt-1 text-lg font-semibold text-card-foreground">
            {summary.totalHours.toFixed(2)} h
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Billable hours</div>
          <div className="mt-1 text-lg font-semibold text-card-foreground">
            {summary.billableHours.toFixed(2)} h
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Unbilled hours</div>
          <div className="mt-1 text-lg font-semibold text-warning">
            {summary.unbilledHours.toFixed(2)} h
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs uppercase text-muted-foreground">Unbilled value</div>
          <div className="mt-1 text-lg font-semibold text-card-foreground">
            {fmt.money(summary.billableValue)}
          </div>
        </div>
      </div>

      {/* Log time form */}
      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">Log Time</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await logTimeAction(projectId, formData);
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                name="date"
                defaultValue={today}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Hours
              </label>
              <input
                type="number"
                name="hours"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="1.00"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Hourly rate (optional)
              </label>
              <input
                type="number"
                name="hourlyRate"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="isBillable"
                  defaultChecked
                  className="h-4 w-4 rounded border-input"
                />
                Billable
              </label>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs text-muted-foreground">
                Description
              </label>
              <input
                type="text"
                name="description"
                placeholder="What did you work on?"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Log time
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries table */}
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No time entries yet. Use the form above to log your first hours.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Hours
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Rate
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Value
                </th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                  Billable
                </th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                  Status
                </th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => {
                const value =
                  entry.hourlyRate != null ? entry.hours * entry.hourlyRate : null;
                const isInvoiced = Boolean(entry.invoiceLineId);

                return (
                  <tr key={entry.id} className="bg-card hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {fmt.date(entry.date)}
                    </td>
                    <td className="px-4 py-2 text-card-foreground">
                      {entry.description}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm">
                      {entry.hours.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      {entry.hourlyRate != null
                        ? fmt.money(entry.hourlyRate)
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm text-card-foreground">
                      {value != null ? fmt.money(value) : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {entry.isBillable ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isInvoiced ? (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Invoiced
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        {!isInvoiced && (
                          <form
                            action={deleteTimeEntryAction.bind(
                              null,
                              projectId,
                              entry.id
                            )}
                          >
                            <button
                              type="submit"
                              className="text-xs text-destructive hover:underline"
                              onClick={(e) => {
                                if (
                                  !confirm(
                                    "Delete this time entry? This cannot be undone."
                                  )
                                )
                                  e.preventDefault();
                              }}
                            >
                              Delete
                            </button>
                          </form>
                        )}
                      </td>
                    )}
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
