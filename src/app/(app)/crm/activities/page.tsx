import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listActivities } from "@/lib/crm";
import Link from "next/link";
import { formatDistanceToNow, isPast } from "date-fns";
import { NewActivityForm } from "@/components/crm/new-activity-form";

const TYPE_ICON: Record<string, string> = {
  CALL:    "📞",
  EMAIL:   "📧",
  MEETING: "🗓️",
  TASK:    "✅",
  NOTE:    "📝",
};
const STATUS_COLOR: Record<string, string> = {
  PLANNED:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  DONE:      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const [canCreate, result] = await Promise.all([
    can(active.id, "crm", "CREATE"),
    listActivities(active.companyId, {
      status: (sp.status as "PLANNED" | "DONE" | "CANCELLED") ?? "PLANNED",
      page: parseInt(sp.page ?? "1", 10),
      limit: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Activities</h1>
          <p className="text-sm text-muted-foreground">{result.total} total</p>
        </div>
        <Link href="/crm" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to CRM
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {(["PLANNED", "DONE", "CANCELLED"] as const).map((s) => (
          <Link
            key={s}
            href={`/crm/activities?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              (sp.status ?? "PLANNED") === s
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>

      {canCreate && <NewActivityForm />}

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {result.items.length === 0 && (
          <p className="px-4 py-8 text-center text-muted-foreground">
            No activities found.
          </p>
        )}
        {result.items.map((activity: any) => {
          const overdue =
            activity.status === "PLANNED" &&
            activity.dueAt &&
            isPast(new Date(activity.dueAt));

          return (
            <div key={activity.id} className={`flex items-start gap-3 px-4 py-3 ${overdue ? "bg-destructive/5" : ""}`}>
              <span className="text-xl" title={activity.type}>{TYPE_ICON[activity.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{activity.subject}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[activity.status]}`}>
                    {activity.status.charAt(0) + activity.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {activity.lead && (
                    <span>Lead: {activity.lead.firstName} {activity.lead.lastName}</span>
                  )}
                  {activity.deal && (
                    <span>Deal: {activity.deal.name}</span>
                  )}
                  {activity.assignedTo && (
                    <span>👤 {activity.assignedTo.user.name}</span>
                  )}
                  {activity.dueAt && (
                    <span className={overdue ? "text-destructive font-medium" : ""}>
                      📅 {formatDistanceToNow(new Date(activity.dueAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
                {activity.notes && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{activity.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
