import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import {
  createCostCentreAction,
  toggleCostCentreAction,
  deleteCostCentreAction,
} from "./actions";

export const metadata = { title: "Cost Centres — Finloraq" };

export default async function CostCentresPage() {
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "settings");
  if (denied) return denied;
  const [canEdit, costCentres] = await Promise.all([
    can(active.id, "settings", "EDIT"),
    prisma.costCentre.findMany({
      where:   { companyId: active.company.id },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Cost centres let you tag journal lines to departments or projects for budgeting and reporting.
        </p>
      </div>

      <SettingsTabs />

      {/* Cost centres table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Cost Centres</h2>
          <span className="text-xs text-muted-foreground">{costCentres.length} total</span>
        </div>

        {costCentres.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No cost centres yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one below to start tagging journal entries by department.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costCentres.map((cc: any) => (
                  <tr
                    key={cc.id}
                    className={`hover:bg-muted/20 ${!cc.isActive ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{cc.code}</td>
                    <td className="px-4 py-3 text-foreground">{cc.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          cc.isActive
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {cc.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <form action={toggleCostCentreAction.bind(null, cc.id, !cc.isActive)}>
                            <button
                              type="submit"
                              className="text-xs text-primary underline-offset-2 hover:underline"
                            >
                              {cc.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                          <form action={deleteCostCentreAction.bind(null, cc.id)}>
                            <button
                              type="submit"
                              className="text-xs text-destructive underline-offset-2 hover:underline"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add form */}
        {canEdit && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Add Cost Centre</h3>
            <form
              action={createCostCentreAction}
              className="flex flex-wrap items-end gap-4"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Code (e.g. MKTG, OPS)
                </label>
                <input
                  name="code"
                  required
                  placeholder="MKTG"
                  maxLength={20}
                  className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  name="name"
                  required
                  placeholder="Marketing"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
