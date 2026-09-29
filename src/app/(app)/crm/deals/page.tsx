import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listDeals, getOrCreateDefaultPipeline } from "@/lib/crm";
import Link from "next/link";
import { NewDealForm } from "@/components/crm/new-deal-form";

function fmt(n: number | string, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string; open?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const [canCreate, pipeline, dealsResult] = await Promise.all([
    can(active.id, "crm", "CREATE"),
    getOrCreateDefaultPipeline(active.companyId),
    listDeals(active.companyId, {
      pipelineId: sp.pipelineId,
      open: sp.open === "false" ? false : true,
      page: parseInt(sp.page ?? "1", 10),
      limit: 100,
    }),
  ]);

  const currency = active.company.baseCurrency;

  // Group deals by stage
  type StageEntry = { id: string; name: string; isWon: boolean; isLost: boolean; probability: number; deals: typeof dealsResult.items };
  const stageMap = new Map<string, StageEntry>((pipeline.stages as any[]).map((s: any) => [s.id as string, { ...s, deals: [] as typeof dealsResult.items } as StageEntry]));
  for (const deal of dealsResult.items) {
    stageMap.get(deal.stageId)?.deals.push(deal);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Deals</h1>
          <p className="text-sm text-muted-foreground">{dealsResult.total} total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-border text-xs">
            <Link
              href="/crm/deals?open=true"
              className={`px-3 py-1.5 ${(sp.open ?? "true") === "true" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              Open
            </Link>
            <Link
              href="/crm/deals?open=false"
              className={`px-3 py-1.5 ${sp.open === "false" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              Closed
            </Link>
          </div>
          <Link href="/crm" className="text-sm text-muted-foreground hover:text-foreground">
            ← CRM
          </Link>
        </div>
      </div>

      {canCreate && <NewDealForm pipeline={pipeline} />}

      {/* Kanban board */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-4">
          {pipeline.stages
            .filter((s: any) => !s.isLost || sp.open === "false")
            .map((stage: any) => {
              const col = stageMap.get(stage.id);
              const stageDeals = col?.deals ?? [];
              const total = stageDeals.reduce((a: any, d: any) => a + Number(d.value), 0);

              return (
                <div key={stage.id} className="flex w-64 flex-col gap-2 shrink-0">
                  {/* Column header */}
                  <div
                    className={`rounded-t-lg px-3 py-2 text-xs font-medium ${
                      stage.isWon
                        ? "bg-green-500/20 text-green-700 dark:text-green-300"
                        : stage.isLost
                        ? "bg-red-500/20 text-red-700 dark:text-red-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{stage.name}</span>
                      <span className="rounded-full bg-background px-1.5 py-0.5 text-foreground">
                        {stageDeals.length}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs opacity-75">{fmt(total, currency)}</div>
                  </div>

                  {/* Deal cards */}
                  <div className="flex flex-col gap-2 rounded-b-lg border border-t-0 border-border bg-muted/20 p-2 min-h-[200px]">
                    {stageDeals.map((deal: any) => (
                      <div
                        key={deal.id}
                        className="rounded-md border border-border bg-card p-3 shadow-sm"
                      >
                        <p className="text-sm font-medium text-foreground truncate">{deal.name}</p>
                        <p className="mt-1 text-xs font-semibold text-foreground">
                          {fmt(deal.value, deal.currency)}
                        </p>
                        {deal.customer && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">
                            {deal.customer.name}
                          </p>
                        )}
                        {deal.assignedTo && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            👤 {deal.assignedTo.user.name}
                          </p>
                        )}
                        {deal.expectedCloseDate && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            📅 {new Date(deal.expectedCloseDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-4">No deals</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
