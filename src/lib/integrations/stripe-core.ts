import { createHmac, timingSafeEqual } from "node:crypto";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

/**
 * Pure (no network, no database) Stripe helpers, split out from stripe.ts so
 * they can be unit-tested without a live Stripe account or Postgres.
 *
 * The integration deliberately talks to Stripe's REST API with fetch rather
 * than the `stripe` npm package: the surface we need is small (customers,
 * prices, products, checkout sessions, billing portal, subscriptions,
 * webhook signatures) and this keeps the dependency tree and lockfile
 * unchanged.
 */

export const STRIPE_API_VERSION = "2024-06-20";

const PAID_PLANS: SubscriptionPlan[] = ["GROWTH", "PROFESSIONAL", "AI_CFO"];

/** Stable Stripe Price lookup_key per plan — how code and Stripe agree on "which price is Growth". */
export function planLookupKey(plan: SubscriptionPlan): string {
  return `finloraq_${plan.toLowerCase()}_monthly`;
}

/** Reverse of planLookupKey, preferring the explicit metadata.plan we set on every price we create. */
export function planFromPrice(price: { lookup_key?: string | null; metadata?: Record<string, string> | null } | null | undefined): SubscriptionPlan | null {
  if (!price) return null;
  const fromMeta = price.metadata?.plan;
  if (fromMeta && (PAID_PLANS as string[]).includes(fromMeta)) return fromMeta as SubscriptionPlan;
  const m = /^finloraq_([a-z_]+)_monthly$/.exec(price.lookup_key ?? "");
  const fromKey = m?.[1]?.toUpperCase();
  if (fromKey && (PAID_PLANS as string[]).includes(fromKey)) return fromKey as SubscriptionPlan;
  return null;
}

/** "sk_test_…"/"rk_test_…" → test, "sk_live_…"/"rk_live_…" → live. */
export function stripeModeFromKey(key: string | undefined | null): "test" | "live" | null {
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return null;
}

/** Stripe subscription status → our SubscriptionStatus enum. */
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      // past_due, unpaid, incomplete, paused — money is owed or not yet collected.
      return "PAST_DUE";
  }
}

/** Statuses that still entitle the customer to the paid plan (past_due keeps access during Stripe's retry window). */
export function isEntitlingStatus(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [k: string]: FormValue };

/** Encodes nested params the way Stripe's API expects (a[b][0][c]=v), skipping null/undefined. */
export function encodeStripeForm(params: Record<string, FormValue>): string {
  const out: string[] = [];
  const walk = (value: FormValue, key: string) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) walk(v, k);
  return out.join("&");
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verifies a Stripe-Signature header (t=…,v1=…[,v1=…]) against the raw
 * request body, per Stripe's documented scheme: HMAC-SHA256 of
 * `${t}.${payload}` keyed by the endpoint's whsec_ secret, compared in
 * constant time, with a replay-window tolerance on t.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {}
): void {
  if (!header) throw new WebhookSignatureError("Missing Stripe-Signature header.");
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") timestamp = Number(v);
    else if (k === "v1") signatures.push(v);
  }
  if (timestamp === null || !Number.isFinite(timestamp)) throw new WebhookSignatureError("Signature header has no valid timestamp.");
  if (signatures.length === 0) throw new WebhookSignatureError("Signature header has no v1 signature.");
  if (Math.abs(now - timestamp) > tolerance) throw new WebhookSignatureError("Signature timestamp is outside the tolerance window.");

  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"), "utf8");
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookSignatureError("No signature matches the expected value.");
}

/** Builds a valid header for tests / local tooling. */
export function signStripePayload(payload: string, secret: string, timestamp: number): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${sig}`;
}
