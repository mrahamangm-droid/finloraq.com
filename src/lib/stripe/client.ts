import { encodeParams, type StripeParams } from "./core";

/**
 * Minimal Stripe REST client (server-only). Uses STRIPE_SECRET_KEY — a test
 * key (sk_test_…) in preview/staging and a live key only in production.
 */

const API = "https://api.stripe.com/v1";
/** Pinned so a Stripe dashboard default change can't silently alter payloads. */
export const STRIPE_API_VERSION = "2024-06-20";

export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly type?: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export interface StripeRequestOptions {
  /** Retries with the same key are deduplicated by Stripe. */
  idempotencyKey?: string;
  /** Act on a connected account (Stripe Connect direct charges). */
  stripeAccount?: string;
}

export async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: StripeParams,
  opts: StripeRequestOptions = {},
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeApiError("Stripe is not configured (STRIPE_SECRET_KEY is empty).", 501);

  const body = params ? encodeParams(params) : "";
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (opts.stripeAccount) headers["Stripe-Account"] = opts.stripeAccount;

  const res = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string } };
  if (!res.ok) {
    throw new StripeApiError(json.error?.message ?? `Stripe request failed (${res.status})`, res.status, json.error?.code, json.error?.type);
  }
  return json as T;
}
