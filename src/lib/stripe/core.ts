// Pure money helpers for Stripe Connect invoice payments — no network, no
// database — so they are unit-tested. (Request encoding and webhook
// signature verification live in src/lib/integrations/stripe-core.ts.)

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
