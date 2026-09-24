import { describe, it, expect } from "vitest";
import { normalizeName, normalizePhone, scoreNameMatch } from "./matching";

describe("normalizeName", () => {
  it("lowercases and collapses punctuation to spaces", () => {
    expect(normalizeName("Acme, Inc.")).toBe("acme inc");
  });

  it("strips accents", () => {
    expect(normalizeName("Café Müller")).toBe("cafe muller");
  });

  it("trims and collapses repeated separators", () => {
    expect(normalizeName("  Al -- Fahim   Trading  ")).toBe("al fahim trading");
  });
});

describe("normalizePhone", () => {
  it("keeps only digits", () => {
    expect(normalizePhone("+971 (4) 555-0100")).toBe("97145550100");
  });
});

describe("scoreNameMatch", () => {
  it("scores an exact match (case/punctuation-insensitive) as 1", () => {
    expect(scoreNameMatch("Acme, Inc.", "ACME INC")).toBe(1);
  });

  it("scores a substring containment highly", () => {
    expect(scoreNameMatch("Acme", "Acme Trading LLC")).toBe(0.85);
  });

  it("scores partial token overlap between 0 and 1", () => {
    const score = scoreNameMatch("Al Fahim Trading", "Al Fahim Logistics");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("scores completely unrelated names as 0", () => {
    expect(scoreNameMatch("Northwind Retail", "Umbrella Corp")).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(scoreNameMatch("", "Acme")).toBe(0);
    expect(scoreNameMatch("Acme", "")).toBe(0);
  });
});
