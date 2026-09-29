import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getPipelineSummary, getOrCreateDefaultPipeline } from "@/lib/crm";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { TrendingUp, Users, Target, Activity } from "lucide-react";

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default async function CrmPage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  await getOrCreateDefaultPipeline(active.companyId);

  const [summary, leadCounts, contactCount, overdueTasks] = await Promise.all([
    getPipelineSummary(active.companyId),
    prisma.lead.groupBy({
      by: ["status"],
      where: { companyId: active.companyId },
      _count: { id: true },
    }),
    prisma.crmContact.count({ where: { companyId: active.companyId } }),
    prisma.crmActivity.count({
      where: {
        companyId: active.companyId,
        status: "PLANNED",
        dueAt: { lt: new Date() },
      },
    }),
  ]);

  const newLeads = leadCounts.find((l: any) => l.status === "NEW")?._count.id ?? 0;
  const totalLeads = leadCounts.reduce((a: any, l: any) => a + l._count.id, 0);

  const currency = active.company.baseCurrency;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">CRM</h1>
        <p className="text-sm text-muted-foreground">{active.company.name} — Sales Pipeline</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Pipeline</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {fmt(summary?.totals.openValue ?? 0, currency)}
          </p>
          <p className="text-xs text-muted-foreground">{summary?.totals.openDeals ?? 0} open deals</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Weighted</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {fmt(summary?.totals.weightedValue ?? 0, currency)}
          </p>
          <p className="text-xs text-muted-foreground">probability-adjusted</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Leads</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totalLeads}</p>
          <p className="text-xs text-muted-foreground">{newLeads} new</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Overdue</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-destructive">{overdueTasks}</p>
          <p className="text-xs text-muted-foreground">tasks past due</p>
        </div>
      </div>

      {/* Pipeline funnel */}
      {summary && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-medium text-foreground">{summary.pipeline.name}</h2>
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {summary.stages
                .filter((s: any) => !s.isLost)
                .map((stage: any) => (
                  <div
                    key={stage.id}
                    className={`flex min-w-[140px] flex-col rounded-md border p-3 ${
                      stage.isWon
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {stage.name}
                    </span>
                    <span className="mt-1 text-lg font-semibold text-foreground">
                      {stage.dealCount}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(stage.totalValue, currency)}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {stage.probability}% win prob.
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick navigation */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { href: "/crm/leads",      label: "Leads",      icon: "👥" },
          { href: "/crm/contacts",   label: "Contacts",   icon: "📇" },
          { href: "/crm/deals",      label: "Deals",      icon: "🤝" },
          { href: "/crm/activities", label: "Activities", icon: "📋" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
