import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, makeFormatter } from "./format";
import { WIDGETS, defaultLayout, normalizeLayout, normalizeRange, rangeStart } from "./widgets";
import { applyNavConfig, normalizeNavConfig } from "./nav";
import { CustomFieldError, fieldKey, parseCustomFieldValues } from "./customFields";
import { brandStyle, hexToHslVar, normalizeHex, readableOn } from "./color";

describe("format", () => {
  it("groups amounts in every supported style", () => {
    expect(formatAmount(1234567.891, "1,234.56")).toBe("1,234,567.89");
    expect(formatAmount("1234567.5", "1.234,56")).toBe("1.234.567,50");
    expect(formatAmount(1234567.5, "1 234,56")).toBe("1 234 567,50");
    expect(formatAmount(1234567.89, "12,34,567.89")).toBe("12,34,567.89");
    expect(formatAmount(-42, "1,234.56")).toBe("-42.00");
    expect(formatAmount(-0.001, "1,234.56")).toBe("0.00");
    expect(formatAmount({ toFixed: () => "9876543.21" })).toBe("9,876,543.21");
  });
  it("formats dates in UTC", () => {
    const d = new Date("2026-09-04T23:30:00Z");
    expect(formatDate(d, "YYYY-MM-DD")).toBe("2026-09-04");
    expect(formatDate(d, "DD/MM/YYYY")).toBe("04/09/2026");
    expect(formatDate(d, "MM/DD/YYYY")).toBe("09/04/2026");
    expect(formatDate(d, "DD MMM YYYY")).toBe("04 Sep 2026");
    expect(formatDate(null)).toBe("—");
  });
  it("falls back to defaults for unknown preferences", () => {
    const f = makeFormatter("bogus", "bogus");
    expect(f.money(1000)).toBe("1,000.00");
    expect(f.date(new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-02");
  });
});

describe("dashboard layout", () => {
  it("defaults include every widget", () => {
    expect(defaultLayout().map((w) => w.id)).toEqual(WIDGETS.map((w) => w.id));
  });
  it("keeps saved order, drops junk, appends new widgets", () => {
    const l = normalizeLayout([{ id: "payables", visible: false }, { id: "cash" }, { id: "nope" }, { id: "cash", visible: false }, 5]);
    expect(l[0]).toEqual({ id: "payables", visible: false });
    expect(l[1]).toEqual({ id: "cash", visible: true });
    expect(l.length).toBe(WIDGETS.length);
    expect(new Set(l.map((w) => w.id)).size).toBe(WIDGETS.length);
    expect(normalizeLayout("garbage")).toEqual(defaultLayout());
  });
  it("computes period starts", () => {
    const now = new Date("2026-08-15T10:00:00Z");
    expect(rangeStart("mtd", now).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(rangeStart("qtd", now).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(rangeStart("ytd", now).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(normalizeRange("zzz")).toBe("mtd");
  });
});

describe("navigation config", () => {
  const known = ["/dashboard", "/sales", "/purchases", "/settings"];
  it("orders, hides, and never hides locked items", () => {
    const c = normalizeNavConfig({ order: ["/sales", "/evil", "/sales"], hidden: ["/purchases", "/settings", "/dashboard"] }, known);
    expect(c.order).toEqual(["/sales", "/dashboard", "/purchases", "/settings"]);
    expect(c.hidden).toEqual(["/purchases"]);
    const items = known.map((href) => ({ href }));
    expect(applyNavConfig(items, c).map((i) => i.href)).toEqual(["/sales", "/dashboard", "/settings"]);
    expect(normalizeNavConfig(null, known)).toEqual({ order: known, hidden: [] });
  });
});

describe("custom fields", () => {
  const defs = [
    { key: "po_number", label: "PO number", type: "TEXT" as const, options: [], required: true },
    { key: "credit_limit", label: "Credit limit", type: "NUMBER" as const, options: [], required: false },
    { key: "tier", label: "Tier", type: "SELECT" as const, options: ["Gold", "Silver"], required: false },
    { key: "vip", label: "VIP", type: "CHECKBOX" as const, options: [], required: false },
    { key: "since", label: "Customer since", type: "DATE" as const, options: [], required: false },
  ];
  it("makes keys", () => {
    expect(fieldKey("PO number")).toBe("po_number");
    expect(fieldKey("  Crédit-limit (AED) ")).toBe("credit_limit_aed");
    expect(fieldKey("123")).toBe("field_123");
  });
  it("parses and types values", () => {
    expect(parseCustomFieldValues(defs, { po_number: " PO-9 ", credit_limit: "12,500", tier: "Gold", vip: "on", since: "2025-02-01", junk: "x" }))
      .toEqual({ po_number: "PO-9", credit_limit: 12500, tier: "Gold", vip: true, since: "2025-02-01" });
    expect(parseCustomFieldValues(defs, { po_number: "A" })).toEqual({ po_number: "A", vip: false });
  });
  it("rejects bad input", () => {
    expect(() => parseCustomFieldValues(defs, {})).toThrow(CustomFieldError);
    expect(() => parseCustomFieldValues(defs, { po_number: "A", credit_limit: "lots" })).toThrow(CustomFieldError);
    expect(() => parseCustomFieldValues(defs, { po_number: "A", tier: "Bronze" })).toThrow(CustomFieldError);
    expect(() => parseCustomFieldValues(defs, { po_number: "A", since: "31/12/2025" })).toThrow(CustomFieldError);
  });
});

describe("brand colour", () => {
  it("normalizes and converts", () => {
    expect(normalizeHex("4F46E5")).toBe("#4f46e5");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("red")).toBeNull();
    expect(hexToHslVar("#4f46e5")).toBe("243 75% 59%");
    expect(hexToHslVar("#ffffff")).toBe("0 0% 100%");
  });
  it("picks readable text", () => {
    expect(readableOn("#4f46e5")).toBe("light");
    expect(readableOn("#facc15")).toBe("dark");
    expect(brandStyle("nope")).toBeUndefined();
    expect(brandStyle("#0f9e8e")?.["--primary"]).toBe(hexToHslVar("#0f9e8e"));
  });
});
