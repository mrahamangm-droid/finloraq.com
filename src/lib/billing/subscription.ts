import { prisma } from "@/lib/db";
import type { SubscriptionPlan } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { getPaymentAdapter } from "@/lib/integrations/payment";
import { planDefinition, PLAN_ORDER } from "@/lib/billing/plans";
import { currentMonthAiUsage } from "@/lib/billing/usage";

export class SeatLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`This plan's seat limit (${limit}) is already in use. Upgrade to invite more people.`);
    this.name = "SeatLimitExceededError";
  }
}

/** Full billing snapshot the Billing page and /api/billing/subscription render. */
export async function getBillingSnapshot(companyId: string) {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  const [activeSeats, aiUsed] = await Promise.all([
    prisma.companyMembership.count({ where: { companyId, isActive: true } }),
    currentMonthAiUsage(companyId),
  ]);
  const def = planDefinition(subscription.plan);

  return {
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      provider: subscription.provider,
    },
    planDefinition: def,
    seats: { used: activeSeats, limit: def.seats },
    aiUsage: { used: aiUsed, limit: def.aiUsageLimitPerMonth },
    allPlans: PLAN_ORDER.map((p) => planDefinition(p)),
  };
}

/**
 * Counts active memberships against the CURRENT plan's seat limit — used
 * both to warn before an upgrade/downgrade and by the invitation flow
 * (src/lib/users.ts) so a company can't invite past what it's paying for.
 */
export async function enforceSeatLimit(companyId: string): Promise<void> {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  const def = planDefinition(subscription.plan);

  const activeSeats = await prisma.companyMembership.count({ where: { companyId, isActive: true } });
  const pendingInvites = await prisma.invitation.count({ where: { companyId, status: "PENDING" } });

  if (activeSeats + pendingInvites >= def.seats) {
    throw new SeatLimitExceededError(def.seats);
  }
}

/**
 * Upgrades or downgrades a plan. Goes through the PaymentAdapter exactly
 * like a real checkout would (see src/lib/integrations/payment.ts) — in
 * this sandbox that's a simulated, clearly-marked non-live charge, since
 * no Stripe key is configured; the Subscription row and audit trail are
 * real either way, so the rest of the app (seat limits, AI usage caps)
 * behaves correctly regardless of whether a real charge backs it.
 * Downgrading to a plan with fewer seats than are currently in use is
 * intentionally allowed here (a real product would either block it or
 * require deactivating members first) — flagged as a TODO rather than a
 * silent gap, since enforcing it needs a "which members to deactivate"
 * decision from the user that a plan-change form isn't the right place for.
 */
export async function changePlan(params: {
  companyId: string;
  userId: string;
  newPlan: SubscriptionPlan;
}) {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { companyId: params.companyId } });
  const from = subscription.plan;
  const def = planDefinition(params.newPlan);

  let chargeResult = null;
  if (def.monthlyPriceUsd > 0) {
    chargeResult = await getPaymentAdapter().charge({
      amount: def.monthlyPriceUsd,
      currency: "USD",
      description: `Finloraq ${def.label} plan — monthly subscription`,
    });
  }

  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  const updated = await prisma.subscription.update({
    where: { companyId: params.companyId },
    data: {
      plan: params.newPlan,
      status: "ACTIVE",
      provider: chargeResult ? "dev-simulated" : subscription.provider,
      currentPeriodEnd: def.monthlyPriceUsd > 0 ? periodEnd : subscription.currentPeriodEnd,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "billing.plan_changed",
    entityType: "Subscription",
    entityId: updated.id,
    previousValue: { plan: from },
    newValue: { plan: params.newPlan, charge: chargeResult },
    source: "web",
  });

  return { subscription: updated, chargeResult };
}
