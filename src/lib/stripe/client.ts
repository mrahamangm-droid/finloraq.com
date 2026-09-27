import { encodeStripeForm, STRIPE_API_VERSION } from "@/lib/integrations/stripe-core";
import { isStripeConfigured, stripeMode, StripeApiError } from "@/lib/integrations/stripe";

/**
 * Minimal Stripe REST client for Connect (acting on a connected account).
 * Subscription billing keeps using src/lib/integrations/stripe.ts; this one
 * adds the Stripe-Account and Idempotency-Key headers that Connect needs.
 */

const API = "https://api.stripe.com/v1";

export { isStripeConfigured };

export function isStripeTestMode(): boolean {
  return stripeMode() === "test";
}

export interface StripeRequestOptions {
  /** Retries with the same key are deduplicated by Stripe. */
  idempotencyKey?: string;
  /** Act on a connected account (Stripe Connect direct charges). */
  stripeAccount?: string;
}

type Params = Parameters<typeof encodeStripeForm>[0];

export async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Params,
  opts: StripeRequestOptions = {},
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeApiError("Stripe is not configured (STRIPE_SECRET_KEY is empty).", 501);

  const body = params ? encodeStripeForm(params) : "";
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (opts.stripeAccount) headers["Stripe-Account"] = opts.stripeAccount;

  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    throw new StripeApiError(json.error?.message ?? `Stripe request failed (${res.status})`, res.status, json.error?.code);
  }
  return json as T;
}
