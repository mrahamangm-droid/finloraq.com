import { describe, expect, it } from "vitest";
import { COMPANY_LINE, FEATURES, FLOW_STAGES, TRUST_ITEMS } from "./home-content";
import { DEMO, projectedCash90 } from "./demo-data";
import { MARKETING_ROUTES } from "../marketing-routes";

describe("homepage content", () => {
  it("shows the four how-it-works stages in order with the agreed items", () => {
    expect(FLOW_STAGES.map((s) => [s.title, s.items])).toEqual([
      ["Upload anything", ["PDF", "Photo", "Invoice", "Receipt", "Excel", "CSV", "Email"]],
      ["Finloraq AI", ["Read", "Understand", "Verify", "Classify"]],
      ["Finance", ["Accounting", "Sales", "Purchases", "Expenses", "Banking", "Taxes"]],
      ["Intelligence", ["Business Pulse", "Forecast", "What-If", "Actions"]],
    ]);
  });

  it("keeps the feature grid to the six agreed cards", () => {
    expect(FEATURES.map((f) => f.title)).toEqual([
      "AI Accounting",
      "Business Pulse",
      "Document Intelligence",
      "Finance Automation",
      "Forecast & What-If",
      "Customer Concierge",
    ]);
  });

  it("labels features that aren't live yet instead of presenting them as shipped", () => {
    // Customer Concierge has no implementation behind it yet (see README gaps).
    expect(FEATURES.find((f) => f.id === "customer-concierge")?.status).toBe("soon");
  });

  it("has the six trust items and the exact company line", () => {
    expect(TRUST_ITEMS.map((t) => t.title)).toEqual([
      "Double-entry",
      "Audit trail",
      "Security",
      "Permissions",
      "Multi-company",
      "Multi-currency",
    ]);
    expect(COMPANY_LINE).toBe("PAPPLE WORLD FZE LLC | RAK, UAE | support@finloraq.com");
  });

  it("lists /pricing as a public marketing route", () => {
    expect(MARKETING_ROUTES.some((r) => r.path === "/pricing")).toBe(true);
  });
});

describe("demo preview numbers", () => {
  it("What-If with no changes matches the 90-day forecast", () => {
    expect(projectedCash90(0, 0)).toBe(DEMO.forecast[2].cash);
  });

  it("slower sales and later payments both reduce projected cash", () => {
    expect(projectedCash90(-20, 0)).toBeLessThan(projectedCash90(0, 0));
    expect(projectedCash90(0, 15)).toBeLessThan(projectedCash90(0, 0));
    expect(projectedCash90(10, 0)).toBeGreaterThan(projectedCash90(0, 0));
  });

  it("keeps the dashboard figures consistent with each other", () => {
    const cashKpi = DEMO.kpis.find((k) => k.label === "Cash")!;
    expect(cashKpi.value).toBe(DEMO.cashToday);
    const overdue = DEMO.invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
    expect(DEMO.kpis.find((k) => k.label === "Receivables")!.delta).toContain(overdue.toLocaleString("en-US"));
    const lowest = Math.min(...DEMO.forecast.map((f) => f.cash));
    expect(DEMO.todos.some((t) => t.text.includes(lowest.toLocaleString("en-US")))).toBe(true);
  });
});
