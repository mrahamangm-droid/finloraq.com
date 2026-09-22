import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { listProjectsWithProfitability } from "@/lib/projects";
import { spendByCostCentre } from "@/lib/costCentres";
import { NewProjectForm } from "@/components/forms/new-project-form";
import { NewCostCentreForm } from "@/components/forms/new-cost-centre-form";

export default async function ProjectsPage() {
  const { active } = await requireTenantContext();
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [customers, projects, costCentres, spend] = await Promise.all([
    prisma.customer.findMany({ where: { companyId: active.companyId }, orderBy: { name: "asc" } }),
    listProjectsWithProfitability(active.companyId),
    prisma.costCentre.findMany({ where: { companyId: active.companyId }, orderBy: { code: "asc" } }),
    spendByCostCentre(active.companyId, from, now),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <NewProjectForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-right">Cost</th>
              <th className="px-4 py-2 text-right">Margin</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2 text-right">Budget variance</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No projects yet.</td></tr>
            )}
            {projects.map((p) => (
              <tr key={p.project.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <Link href={`/projects/${p.project.id}`} className="text-primary">{p.project.name}</Link>
                  <span className="ml-1 font-mono text-xs text-muted-foreground">{p.project.code}</span>
                </td>
                <td className="px-4 py-2 text-right text-card-foreground">{p.revenue.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-card-foreground">{p.cost.toFixed(2)}</td>
                <td className={`px-4 py-2 text-right font-medium ${p.margin < 0 ? "text-destructive" : "text-success"}`}>{p.margin.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{p.budget !== null ? p.budget.toFixed(2) : "—"}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {p.budgetVariance !== null ? p.budgetVariance.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Cost Centres</h2>
        <NewCostCentreForm />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
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
              {costCentres.map((cc) => {
                const s = spend.find((x) => x.id === cc.id);
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
        <p className="text-xs text-muted-foreground">
          Tag a manual journal line with a cost centre from Accounting → Journal Entries →
          New to see spend show up here.
        </p>
      </div>
    </div>
  );
}
