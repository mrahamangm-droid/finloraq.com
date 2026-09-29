import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { projectProfitability } from "@/lib/projects";
import { getTimeEntrySummary } from "@/lib/time-tracking";
import { prisma } from "@/lib/db";

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "projects");
  if (denied) return denied;
  const fmt = await getFormatter(userId);

  const exists = await prisma.project.findFirst({ where: { id: id, companyId: active.companyId } });
  if (!exists) notFound();

  const [p, timeSummary] = await Promise.all([
    projectProfitability(active.companyId, id),
    getTimeEntrySummary(active.companyId, id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{p.project.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{p.project.code}</p>
        </div>
        <Link
          href={`/projects/${id}/time`}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          ⏱ Time ({timeSummary.totalHours.toFixed(1)} h)
        </Link>
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
          <div className="text-xs text-muted-foreground">{p.billCount} bill(s){p.directCost > 0 ? ` + ${fmt.money(p.directCost)} direct` : ""}</div>
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
        Revenue counts sent/paid invoices linked to this project at subtotal (pre-tax). Cost
        counts approved/paid bills plus any manual journal lines tagged to this project against
        EXPENSE accounts (debit net of credit, so reversals cancel out). Budget variance compares
        total cost to the project budget.
      </p>
    </div>
  );
}
