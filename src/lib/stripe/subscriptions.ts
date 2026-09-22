import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { SITE_URL } from "@/lib/site";
import { stripeRequest } from "./client";
import { mapSubscriptionStatus } from "./core";

/**
 * Finloraq's own subscription billing (companies paying Finloraq).
 *
 * Prices live in Stripe, not in code: create one recurring Price per paid
 * plan in the Stripe dashboard (AED or USD — Stripe handles the currency)
 * and put the price ids in STRIPE_PRICE_GROWTH / _PROFESSIONAL / _AI_CFO.
 * The Stripe webhook is the source of truth: the database only changes when
 * Stripe confirms, never because a browser was redirected to a success URL.
 */

const PRICE_ENV: Partial<Record<SubscriptionPlan, string>> = {
  GROWTH: "STRIPE_PRICE_GROWTH",
  PROFESSIONAL: "STRIPE_PRICE_PROFESSIONAL",
  AI_CFO: "STRIPE_PRICE_AI_CFO",
};

export function priceIdForPlan(plan: SubscriptionPlan): string | null {
  const env = PRICE_ENV[plan];
  return env ? process.env[env] || null : null;
}

export function planForPriceId(priceId: string | null | undefined): SubscriptionPlan | null {
  if (!priceId) return null;
  for (const [plan, env] of Object.entries(PRICE_ENV)) {
    if (process.env[env] === priceId) return plan as SubscriptionPlan;
  }
  return null;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items: { data: Array<{ id: string; price: { id: string }; current_period_end?: number }> };
}

async function ensureCustomer(companyId: string, email: string | null): Promise<string> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId }, include: { company: true } });
  if (sub.providerCustomerId && sub.provider === "stripe") return sub.providerCustomerId;

  const customer = await stripeRequest<{ id: string }>(
    "POST",
    "/customers",
    {
      name: sub.company.legalName || sub.company.name,
      email: email ?? undefined,
      metadata: { companyId },
    },
    { idempotencyKey: `customer:${companyId}` },
  );
  await prisma.subscription.update({ where: { companyId }, data: { provider: "stripe", providerCustomerId: customer.id } });
  return customer.id;
}

export type PlanChangeResult =
  | { kind: "checkout"; url: string }
  | { kind: "updated" }
  | { kind: "cancel_scheduled" };

/**
 * Starts or changes a paid plan.
 * - No Stripe subscription yet → a Stripe Checkout URL (card entry, 3-D Secure, receipts).
 * - Existing subscription → switch its price in place, prorated; the webhook confirms.
 * - Moving to the free Starter plan → cancel at period end (they keep what they paid for).
 */
export async function changePlanWithStripe(params: {
  companyId: string;
  userId: string;
  plan: SubscriptionPlan;
}): Promise<PlanChangeResult> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId: params.companyId } });
  const hasLive = sub.provider === "stripe" && sub.providerSubscriptionId && sub.status !== "CANCELED";

  if (params.plan === "STARTER") {
    if (!hasLive) throw new Error("You're not on a paid plan.");
    await stripeRequest("POST", `/subscriptions/${sub.providerSubscriptionId}`, { cancel_at_period_end: true });
    await prisma.subscription.update({ where: { companyId: params.companyId }, data: { cancelAtPeriodEnd: true } });
    await recordAuditEvent({
      companyId: params.companyId, userId: params.userId, action: "billing.cancel_scheduled",
      entityType: "Subscription", entityId: sub.id, source: "web",
    });
    return { kind: "cancel_scheduled" };
  }

  const priceId = priceIdForPlan(params.plan);
  if (!priceId) throw new Error(`No Stripe price is configured for this plan (set ${PRICE_ENV[params.plan] ?? "its price"} in the environment).`);

  if (hasLive) {
    const current = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${sub.providerSubscriptionId}`);
    const item = current.items.data[0];
    if (!item) throw new Error("The Stripe subscription has no items.");
    await stripeRequest("POST", `/subscriptions/${current.id}`, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
      metadata: { companyId: params.companyId },
    });
    await recordAuditEvent({
      companyId: params.companyId, userId: params.userId, action: "billing.plan_change_requested",
      entityType: "Subscription", entityId: sub.id, previousValue: { plan: sub.plan }, newValue: { plan: params.plan }, source: "web",
    });
    return { kind: "updated" };
  }

  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  const customerId = await ensureCustomer(params.companyId, user?.email ?? null);
  const session = await stripeRequest<{ url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    client_reference_id: params.companyId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { companyId: params.companyId } },
    metadata: { companyId: params.companyId, kind: "subscription" },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: `${SITE_URL}/billing?checkout=success`,
    cancel_url: `${SITE_URL}/billing?checkout=cancelled`,
  });
  return { kind: "checkout", url: session.url };
}

/** Stripe's hosted page for cards, invoices/receipts and cancellation. */
export async function billingPortalUrl(companyId: string): Promise<string> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  if (sub.provider !== "stripe" || !sub.providerCustomerId) throw new Error("There is no Stripe billing account for this company yet.");
  const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: sub.providerCustomerId,
    return_url: `${SITE_URL}/billing`,
  });
  return session.url;
}

/** Applies a Stripe subscription object to the local Subscription row. */
export async function syncSubscription(stripeSub: StripeSubscription, deleted = false): Promise<void> {
  const companyId =
    stripeSub.metadata?.companyId ??
    (await prisma.subscription.findFirst({
      where: { OR: [{ providerSubscriptionId: stripeSub.id }, { providerCustomerId: stripeSub.customer }] },
    }))?.companyId;
  if (!companyId) return; // not ours (or created outside Finloraq) — ignore safely

  const item = stripeSub.items?.data?.[0];
  const priceId = item?.price.id ?? null;
  const plan = planForPriceId(priceId);
  const periodEnd = stripeSub.current_period_end ?? item?.current_period_end;
  const status = deleted ? "CANCELED" : mapSubscriptionStatus(stripeSub.status);
  const before = await prisma.subscription.findUnique({ where: { companyId } });
  if (!before) return;

  const updated = await prisma.subscription.update({
    where: { companyId },
    data: {
      provider: "stripe",
      providerCustomerId: stripeSub.customer,
      providerSubscriptionId: stripeSub.id,
      providerPriceId: priceId,
      // a cancelled subscription drops back to the free plan
      plan: status === "CANCELED" ? "STARTER" : plan ?? before.plan,
      status: status === "CANCELED" ? "ACTIVE" : status,
      cancelAtPeriodEnd: status === "CANCELED" ? false : stripeSub.cancel_at_period_end,
      currentPeriodEnd: status === "CANCELED" ? null : periodEnd ? new Date(periodEnd * 1000) : before.currentPeriodEnd,
    },
  });

  if (before.plan !== updated.plan || before.status !== updated.status) {
    await recordAuditEvent({
      companyId, action: "billing.subscription_synced", entityType: "Subscription", entityId: updated.id,
      previousValue: { plan: before.plan, status: before.status },
      newValue: { plan: updated.plan, status: updated.status, stripeStatus: stripeSub.status },
      source: "system",
    });
  }
}

export async function syncSubscriptionById(subscriptionId: string): Promise<void> {
  const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`);
  await syncSubscription(sub);
}

export type { StripeSubscription };
