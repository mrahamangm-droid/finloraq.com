import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { projectProfitability } from "@/lib/projects";
import { prisma } from "@/lib/db";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const exists = await prisma.project.findFirst({ where: { id: params.id, companyId: active.companyId } });
  if (!exists) notFound();

  const p = await projectProfitability(active.companyId, params.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{p.project.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{p.project.code}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Revenue</div>
          <div className="mt-1 text-xl font-semibold text-card-foreground">{fmt.money(p.revenue)}</div>
          <div className="text-xs text-muted-foreground">{p.invoiceCount} invoice(s)</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Cost</div>
          <div className="mt-1 text-xl font-semibold text-card-foreground">{fmt.money(p.cost)}</div>
          <div className="text-xs text-muted-foreground">{p.billCount} bill(s)</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Margin</div>
          <div className={`mt-1 text-xl font-semibold ${p.margin < 0 ? "text-destructive" : "text-success"}`}>{fmt.money(p.margin)}</div>
          <div className="text-xs text-muted-foreground">{p.marginPct.toFixed(1)}%</div>
        </div>
      </div>

      {p.budget !== null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span className="text-card-foreground">{fmt.money(p.budget)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-medium">
            <span>{(p.budgetVariance ?? 0) < 0 ? "Over budget by" : "Under budget by"}</span>
            <span className={(p.budgetVariance ?? 0) < 0 ? "text-destructive" : "text-success"}>
              {fmt.money(Math.abs(p.budgetVariance ?? 0))}
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Revenue counts sent/paid invoices linked to this project at subtotal (pre-tax); cost
        counts approved/paid bills linked to this project. Direct expenses or labour coded to a
        project via a journal line&apos;s project tag aren&apos;t included in cost yet — only
        Bills are, since that&apos;s the document type that currently carries a projectId.
      </p>
    </div>
  );
}
