import { Fragment } from "react";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { listMembers, listPendingInvitations } from "@/lib/users";
import { listMemberFilesForCompany, MAX_MEMBER_FILE_BYTES } from "@/lib/memberFiles";
import { getBillingSnapshot } from "@/lib/billing/subscription";
import {
  inviteUserAction,
  revokeInvitationAction,
  changeMemberRoleAction,
  deactivateMemberAction,
  uploadMemberFileAction,
  replaceMemberFileAction,
  renameMemberFileAction,
  deleteMemberFileAction,
} from "./actions";

const ROLES = ["COMPANY_ADMIN", "CFO", "FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "AUDITOR"] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function UsersPage() {
  const { active } = await requireTenantContext();
  const [members, invitations, billing, canCreate, canEdit, canDelete, filesByMember] = await Promise.all([
    listMembers(active.companyId),
    listPendingInvitations(active.companyId),
    getBillingSnapshot(active.companyId),
    can(active.id, "users", "CREATE"),
    can(active.id, "users", "EDIT"),
    can(active.id, "users", "DELETE"),
    listMemberFilesForCompany(active.companyId),
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
        <div className="overflow-x-auto">
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
              {members.map((m) => {
                const files = filesByMember.get(m.id) ?? [];
                return (
                <Fragment key={m.id}>
                <tr className="border-b border-border">
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
                <tr className="border-b border-border last:border-0 bg-muted/20">
                  <td colSpan={5} className="px-4 py-2">
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                        Files ({files.length}){files.length === 0 ? "" : ` — ${files.map((f) => f.title).join(", ")}`}
                      </summary>
                      <div className="mt-3 space-y-3 pb-1">
                        {files.length > 0 && (
                          <ul className="space-y-2">
                            {files.map((f) => (
                              <li
                                key={f.id}
                                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
                              >
                                <a
                                  href={`/api/member-files/${f.id}`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {f.title}
                                </a>
                                <span className="text-muted-foreground">
                                  {f.fileName} · {formatFileSize(f.sizeBytes)}
                                </span>

                                {canEdit && (
                                  <form action={renameMemberFileAction} className="inline-flex items-center gap-1">
                                    <input type="hidden" name="fileId" value={f.id} />
                                    <input
                                      name="title"
                                      defaultValue={f.title}
                                      className="w-32 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
                                    />
                                    <button type="submit" className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted">
                                      Rename
                                    </button>
                                  </form>
                                )}

                                {canEdit && (
                                  <form action={replaceMemberFileAction} className="inline-flex items-center gap-1">
                                    <input type="hidden" name="fileId" value={f.id} />
                                    <input type="file" name="file" required className="w-40 text-xs" />
                                    <button type="submit" className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted">
                                      Replace
                                    </button>
                                  </form>
                                )}

                                {canDelete && (
                                  <form action={deleteMemberFileAction}>
                                    <input type="hidden" name="fileId" value={f.id} />
                                    <button type="submit" className="text-xs font-medium text-destructive hover:underline">
                                      Delete
                                    </button>
                                  </form>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {canCreate && (
                          <form action={uploadMemberFileAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="membershipId" value={m.id} />
                            <input
                              name="title"
                              placeholder="Title (e.g. Emirates ID)"
                              className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                            <input type="file" name="file" required className="text-xs" />
                            <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                              Upload
                            </button>
                            <span className="text-xs text-muted-foreground">
                              Up to {Math.floor(MAX_MEMBER_FILE_BYTES / 1_000_000)}MB, any file type.
                            </span>
                          </form>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
                </Fragment>
              );})}
            </tbody>
          </table>
        </div>
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
