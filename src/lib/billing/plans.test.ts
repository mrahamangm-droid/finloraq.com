import { describe, it, expect } from "vitest";
import { PLANS, PLAN_ORDER, planDefinition, isCustomPricedPlan } from "./plans";
import { BILLING_CURRENCIES, REFERENCE_USD_RATES } from "./currency";

describe("plan catalog", () => {
  it("every plan in PLAN_ORDER has a definition", () => {
    for (const plan of PLAN_ORDER) {
      expect(PLANS[plan]).toBeDefined();
      expect(PLANS[plan].plan).toBe(plan);
    }
  });

  it("seats and AI usage limits are non-decreasing as plans go up", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const prev = planDefinition(PLAN_ORDER[i - 1]!);
      const curr = planDefinition(PLAN_ORDER[i]!);
      expect(curr.seats).toBeGreaterThanOrEqual(prev.seats);
      // null = unlimited, which is always >= any finite limit
      if (prev.aiUsageLimitPerMonth !== null && curr.aiUsageLimitPerMonth !== null) {
        expect(curr.aiUsageLimitPerMonth).toBeGreaterThanOrEqual(prev.aiUsageLimitPerMonth);
      }
    }
  });

  it("a feature once unlocked never disappears on a higher plan", () => {
    const features = ["voiceCommands", "documentExtraction", "eInvoicing", "multiCompany", "apiAccess"] as const;
    for (const feature of features) {
      let seenTrue = false;
      for (const plan of PLAN_ORDER) {
        const on = planDefinition(plan).features[feature];
        if (seenTrue) expect(on).toBe(true);
        if (on) seenTrue = true;
      }
    }
  });

  it("Starter is free and Enterprise is custom-priced", () => {
    expect(planDefinition("STARTER").monthlyPriceUsd).toBe(0);
    expect(isCustomPricedPlan("ENTERPRISE")).toBe(true);
    expect(isCustomPricedPlan("GROWTH")).toBe(false);
  });

  it("only Enterprise has an unlimited AI usage cap", () => {
    for (const plan of PLAN_ORDER) {
      const def = planDefinition(plan);
      if (def.aiUsageLimitPerMonth === null) {
        expect(plan).toBe("ENTERPRISE");
      }
    }
  });

  it("every fixed price tracks its US$ price at the reference rate (within 6%), and usd === monthlyPriceUsd", () => {
    for (const plan of PLAN_ORDER) {
      const def = planDefinition(plan);
      expect(def.prices.usd).toBe(def.monthlyPriceUsd);
      for (const cur of BILLING_CURRENCIES) {
        if (def.monthlyPriceUsd === 0) {
          expect(def.prices[cur]).toBe(0);
          continue;
        }
        const implied = def.monthlyPriceUsd * REFERENCE_USD_RATES[cur];
        expect(Math.abs(def.prices[cur] - implied) / implied).toBeLessThan(0.06);
        expect(Number.isInteger(def.prices[cur])).toBe(true);
      }
    }
  });

  it("prices never go down as plans go up, in any currency", () => {
    const paid = PLAN_ORDER.filter((p) => planDefinition(p).monthlyPriceUsd > 0);
    for (const cur of BILLING_CURRENCIES) {
      for (let i = 1; i < paid.length; i++) {
        expect(planDefinition(paid[i]!).prices[cur]).toBeGreaterThan(planDefinition(paid[i - 1]!).prices[cur]);
      }
    }
  });
});
