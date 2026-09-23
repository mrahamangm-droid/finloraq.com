import { NextResponse } from "next/server";
import { DISPLAY_CURRENCIES, currencyForCountry } from "@/lib/billing/currency";

/**
 * Public pricing context for the currency switcher (no login; excluded from
 * the auth gate in src/middleware.ts):
 *  - the visitor's country (Vercel's edge geo header) and the currency we'd
 *    suggest for it,
 *  - daily market rates from USD for the display-only currencies, used to
 *    show "≈" estimates. Billing currencies never use these — they have
 *    fixed prices in plans.ts.
 *
 * Rates come from ExchangeRate-API's open endpoint (free, daily, attribution
 * required — the pricing section links to it), cached server-side for 12h so
 * visitor traffic never hits the provider. If the provider is down, `rates`
 * is empty and the switcher simply hides the estimate currencies.
 */
export const dynamic = "force-dynamic";

const RATES_URL = "https://open.er-api.com/v6/latest/USD";

async function loadRates(): Promise<{ rates: Record<string, number>; date: string | null }> {
  try {
    const res = await fetch(RATES_URL, { next: { revalidate: 43200 } });
    if (!res.ok) return { rates: {}, date: null };
    const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (json.result !== "success" || !json.rates) return { rates: {}, date: null };
    const rates: Record<string, number> = {};
    for (const code of Object.keys(DISPLAY_CURRENCIES)) {
      const r = json.rates[code];
      if (typeof r === "number" && Number.isFinite(r) && r > 0) rates[code] = r;
    }
    return { rates, date: json.time_last_update_utc ?? null };
  } catch {
    return { rates: {}, date: null };
  }
}

export async function GET(req: Request) {
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const { rates, date } = await loadRates();
  return NextResponse.json(
    {
      country,
      suggested: currencyForCountry(country),
      rates,
      ratesDate: date,
      ratesSource: { name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" },
    },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
