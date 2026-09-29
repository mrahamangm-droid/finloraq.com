import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { listPendingApprovals } from "@/lib/workflow";
import { approveApprovalAction, rejectApprovalAction } from "./actions";

function EntityLink({ entityType, entityId }: { entityType: string; entityId: string }) {
  if (entityType === "Expense") {
    return (
      <Link href="/expenses" className="text-primary underline-offset-2 hover:underline text-xs">
        View expense
      </Link>
    );
  }
  if (entityType === "Bill") {
    return (
      <Link href={`/purchases/${entityId}`} className="text-primary underline-offset-2 hover:underline text-xs">
        View bill
      </Link>
    );
  }
  return <span className="text-muted-foreground text-xs">{entityId.slice(0, 8)}&hellip;</span>;
}

function ApproveForm({ approvalId }: { approvalId: string }) {
  async function approve(formData: FormData) {
    "use server";
    const comment = (formData.get("comment") as string | null) ?? undefined;
    await approveApprovalAction(approvalId, comment || undefined);
  }
  async function reject(formData: FormData) {
    "use server";
    const comment = (formData.get("comment") as string | null) ?? undefined;
    await rejectApprovalAction(approvalId, comment || undefined);
  }

  return (
    <div className="space-y-2">
      <input
        form={`approve-form-${approvalId}`}
        name="comment"
        placeholder="Optional comment&hellip;"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-2">
        <form id={`approve-form-${approvalId}`} action={approve}>
          <input name="comment" className="sr-only" />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Approve
          </button>
        </form>
        <form id={`reject-form-${approvalId}`} action={reject}>
          <input name="comment" className="sr-only" />
          <button
            type="submit"
            className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Reject
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function ApprovalsPage() {
  const { active } = await requireTenantContext();
  // active IS the CompanyMembership record (from requireTenantContext);
  // active.id = membershipId, active.companyId / active.company.id = companyId.
  const approvals = await listPendingApprovals(active.companyId, active.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Transactions awaiting your review based on your company&apos;s workflow rules.
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No pending approvals — you&apos;re all caught up.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Workflow rules are managed in{" "}
            <Link href="/settings/workflows" className="text-primary underline-offset-2 hover:underline">
              Settings → Workflow Rules
            </Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval: any) => (
            <div
              key={approval.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                      Pending
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {approval.entityType}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Rule: <span className="font-medium text-foreground">{approval.workflowRule.name}</span>
                    {" · "}Requires:{" "}
                    <span className="font-medium text-foreground">
                      {approval.workflowRule.requiredRole.replace(/_/g, " ")}
                    </span>
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Submitted:{" "}
                    {new Date(approval.createdAt).toLocaleDateString("en-AE", {
                      day:   "numeric",
                      month: "short",
                      year:  "numeric",
                    })}
                    {" · "}
                    <EntityLink entityType={approval.entityType} entityId={approval.entityId} />
                  </p>
                </div>

                <div className="min-w-[200px]">
                  <ApproveForm approvalId={approval.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
