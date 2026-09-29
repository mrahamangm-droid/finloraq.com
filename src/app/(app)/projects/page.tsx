import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { listProjectsWithProfitability, countArchivedProjects } from "@/lib/projects";
import { spendByCostCentre } from "@/lib/costCentres";
import { NewProjectForm } from "@/components/forms/new-project-form";
import { NewCostCentreForm } from "@/components/forms/new-cost-centre-form";
import { ProjectRow } from "@/components/forms/project-row";

export default async function ProjectsPage(props: { searchParams?: Promise<{ archived?: string }> }) {
  const searchParams = (await props.searchParams) ?? {};
  const sp = searchParams;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "projects");
  if (denied) return denied;
  const fmt = await getFormatter(userId);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const showArchived = sp.archived === "1";

  const [customers, projects, costCentres, spend, canDelete, canEdit, archivedCount] = await Promise.all([
    prisma.customer.findMany({ where: { companyId: active.companyId }, orderBy: { name: "asc" } }),
    listProjectsWithProfitability(active.companyId, !showArchived),
    prisma.costCentre.findMany({ where: { companyId: active.companyId }, orderBy: { code: "asc" } }),
    spendByCostCentre(active.companyId, from, now),
    can(active.id, "projects", "DELETE"),
    can(active.id, "projects", "EDIT"),
    countArchivedProjects(active.companyId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <NewProjectForm customers={customers.map((c: any) => ({ id: c.id, name: c.name }))} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {showArchived ? "Archived projects" : "Active projects"}
          </span>
          {(showArchived || archivedCount > 0) && (
            <a href={showArchived ? "/projects" : "/projects?archived=1"} className="text-xs font-medium text-muted-foreground underline hover:text-foreground">
              {showArchived ? "Back to active projects" : `Show archived (${archivedCount})`}
            </a>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Margin</th>
                <th className="px-4 py-2 text-right">Budget</th>
                <th className="px-4 py-2 text-right">Budget variance</th>
                {(canDelete || canEdit) && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6 + (canDelete || canEdit ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                    {showArchived ? "No archived projects." : "No projects yet."}
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <ProjectRow
                  key={p.project.id}
                  p={p}
                  customers={customers.map((c: any) => ({ id: c.id, name: c.name }))}
                  revenueDisplay={fmt.money(p.revenue)}
                  costDisplay={fmt.money(p.cost)}
                  marginDisplay={fmt.money(p.margin)}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Cost Centres</h2>
        <NewCostCentreForm />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 text-right">Spend this month</th>
                </tr>
              </thead>
              <tbody>
                {costCentres.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No cost centres yet.</td></tr>
                )}
                {costCentres.map((cc: any) => {
                  const s = spend.find((x: any) => x.id === cc.id);
                  return (
                    <tr key={cc.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{cc.code}</td>
                      <td className="px-4 py-2 text-card-foreground">{cc.name}</td>
                      <td className="px-4 py-2 text-right text-card-foreground">{(s?.spend ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tag a manual journal line with a cost centre from Accounting → Journal Entries →
          New to see spend show up here.
        </p>
      </div>
    </div>
  );
}
