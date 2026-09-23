import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getBillingSnapshot } from "@/lib/billing/subscription";
import { isPaymentConfigured } from "@/lib/integrations/payment";
import { reconcileStripeMode, stripeMode, syncFromCheckoutSession } from "@/lib/integrations/stripe";
import { cookies, headers } from "next/headers";
import { CurrencyPicker, ManageBillingButton, PlanCard } from "@/components/billing/plan-card";
import { CURRENCY_COOKIE, billingCurrencyForCountry, isBillingCurrency, type BillingCurrency } from "@/lib/billing/currency";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { checkout?: string; session_id?: string };
}) {
  const { active } = await requireTenantContext();

  // Returning from Stripe Checkout: sync right away so the new plan shows
  // without waiting for the webhook (which remains the source of truth).
  let checkoutNotice: { tone: "ok" | "warn"; text: string } | null = null;
  if (searchParams?.checkout === "success" && searchParams.session_id && isPaymentConfigured()) {
    try {
      const complete = await syncFromCheckoutSession(searchParams.session_id, active.companyId);
      checkoutNotice = complete
        ? { tone: "ok", text: "Payment received — your plan has been updated." }
        : { tone: "warn", text: "Checkout is still processing. Your plan will update as soon as Stripe confirms the payment." };
    } catch {
      checkoutNotice = { tone: "warn", text: "Payment submitted. Your plan will update as soon as Stripe confirms it." };
    }
  } else if (searchParams?.checkout === "cancelled") {
    checkoutNotice = { tone: "warn", text: "Checkout cancelled — no charge was made." };
  }

  if (isPaymentConfigured() && !searchParams?.session_id) {
    // Drops a plan cached from the other Stripe mode (test → live switch).
    await reconcileStripeMode(active.companyId).catch(() => undefined);
  }

  const saved = cookies().get(CURRENCY_COOKIE)?.value?.toLowerCase();
  const currency: BillingCurrency = isBillingCurrency(saved)
    ? saved
    : billingCurrencyForCountry(headers().get("x-vercel-ip-country"));

  const mode = stripeMode();
  const [snapshot, canEdit] = await Promise.all([
    getBillingSnapshot(active.companyId),
    can(active.id, "settings", "EDIT"),
  ]);

  const aiPct = snapshot.aiUsage.limit
    ? Math.min(100, Math.round((snapshot.aiUsage.used / snapshot.aiUsage.limit) * 100))
    : 0;
  const seatPct = Math.min(100, Math.round((snapshot.seats.used / snapshot.seats.limit) * 100));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">
          {isPaymentConfigured()
            ? mode === "test"
              ? "Stripe TEST mode — checkout uses test cards (e.g. 4242 4242 4242 4242); no real money moves."
              : "Plan changes are billed securely through Stripe."
            : "No payment provider is configured — plan changes here are recorded and audited exactly like a real checkout, but no card is ever charged."}
        </p>
      </div>

      {checkoutNotice && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            checkoutNotice.tone === "ok"
              ? "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {checkoutNotice.text}
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
          {canEdit && isPaymentConfigured() && snapshot.subscription.provider === "stripe" && <ManageBillingButton />}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plans</h2>
          <CurrencyPicker value={currency} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {snapshot.allPlans.map((p) => (
            <PlanCard
              key={p.plan}
              def={p}
              isCurrent={p.plan === snapshot.subscription.plan}
              canEdit={canEdit}
              currency={currency}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
