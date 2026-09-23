import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { planDefinition } from "@/lib/billing/plans";
import {
  STRIPE_API_VERSION,
  encodeStripeForm,
  isEntitlingStatus,
  mapStripeStatus,
  planFromPrice,
  planLookupKey,
  stripeModeFromKey,
} from "@/lib/integrations/stripe-core";

/**
 * Real Stripe billing (Checkout + Customer Portal + webhooks).
 *
 * Source-of-truth rule: Stripe owns "what is this customer paying for";
 * our Subscription row is a cache of it, rebuilt by syncStripeCustomer()
 * from the customer's CURRENT subscriptions every time any relevant
 * event arrives. That makes webhook handling order-independent and
 * idempotent — a late or duplicated event just re-syncs the same state.
 *
 * Prices are provisioned lazily and idempotently: the first checkout for
 * a plan creates its Product + monthly Price (lookup_key
 * finloraq_<plan>_monthly) from src/lib/billing/plans.ts, so there's no
 * manual product setup in the Stripe dashboard, and changing a price in
 * plans.ts rolls a new Price that takes over the lookup_key.
 */

const API_BASE = "https://api.stripe.com/v1";

export class StripeApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "StripeApiError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeMode(): "test" | "live" | null {
  return stripeModeFromKey(process.env.STRIPE_SECRET_KEY);
}

async function stripe<T = any>(method: "GET" | "POST", path: string, params?: Record<string, any>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeApiError("STRIPE_SECRET_KEY is not set.", 500);

  const query = params ? encodeStripeForm(params) : "";
  const url = method === "GET" && query ? `${API_BASE}${path}?${query}` : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? query : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StripeApiError(json?.error?.message ?? `Stripe request failed (${res.status}).`, res.status, json?.error?.code);
  }
  return json as T;
}

/** Finds (or creates) the active monthly Price for a paid plan. */
export async function ensurePlanPrice(plan: SubscriptionPlan): Promise<string> {
  return (await ensurePlanPriceWithProduct(plan)).priceId;
}

async function ensurePlanPriceWithProduct(plan: SubscriptionPlan): Promise<{ priceId: string; productId: string }> {
  const def = planDefinition(plan);
  if (def.monthlyPriceUsd <= 0) throw new Error(`${def.label} is not a self-serve paid plan.`);
  const lookupKey = planLookupKey(plan);
  const unitAmount = Math.round(def.monthlyPriceUsd * 100);

  const existing = await stripe<{ data: any[] }>("GET", "/prices", {
    lookup_keys: [lookupKey],
    active: true,
    expand: ["data.product"],
  });
  const current = existing.data[0];
  if (current && current.unit_amount === unitAmount && current.currency === "usd" && current.recurring?.interval === "month") {
    return { priceId: current.id, productId: typeof current.product === "string" ? current.product : current.product.id };
  }

  // Reuse the product if a (now stale-priced) price exists; otherwise create it.
  let productId: string | undefined = typeof current?.product === "string" ? current.product : current?.product?.id;
  if (!productId) {
    const product = await stripe("POST", "/products", {
      name: `Finloraq ${def.label}`,
      description: def.description,
      metadata: { plan },
    });
    productId = product.id;
  }

  const price = await stripe("POST", "/prices", {
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${def.label} — monthly`,
    metadata: { plan },
  });
  return { priceId: price.id, productId: productId as string };
}

const SELF_SERVE_PLANS: SubscriptionPlan[] = ["GROWTH", "PROFESSIONAL", "AI_CFO"];

/**
 * Makes sure a Customer Portal configuration exists that allows invoice
 * history, card updates, cancel-at-period-end and switching between the
 * Finloraq plans — so nothing has to be configured by hand in the Stripe
 * dashboard. Tagged metadata.finloraq=1; updated when plan prices change.
 */
async function ensurePortalConfiguration(): Promise<string> {
  const plans = await Promise.all(SELF_SERVE_PLANS.map((p) => ensurePlanPriceWithProduct(p)));
  const priceKey = plans.map((p) => p.priceId).join(",");
  const features = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price", "promotion_code"],
      proration_behavior: "create_prorations",
      products: plans.map((p) => ({ product: p.productId, prices: [p.priceId] })),
    },
  };

  const list = await stripe<{ data: any[] }>("GET", "/billing_portal/configurations", { active: true, limit: 100 });
  const ours = list.data.find((c) => c.metadata?.finloraq === "1");
  if (ours) {
    if (ours.metadata?.prices !== priceKey) {
      await stripe("POST", `/billing_portal/configurations/${ours.id}`, { features, metadata: { finloraq: "1", prices: priceKey } });
    }
    return ours.id;
  }

  const created = await stripe("POST", "/billing_portal/configurations", {
    business_profile: { headline: "Manage your Finloraq subscription" },
    features,
    metadata: { finloraq: "1", prices: priceKey },
  });
  return created.id;
}

/** Returns a valid Stripe customer for the company, creating one (and saving its id) if needed. */
async function ensureCustomer(companyId: string, email: string | null, companyName: string): Promise<string> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });

  if (sub.providerCustomerId) {
    // A customer id from the other mode (test vs live) or a deleted customer won't resolve — replace it.
    try {
      const c = await stripe("GET", `/customers/${sub.providerCustomerId}`);
      if (!c.deleted) return c.id;
    } catch (err) {
      if (!(err instanceof StripeApiError) || err.status !== 404) throw err;
    }
  }

  const customer = await stripe("POST", "/customers", {
    name: companyName,
    email: email ?? undefined,
    metadata: { companyId },
  });
  await prisma.subscription.update({ where: { companyId }, data: { providerCustomerId: customer.id } });
  return customer.id;
}

export async function createCheckoutSession(input: {
  companyId: string;
  userId: string;
  plan: SubscriptionPlan;
  origin: string;
}): Promise<string> {
  const [company, user] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: input.companyId } }),
    prisma.user.findUnique({ where: { id: input.userId } }),
  ]);
  const [priceId, customerId] = await Promise.all([
    ensurePlanPrice(input.plan),
    ensureCustomer(input.companyId, user?.email ?? null, company.name),
  ]);

  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.companyId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${input.origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/billing?checkout=cancelled`,
    metadata: { companyId: input.companyId, plan: input.plan, userId: input.userId },
    subscription_data: { metadata: { companyId: input.companyId, plan: input.plan } },
  });

  await recordAuditEvent({
    companyId: input.companyId,
    userId: input.userId,
    action: "billing.checkout_started",
    entityType: "Subscription",
    entityId: session.id,
    newValue: { plan: input.plan, mode: stripeMode() },
    source: "web",
  });

  return session.url as string;
}

export async function createPortalSession(companyId: string, returnUrl: string): Promise<string> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  if (!sub.providerCustomerId) throw new Error("This company has no Stripe billing account yet — choose a paid plan first.");
  const configuration = await ensurePortalConfiguration();
  const session = await stripe("POST", "/billing_portal/sessions", {
    customer: sub.providerCustomerId,
    return_url: returnUrl,
    configuration,
  });
  return session.url as string;
}

/**
 * If the company's saved Stripe customer doesn't exist under the current
 * key (e.g. it was created in test mode and the app is now on a live key,
 * or it was deleted), the cached plan no longer reflects anything Stripe
 * is billing — reset it to the free Starter plan so the user can check
 * out again under the current mode.
 */
export async function reconcileStripeMode(companyId: string): Promise<void> {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  if (sub.provider !== "stripe" || !sub.providerCustomerId) return;
  try {
    const c = await stripe("GET", `/customers/${sub.providerCustomerId}`);
    if (!c.deleted) return;
  } catch (err) {
    if (!(err instanceof StripeApiError) || err.status !== 404) throw err;
  }
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { plan: "STARTER", status: "ACTIVE", provider: null, providerCustomerId: null, currentPeriodEnd: null },
  });
  await recordAuditEvent({
    companyId,
    action: "billing.stripe_mode_reset",
    entityType: "Subscription",
    entityId: sub.id,
    previousValue: { plan: sub.plan, status: sub.status, providerCustomerId: sub.providerCustomerId },
    newValue: { plan: "STARTER", reason: "Saved Stripe customer not found under the current key", mode: stripeMode() },
    source: "system",
  });
}

/** True when the company currently has a paid, Stripe-managed subscription (plan changes then go through the portal). */
export async function hasActiveStripeSubscription(companyId: string): Promise<boolean> {
  await reconcileStripeMode(companyId);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
  return sub.provider === "stripe" && sub.plan !== "STARTER" && sub.status !== "CANCELED" && Boolean(sub.providerCustomerId);
}

/**
 * Rebuilds the company's Subscription row from the customer's current
 * Stripe subscriptions. No entitling subscription → back to the free
 * Starter plan.
 */
export async function syncStripeCustomer(customerId: string, hintCompanyId?: string | null): Promise<boolean> {
  let row = await prisma.subscription.findFirst({ where: { providerCustomerId: customerId } });
  if (!row) {
    let companyId = hintCompanyId ?? null;
    if (!companyId) {
      const customer = await stripe("GET", `/customers/${customerId}`);
      companyId = customer?.metadata?.companyId ?? null;
    }
    // Not a Finloraq customer (e.g. another product on the same Stripe
    // account, or a dashboard test fixture) — nothing to sync, not an error.
    if (!companyId) return false;
    row = await prisma.subscription.findUnique({ where: { companyId } });
    if (!row) return false;
  }

  const list = await stripe<{ data: any[] }>("GET", "/subscriptions", {
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const live = list.data
    .filter((s) => isEntitlingStatus(s.status))
    .sort((a, b) => b.created - a.created)[0];

  const plan: SubscriptionPlan = live ? planFromPrice(live.items?.data?.[0]?.price) ?? (live.metadata?.plan as SubscriptionPlan) ?? row.plan : "STARTER";
  const status = live ? mapStripeStatus(live.status) : "ACTIVE";
  const periodEndSec: number | undefined = live?.current_period_end ?? live?.items?.data?.[0]?.current_period_end;
  const currentPeriodEnd = live && periodEndSec ? new Date(periodEndSec * 1000) : null;

  const changed =
    row.plan !== plan ||
    row.status !== status ||
    row.provider !== "stripe" ||
    row.providerCustomerId !== customerId ||
    (row.currentPeriodEnd?.getTime() ?? null) !== (currentPeriodEnd?.getTime() ?? null);
  if (!changed) return true;

  await prisma.subscription.update({
    where: { id: row.id },
    data: { plan, status, provider: "stripe", providerCustomerId: customerId, currentPeriodEnd },
  });

  await recordAuditEvent({
    companyId: row.companyId,
    action: "billing.stripe_synced",
    entityType: "Subscription",
    entityId: row.id,
    previousValue: { plan: row.plan, status: row.status, provider: row.provider },
    newValue: { plan, status, provider: "stripe", stripeSubscriptionId: live?.id ?? null, mode: stripeMode() },
    source: "system",
  });
  return true;
}

/**
 * Called from the Checkout success redirect so the plan updates
 * immediately (and still works if the webhook isn't configured yet).
 * Only syncs a session that belongs to the signed-in company.
 */
export async function syncFromCheckoutSession(sessionId: string, companyId: string): Promise<boolean> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const session = await stripe("GET", `/checkout/sessions/${sessionId}`);
  if (session.client_reference_id !== companyId || !session.customer) return false;
  await syncStripeCustomer(session.customer as string, companyId);
  return session.status === "complete";
}
