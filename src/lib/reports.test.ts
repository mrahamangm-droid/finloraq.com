import { describe, it, expect } from "vitest";
import { agingBucket } from "./reports";

const asOf = new Date("2026-09-22T00:00:00Z");
const daysBefore = (n: number) => new Date(asOf.getTime() - n * 86400000);
const daysAfter = (n: number) => new Date(asOf.getTime() + n * 86400000);

describe("agingBucket", () => {
  it("a future due date is current", () => {
    expect(agingBucket(daysAfter(5), asOf)).toBe("current");
  });
  it("due today is current", () => {
    expect(agingBucket(asOf, asOf)).toBe("current");
  });
  it("1-30 days overdue", () => {
    expect(agingBucket(daysBefore(15), asOf)).toBe("1-30");
    expect(agingBucket(daysBefore(30), asOf)).toBe("1-30");
  });
  it("31-60 days overdue", () => {
    expect(agingBucket(daysBefore(45), asOf)).toBe("31-60");
  });
  it("61-90 days overdue", () => {
    expect(agingBucket(daysBefore(75), asOf)).toBe("61-90");
  });
  it("90+ days overdue", () => {
    expect(agingBucket(daysBefore(120), asOf)).toBe("90+");
  });
});
