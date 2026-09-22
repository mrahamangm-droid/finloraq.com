import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { listMembers, listPendingInvitations } from "@/lib/users";
import { getBillingSnapshot } from "@/lib/billing/subscription";
import { inviteUserAction, revokeInvitationAction, changeMemberRoleAction, deactivateMemberAction } from "./actions";

const ROLES = ["COMPANY_ADMIN", "CFO", "FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "AUDITOR"] as const;

export default async function UsersPage() {
  const { active } = await requireTenantContext();
  const [members, invitations, billing, canCreate, canEdit, canDelete] = await Promise.all([
    listMembers(active.companyId),
    listPendingInvitations(active.companyId),
    getBillingSnapshot(active.companyId),
    can(active.id, "users", "CREATE"),
    can(active.id, "users", "EDIT"),
    can(active.id, "users", "DELETE"),
  ]);

  const seatsUsed = members.filter((m) => m.isActive).length + invitations.length;
  const seatsFull = seatsUsed >= billing.seats.limit;
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users &amp; Roles</h1>
          <p className="text-sm text-muted-foreground">{active.company.name}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {seatsUsed} / {billing.seats.limit} seats used ({billing.planDefinition.label} plan)
        </div>
      </div>

      {canCreate && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invite someone</h2>
          {seatsFull ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              You&apos;ve used every seat on the {billing.planDefinition.label} plan ({billing.seats.limit}). Upgrade in{" "}
              <a href="/billing" className="underline">Billing</a> to invite more people.
            </p>
          ) : (
            <form action={inviteUserAction} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Role</label>
                <select name="role" required defaultValue="STAFF" className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Send invite
              </button>
            </form>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Members
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-card-foreground">{m.user.name}</td>
                <td className="px-4 py-2 text-card-foreground">{m.user.email}</td>
                <td className="px-4 py-2">
                  {canEdit ? (
                    <form action={changeMemberRoleAction} className="inline-flex items-center gap-1.5">
                      <input type="hidden" name="membershipId" value={m.id} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        disabled={!m.isActive}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r.replace("_", " ")}</option>
                        ))}
                      </select>
                      {m.isActive && (
                        <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                          Save
                        </button>
                      )}
                    </form>
                  ) : (
                    <span className="text-card-foreground">{m.role.replace("_", " ")}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {m.isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-400">Active</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Deactivated</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {canDelete && m.isActive && m.id !== active.id && (
                    <form action={deactivateMemberAction}>
                      <input type="hidden" name="membershipId" value={m.id} />
                      <button type="submit" className="text-xs font-medium text-destructive hover:underline">
                        Deactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invitations
          </div>
          <div className="divide-y divide-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="text-sm text-card-foreground">{inv.email} — {inv.role.replace("_", " ")}</div>
                  <div className="text-xs text-muted-foreground break-all">
                    {baseUrl}/invite/{inv.token}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    No outbound email is configured to send this automatically — copy the link above to the invitee.
                    Expires {inv.expiresAt.toISOString().slice(0, 10)}.
                  </div>
                </div>
                {canDelete && (
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitationId" value={inv.id} />
                    <button type="submit" className="text-xs font-medium text-destructive hover:underline">
                      Revoke
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
