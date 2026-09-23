import type { SubscriptionPlan } from "@prisma/client";

/**
 * The plan catalog (spec section 20/26): Starter / Growth / Professional /
 * AI-CFO / Enterprise. This is the single source of truth for pricing,
 * seat counts, and feature gates — everything else (the billing page, the
 * usage-limit checks in the AI copilot/extraction, the upgrade flow) reads
 * from here rather than hardcoding a number anywhere else.
 *
 * Prices are listed in USD/month for simplicity; a real deployment would
 * likely price per-region (AED for the UAE market) via Stripe Prices
 * rather than a literal number in code — that's a follow-up once a real
 * payment provider is wired in (see src/lib/integrations/payment.ts).
 */
export interface PlanDefinition {
  plan: SubscriptionPlan;
  label: string;
  monthlyPriceUsd: number;
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
    seats: 2,
    aiUsageLimitPerMonth: 20,
    features: { voiceCommands: false, documentExtraction: false, eInvoicing: false, multiCompany: false, apiAccess: false },
    description: "Core accounting, invoicing, and expenses for a solo founder or a very small team getting started.",
  },
  GROWTH: {
    plan: "GROWTH",
    label: "Growth",
    monthlyPriceUsd: 49,
    seats: 5,
    aiUsageLimitPerMonth: 200,
    features: { voiceCommands: false, documentExtraction: true, eInvoicing: true, multiCompany: false, apiAccess: false },
    description: "Adds banking reconciliation, tax reports, and e-invoicing for a growing operations team.",
  },
  PROFESSIONAL: {
    plan: "PROFESSIONAL",
    label: "Professional",
    monthlyPriceUsd: 149,
    seats: 15,
    aiUsageLimitPerMonth: 1000,
    features: { voiceCommands: true, documentExtraction: true, eInvoicing: true, multiCompany: false, apiAccess: true },
    description: "Full cash-flow intelligence, projects/cost centres, and voice commands for a full finance department.",
  },
  AI_CFO: {
    plan: "AI_CFO",
    label: "AI-CFO",
    monthlyPriceUsd: 299,
    seats: 30,
    aiUsageLimitPerMonth: 5000,
    features: { voiceCommands: true, documentExtraction: true, eInvoicing: true, multiCompany: true, apiAccess: true },
    description: "Heavy AI Copilot usage, multi-company consolidation, and priority support for a CFO-led finance org.",
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    label: "Enterprise",
    monthlyPriceUsd: 0, // custom — "Contact us" in the UI
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
