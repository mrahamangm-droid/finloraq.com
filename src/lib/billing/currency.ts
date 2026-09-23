/**
 * Currencies for pricing — shared by the marketing homepage, the in-app
 * Billing page and the Stripe integration. Pure data + helpers, safe to
 * import from client components.
 *
 * Two kinds of currency, and the UI must never blur them:
 *
 *  - BILLING currencies: Finloraq has a fixed, rounded price in that
 *    currency (see `prices` in plans.ts) and Stripe charges exactly that
 *    amount. What the visitor sees is what they pay.
 *  - DISPLAY-ONLY currencies: an approximate conversion of the US$ price at
 *    a daily market rate, shown with "≈" and "billed in US$". Nobody is
 *    ever charged in these.
 */

export const BILLING_CURRENCIES = ["usd", "aed", "sar", "qar", "eur", "gbp", "cad", "aud"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export const BILLING_CURRENCY_LABELS: Record<BillingCurrency, string> = {
  usd: "US dollar",
  aed: "UAE dirham",
  sar: "Saudi riyal",
  qar: "Qatari riyal",
  eur: "Euro",
  gbp: "British pound",
  cad: "Canadian dollar",
  aud: "Australian dollar",
};

/**
 * Reference USD rates the fixed prices were set from (Sept 2026; AED/SAR/QAR
 * are pegged). A unit test keeps every fixed price within 6% of these, so a
 * price can't silently drift far from its US$ equivalent. Update the rates
 * and prices together when re-pricing.
 */
export const REFERENCE_USD_RATES: Record<BillingCurrency, number> = {
  usd: 1,
  aed: 3.6725,
  sar: 3.75,
  qar: 3.64,
  eur: 0.872,
  gbp: 0.748,
  cad: 1.403,
  aud: 1.405,
};

/** Display-only currencies (estimate, billed in US$). Code → label. */
export const DISPLAY_CURRENCIES: Record<string, string> = {
  INR: "Indian rupee",
  PKR: "Pakistani rupee",
  BDT: "Bangladeshi taka",
  LKR: "Sri Lankan rupee",
  NPR: "Nepalese rupee",
  KWD: "Kuwaiti dinar",
  BHD: "Bahraini dinar",
  OMR: "Omani rial",
  JOD: "Jordanian dinar",
  EGP: "Egyptian pound",
  MAD: "Moroccan dirham",
  TRY: "Turkish lira",
  NGN: "Nigerian naira",
  KES: "Kenyan shilling",
  ZAR: "South African rand",
  SGD: "Singapore dollar",
  MYR: "Malaysian ringgit",
  IDR: "Indonesian rupiah",
  PHP: "Philippine peso",
  HKD: "Hong Kong dollar",
  CNY: "Chinese yuan",
  JPY: "Japanese yen",
  CHF: "Swiss franc",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  NZD: "New Zealand dollar",
  BRL: "Brazilian real",
  MXN: "Mexican peso",
};

export const CURRENCY_COOKIE = "fq_currency";

export function isBillingCurrency(code: string | null | undefined): code is BillingCurrency {
  return !!code && (BILLING_CURRENCIES as readonly string[]).includes(code.toLowerCase());
}

export function isDisplayCurrency(code: string | null | undefined): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(DISPLAY_CURRENCIES, code.toUpperCase());
}

const EUROZONE = "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ");

/** Country (ISO-3166 alpha-2, e.g. from Vercel's x-vercel-ip-country) → currency code (upper case). */
export function currencyForCountry(country: string | null | undefined): string {
  const c = (country ?? "").toUpperCase();
  if (EUROZONE.includes(c)) return "EUR";
  const map: Record<string, string> = {
    AE: "AED", SA: "SAR", QA: "QAR", GB: "GBP", CA: "CAD", AU: "AUD", US: "USD",
    IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", KW: "KWD", BH: "BHD", OM: "OMR",
    JO: "JOD", EG: "EGP", MA: "MAD", TR: "TRY", NG: "NGN", KE: "KES", ZA: "ZAR", SG: "SGD",
    MY: "MYR", ID: "IDR", PH: "PHP", HK: "HKD", CN: "CNY", JP: "JPY", CH: "CHF", SE: "SEK",
    NO: "NOK", NZ: "NZD", BR: "BRL", MX: "MXN",
  };
  return map[c] ?? "USD";
}

/** Billing currency to charge a visitor from `country` when they haven't picked one: their own if billable, else USD. */
export function billingCurrencyForCountry(country: string | null | undefined): BillingCurrency {
  const code = currencyForCountry(country).toLowerCase();
  return isBillingCurrency(code) ? code : "usd";
}

/** "AED 179", "€45", "US$49", "≈ ₹4,698" — locale-stable (en) formatting, whole units for prices. */
export function formatMoney(amount: number, currency: string, opts: { approx?: boolean } = {}): string {
  const code = currency.toUpperCase();
  let text: string;
  try {
    const decimals = amount >= 100 || Number.isInteger(amount) ? 0 : 2;
    text = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: code === "USD" ? "symbol" : "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
    if (code === "USD") text = text.replace(/^\$/, "US$");
    // Dirham/riyal/dinar narrow symbols are unfamiliar; show the code instead.
    if (["AED", "SAR", "QAR", "KWD", "BHD", "OMR", "JOD", "EGP", "MAD"].includes(code)) {
      text = `${code} ${new Intl.NumberFormat("en", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(amount)}`;
    }
  } catch {
    text = `${code} ${Math.round(amount).toLocaleString("en")}`;
  }
  return opts.approx ? `≈ ${text}` : text;
}

/** Rounds an approximate conversion so it doesn't imply false precision. */
export function roundApprox(amount: number): number {
  if (amount >= 10000) return Math.round(amount / 100) * 100;
  if (amount >= 1000) return Math.round(amount / 10) * 10;
  if (amount >= 100) return Math.round(amount);
  return Math.round(amount * 10) / 10;
}
