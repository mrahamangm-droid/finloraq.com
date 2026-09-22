import { describe, it, expect } from "vitest";
import { PLANS, PLAN_ORDER, planDefinition, isCustomPricedPlan } from "./plans";

describe("plan catalog", () => {
  it("every plan in PLAN_ORDER has a definition", () => {
    for (const plan of PLAN_ORDER) {
      expect(PLANS[plan]).toBeDefined();
      expect(PLANS[plan].plan).toBe(plan);
    }
  });

  it("seats and AI usage limits are non-decreasing as plans go up", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const prev = planDefinition(PLAN_ORDER[i - 1]);
      const curr = planDefinition(PLAN_ORDER[i]);
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
});
