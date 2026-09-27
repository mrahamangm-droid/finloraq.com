import { describe, expect, it } from "vitest";
import { currencyExponent, fromMinorUnits, toMinorUnits } from "./core";

describe("minor units", () => {
  it("knows currency precision", () => {
    expect(currencyExponent("AED")).toBe(2);
    expect(currencyExponent("jpy")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });
  it("converts without float drift", () => {
    expect(toMinorUnits("1250.50", "AED")).toBe(125050);
    expect(toMinorUnits("0.29", "usd")).toBe(29);
    expect(toMinorUnits(19.99, "EUR")).toBe(1999);
    expect(toMinorUnits("10.005", "AED")).toBe(1001);
    expect(toMinorUnits("1200", "JPY")).toBe(1200);
    expect(toMinorUnits("12.345", "KWD")).toBe(12350);
    expect(() => toMinorUnits("abc", "AED")).toThrow();
  });
  it("formats minor units back to decimals", () => {
    expect(fromMinorUnits(125050, "AED")).toBe("1250.50");
    expect(fromMinorUnits(5, "USD")).toBe("0.05");
    expect(fromMinorUnits(1200, "JPY")).toBe("1200");
    expect(fromMinorUnits(12350, "KWD")).toBe("12.350");
  });
});
