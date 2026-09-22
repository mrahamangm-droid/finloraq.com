// Pure Stripe helpers — no network, no database — so they are unit-tested.
//
// Finloraq talks to Stripe's REST API directly with fetch rather than the
// `stripe` npm SDK: the handful of endpoints we use are stable, it keeps the
// serverless bundle small, and webhook signatures are plain HMAC-SHA256.

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------- money

/** Currencies Stripe charges in whole units (no minor unit). */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
/** Three-decimal currencies. Stripe requires the last digit to be 0 for these. */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function currencyExponent(currency: string): 0 | 2 | 3 {
  const c = currency.toLowerCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/**
 * Converts a decimal amount (as stored in the ledger, e.g. "1250.50") to the
 * integer minor-unit amount Stripe expects. Works on the string form so no
 * binary floating-point rounding can creep in.
 */
export function toMinorUnits(amount: string | number, currency: string): number {
  const exp = currencyExponent(currency);
  const str = typeof amount === "number" ? amount.toFixed(4) : amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount: ${amount}`);
  const neg = str.startsWith("-");
  const [whole = "0", frac = ""] = str.replace("-", "").split(".");
  // round half up on the digit after the currency's precision
  const kept = (frac + "0000").slice(0, exp);
  const next = Number((frac + "0000")[exp] ?? "0");
  let minor = Number(whole) * 10 ** exp + (exp ? Number(kept) : 0);
  if (next >= 5) minor += 1;
  if (exp === 3) minor = Math.round(minor / 10) * 10;
  return neg ? -minor : minor;
}

/** Stripe minor units → decimal string with the currency's precision. */
export function fromMinorUnits(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  if (exp === 0) return String(minor);
  const neg = minor < 0;
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

// ---------------------------------------------------------------- form encoding

export type StripeParams = { [key: string]: StripeValue };
type StripeValue = string | number | boolean | null | undefined | StripeParams | StripeValue[];

/** Encodes nested params the way Stripe's API expects: a[b][0][c]=v. */
export function encodeParams(params: StripeParams, prefix = ""): string {
  const parts: string[] = [];
  const walk = (value: StripeValue, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`);
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) walk(v, prefix ? `${prefix}[${k}]` : k);
  return parts.join("&");
}

// ---------------------------------------------------------------- webhooks

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

/**
 * Verifies a `Stripe-Signature` header (scheme v1) against the raw request
 * body. Accepts several secrets because platform events and Connect events
 * arrive on separately-configured endpoints with their own signing secrets.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secrets: readonly string[],
  opts: { toleranceSeconds?: number; now?: number } = {},
): void {
  if (!header) throw new StripeSignatureError("Missing Stripe-Signature header");
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  let timestamp = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x.trim());
    if (k === "t") timestamp = Number(v);
    if (k === "v1" && v) sigs.push(v);
  }
  if (!Number.isFinite(timestamp) || !sigs.length) throw new StripeSignatureError("Malformed Stripe-Signature header");
  if (Math.abs(now - timestamp) > tolerance) throw new StripeSignatureError("Signature timestamp outside tolerance");

  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"), "utf8");
    for (const sig of sigs) {
      const got = Buffer.from(sig, "utf8");
      if (got.length === expected.length && timingSafeEqual(got, expected)) return;
    }
  }
  throw new StripeSignatureError("No matching signature");
}

/** Builds a valid header — used by tests and local tooling. */
export function signStripePayload(payload: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

// ---------------------------------------------------------------- subscription status

export type LocalSubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

/** Maps Stripe's subscription status onto Finloraq's four states. */
export function mapSubscriptionStatus(status: string): LocalSubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "PAST_DUE";
    default:
      return "CANCELED"; // canceled, incomplete_expired
  }
}
