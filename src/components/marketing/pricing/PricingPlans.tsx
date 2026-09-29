"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SubscriptionPlan } from "@/lib/prisma-enums";
import { PLANS } from "@/lib/billing/plans";
import {
  BILLING_CURRENCIES,
  BILLING_CURRENCY_LABELS,
  CURRENCY_COOKIE,
  DISPLAY_CURRENCIES,
  formatMoney,
  isBillingCurrency,
  roundApprox,
} from "@/lib/billing/currency";

// Plan cards with a currency switcher. Billing currencies show the fixed price
// Stripe charges; other currencies show a clearly marked estimate of the US$
// price at today's rate (from /api/public/pricing). The choice is saved in the
// same cookie the in-app Billing page reads, so checkout uses the currency
// picked here. Moved here from the old homepage unchanged in behaviour.

type Card = { plan: SubscriptionPlan; features: string[]; featured?: boolean };

const CARDS: Card[] = [
  { plan: "STARTER", features: ["Double-entry accounting & reports", "Invoices, bills & expenses", "UAE VAT tax codes"] },
  { plan: "GROWTH", features: ["Everything in Starter", "Receipt & invoice reading (AI)", "E-invoicing", "Bank reconciliation"] },
  { plan: "PROFESSIONAL", featured: true, features: ["Everything in Growth", "Cash-flow intelligence", "Projects & cost centres", "Voice commands & API access"] },
  { plan: "AI_CFO", features: ["Everything in Professional", "Multi-company", "Priority support"] },
  { plan: "ENTERPRISE", features: ["Custom users & limits", "Unlimited AI actions", "Dedicated support", "Advanced security review"] },
];

type PricingContext = {
  suggested?: string;
  rates?: Record<string, number>;
  ratesSource?: { name: string; url: string } | null;
};

const readCookie = () =>
  document.cookie.match(new RegExp("(?:^|; )" + CURRENCY_COOKIE + "=([^;]+)"))?.[1]?.toUpperCase() ?? null;

function limits(plan: SubscriptionPlan): string {
  const def = PLANS[plan];
  const ai = def.aiUsageLimitPerMonth === null ? "Unlimited AI actions" : `${def.aiUsageLimitPerMonth.toLocaleString("en")} AI actions/mo`;
  return `${def.seats} users · ${ai}`;
}

export function PricingPlans() {
  const [code, setCode] = useState("AED");
  const [ctx, setCtx] = useState<PricingContext>({});
  const rates = ctx.rates ?? {};
  const billable = isBillingCurrency(code.toLowerCase());

  useEffect(() => {
    const saved = readCookie();
    if (saved && isBillingCurrency(saved.toLowerCase())) setCode(saved);
    let cancelled = false;
    fetch("/api/public/pricing")
      .then((r) => (r.ok ? (r.json() as Promise<PricingContext>) : null))
      .then((c) => {
        if (cancelled || !c) return;
        setCtx(c);
        const pick = saved || c.suggested || "AED";
        setCode(isBillingCurrency(pick.toLowerCase()) || c.rates?.[pick] ? pick : "USD");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (next: string) => {
    document.cookie = `${CURRENCY_COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setCode(next);
  };

  const price = (plan: SubscriptionPlan) => {
    const def = PLANS[plan];
    const lower = code.toLowerCase();
    if (isBillingCurrency(lower)) {
      return { text: formatMoney(def.prices[lower], code), note: `Billed monthly in ${code === "USD" ? "US$" : code}` };
    }
    const rate = rates[code] ?? 0;
    return {
      text: formatMoney(roundApprox(def.monthlyPriceUsd * rate), code, { approx: true }),
      note: `Estimate · billed as US$${def.monthlyPriceUsd}/mo`,
    };
  };

  const estimateCodes = Object.keys(DISPLAY_CURRENCIES).filter((c) => rates[c]);

  return (
    <>
      <div className="cur-bar">
        <label className="cur-pick">
          <span>Show prices in</span>
          <select value={code} onChange={(e) => choose(e.target.value)} aria-label="Currency">
            <optgroup label="Billed in this currency">
              {BILLING_CURRENCIES.map((c) => (
                <option key={c} value={c.toUpperCase()}>
                  {c.toUpperCase()} · {BILLING_CURRENCY_LABELS[c]}
                </option>
              ))}
            </optgroup>
            {estimateCodes.length > 0 && (
              <optgroup label="Estimate only · billed in US$">
                {estimateCodes.map((c) => (
                  <option key={c} value={c}>
                    {c} · {DISPLAY_CURRENCIES[c]}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <p className="cur-note" aria-live="polite">
          {billable ? (
            <>Fixed prices in {code}. You&apos;re charged exactly what you see.</>
          ) : (
            <>
              Estimate at today&apos;s rate. You&apos;re billed in US$, and your bank may convert at its own rate.
              {ctx.ratesSource && (
                <>
                  {" "}Rates by{" "}
                  <a href={ctx.ratesSource.url} target="_blank" rel="noopener noreferrer">
                    {ctx.ratesSource.name}
                  </a>
                  .
                </>
              )}
            </>
          )}
        </p>
      </div>
      <p className="swipe-hint" aria-hidden="true">
        Swipe to compare plans →
      </p>
      <div className="price-grid">
        {CARDS.map((card) => {
          const def = PLANS[card.plan];
          const free = card.plan === "STARTER";
          const custom = card.plan === "ENTERPRISE";
          const p = free || custom ? null : price(card.plan);
          return (
            <div key={card.plan} className={card.featured ? "plan feat" : "plan"}>
              <div className="pname">{def.label}</div>
              <div>
                <div className="pprice num">
                  {free ? "Free" : custom ? "Talk to us" : p!.text}
                  {p && <small>/mo</small>}
                </div>
                <div className="pusd">{free ? "Free forever · no card needed" : custom ? "Custom contract" : p!.note}</div>
              </div>
              <ul>
                {[...card.features, ...(custom ? [] : [limits(card.plan)])].map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {custom ? (
                <a className="btn btn-ghost btn-block" href="mailto:hello@finloraq.com">
                  Contact Sales
                </a>
              ) : (
                <Link className={card.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"} href="/register">
                  Start Free
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
