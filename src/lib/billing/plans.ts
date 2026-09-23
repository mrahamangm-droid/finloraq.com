import type { SubscriptionPlan } from "@prisma/client";
import type { BillingCurrency } from "@/lib/billing/currency";

/**
 * The plan catalog (spec section 20/26): Starter / Growth / Professional /
 * AI-CFO / Enterprise. This is the single source of truth for pricing,
 * seat counts, and feature gates — everything else (the billing page, the
 * usage-limit checks in the AI copilot/extraction, the upgrade flow) reads
 * from here rather than hardcoding a number anywhere else.
 *
 * Each paid plan has a fixed price in each billing currency (USD, AED, SAR,
 * QAR, EUR, GBP, CAD, AUD). All are VAT-inclusive: UAE law requires
 * displayed prices to include VAT, and inclusive pricing stays correct
 * whether or not the seller is VAT-registered (if it is, Stripe Tax carves
 * the 5% out of the same total). See src/lib/integrations/stripe.ts.
 */
export interface PlanDefinition {
  plan: SubscriptionPlan;
  label: string;
  monthlyPriceUsd: number;
  /**
   * Fixed monthly price in every billing currency (whole units, VAT-inclusive).
   * `usd` always equals monthlyPriceUsd. Stripe charges exactly these amounts;
   * see src/lib/billing/currency.ts for how they're shown.
   */
  prices: Record<BillingCurrency, number>;
  seats: number;
  /** AI Copilot questions + document extractions combined, per calendar month. null = unlimited. */
  aiUsageLimitPerMonth: number | null;
  features: {
    voiceCommands: boolean;
    documentExtraction: boolean;
    eInvoicing: boolean;
    multiCompany: boolean;
    apiAccess: boolean;
  };
  description: string;
}

export const PLAN_ORDER: SubscriptionPlan[] = ["STARTER", "GROWTH", "PROFESSIONAL", "AI_CFO", "ENTERPRISE"];

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  STARTER: {
    plan: "STARTER",
    label: "Starter",
    monthlyPriceUsd: 0,
    prices: { usd: 0, aed: 0, sar: 0, qar: 0, eur: 0, gbp: 0, cad: 0, aud: 0 },
    seats: 2,
    aiUsageLimitPerMonth: 20,
    features: { voiceCommands: false, documentExtraction: false, eInvoicing: false, multiCompany: false, apiAccess: false },
    description: "Core accounting, invoicing, and expenses for a solo founder or a very small team getting started.",
  },
  GROWTH: {
    plan: "GROWTH",
    label: "Growth",
    monthlyPriceUsd: 49,
    prices: { usd: 49, aed: 179, sar: 185, qar: 179, eur: 45, gbp: 35, cad: 69, aud: 69 },
    seats: 5,
    aiUsageLimitPerMonth: 200,
    features: { voiceCommands: false, documentExtraction: true, eInvoicing: true, multiCompany: false, apiAccess: false },
    description: "Adds banking reconciliation, tax reports, and e-invoicing for a growing operations team.",
  },
  PROFESSIONAL: {
    plan: "PROFESSIONAL",
    label: "Professional",
    monthlyPriceUsd: 149,
    prices: { usd: 149, aed: 549, sar: 559, qar: 549, eur: 129, gbp: 109, cad: 209, aud: 209 },
    seats: 15,
    aiUsageLimitPerMonth: 1000,
    features: { voiceCommands: true, documentExtraction: true, eInvoicing: true, multiCompany: false, apiAccess: true },
    description: "Full cash-flow intelligence, projects/cost centres, and voice commands for a full finance department.",
  },
  AI_CFO: {
    plan: "AI_CFO",
    label: "AI-CFO",
    monthlyPriceUsd: 299,
    prices: { usd: 299, aed: 1099, sar: 1119, qar: 1099, eur: 259, gbp: 219, cad: 419, aud: 419 },
    seats: 30,
    aiUsageLimitPerMonth: 5000,
    features: { voiceCommands: true, documentExtraction: true, eInvoicing: true, multiCompany: true, apiAccess: true },
    description: "Heavy AI Copilot usage, multi-company consolidation, and priority support for a CFO-led finance org.",
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    label: "Enterprise",
    monthlyPriceUsd: 0, // custom — "Contact us" in the UI
    prices: { usd: 0, aed: 0, sar: 0, qar: 0, eur: 0, gbp: 0, cad: 0, aud: 0 },
    seats: 999,
    aiUsageLimitPerMonth: null,
    features: { voiceCommands: true, documentExtraction: true, eInvoicing: true, multiCompany: true, apiAccess: true },
    description: "Custom seats, unlimited AI usage, dedicated support, and negotiated contract terms.",
  },
};

export function planDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLANS[plan];
}

export function isCustomPricedPlan(plan: SubscriptionPlan): boolean {
  return plan === "ENTERPRISE";
}
