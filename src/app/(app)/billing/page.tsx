import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getBillingSnapshot } from "@/lib/billing/subscription";
import { isPaymentConfigured } from "@/lib/integrations/payment";
import { isStripeTestMode } from "@/lib/stripe/client";
import { prisma } from "@/lib/db";
import { PlanCard } from "@/components/billing/plan-card";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";

export default async function BillingPage({ searchParams }: { searchParams?: { checkout?: string } }) {
  const { active } = await requireTenantContext();
  const [snapshot, canEdit] = await Promise.all([
    getBillingSnapshot(active.companyId),
    can(active.id, "settings", "EDIT"),
  ]);

  const aiPct = snapshot.aiUsage.limit
    ? Math.min(100, Math.round((snapshot.aiUsage.used / snapshot.aiUsage.limit) * 100))
    : 0;
  const seatPct = Math.min(100, Math.round((snapshot.seats.used / snapshot.seats.limit) * 100));
  const sub = await prisma.subscription.findUnique({ where: { companyId: active.companyId } });
  const hasStripeAccount = sub?.provider === "stripe" && Boolean(sub.providerCustomerId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">
          {isPaymentConfigured()
            ? isStripeTestMode()
              ? "Payments run through Stripe in TEST mode — use a Stripe test card; no real money moves."
              : "Plans are billed securely through Stripe."
            : "No payment provider is configured — plan changes here are recorded and audited exactly like a real checkout, but no card is ever charged."}
        </p>
      </div>

      {searchParams?.checkout === "success" && (
        <div className="rounded-lg border border-green-600/30 bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-300">
          Payment received. Your new plan appears here as soon as Stripe confirms it — usually within a few seconds; refresh if it hasn&apos;t yet.
        </div>
      )}
      {searchParams?.checkout === "cancelled" && (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout was cancelled — nothing was charged.
        </div>
      )}
      {sub?.cancelAtPeriodEnd && sub.currentPeriodEnd && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Your paid plan is set to end on {sub.currentPeriodEnd.toISOString().slice(0, 10)}. Choose a plan below or open billing to keep it.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current plan</div>
            <div className="text-lg font-semibold text-card-foreground">{snapshot.planDefinition.label}</div>
            <div className="text-sm text-muted-foreground">
              Status: {snapshot.subscription.status}
              {snapshot.subscription.currentPeriodEnd && (
                <> · renews {snapshot.subscription.currentPeriodEnd.toISOString().slice(0, 10)}</>
              )}
            </div>
          </div>
          {canEdit && hasStripeAccount && <ManageBillingButton />}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-muted-foreground">Seats</div>
              <div className="text-sm font-medium text-card-foreground">{snapshot.seats.used} / {snapshot.seats.limit}</div>
              <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${seatPct}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">AI usage this month</div>
              <div className="text-sm font-medium text-card-foreground">
                {snapshot.aiUsage.used}{snapshot.aiUsage.limit !== null ? ` / ${snapshot.aiUsage.limit}` : " (unlimited)"}
              </div>
              {snapshot.aiUsage.limit !== null && (
                <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${aiPct >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${aiPct}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {snapshot.allPlans.map((p) => (
            <PlanCard
              key={p.plan}
              def={p}
              isCurrent={p.plan === snapshot.subscription.plan}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
