import { describe, it, expect } from "vitest";
import { monthsBetween, parseMonth, monthBounds, planLock, latestLocked, monthName, PeriodCloseError } from "./periodClose";

describe("month helpers", () => {
  it("parses YYYY-MM and rejects anything else", () => {
    expect(parseMonth("2026-09")).toEqual({ year: 2026, month: 8 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-9")).toBeNull();
  });

  it("lists months inclusively across a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03", "2026-03")).toEqual(["2026-03"]);
    expect(monthsBetween("2026-04", "2026-03")).toEqual([]);
  });

  it("bounds cover the whole month in UTC", () => {
    const b = monthBounds("2026-02");
    expect(b.startDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(b.endDate.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(monthName(new Date("2026-09-28T12:00:00Z"))).toBe("2026-09");
  });
});

describe("planLock", () => {
  const periods = [
    { name: "2026-01", status: "LOCKED" },
    { name: "2026-02", status: "OPEN" },
    { name: "2026-03", status: "OPEN" },
  ];

  it("locks every not-yet-locked month from the start of the books through the chosen month", () => {
    expect(planLock(periods, "2026-01", "2026-03", "2026-09")).toEqual(["2026-02", "2026-03"]);
  });

  it("includes months with no period row yet, so gaps can't stay open", () => {
    expect(planLock([], "2025-12", "2026-02", "2026-09")).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("refuses a month that hasn't started yet", () => {
    expect(() => planLock(periods, "2026-01", "2026-10", "2026-09")).toThrow(PeriodCloseError);
  });

  it("refuses a malformed month", () => {
    expect(() => planLock(periods, "2026-01", "2026/03", "2026-09")).toThrow(PeriodCloseError);
  });
});

describe("latestLocked", () => {
  it("is the newest locked month, the only one that can be reopened", () => {
    expect(latestLocked([{ name: "2026-02", status: "LOCKED" }, { name: "2026-01", status: "LOCKED" }, { name: "2026-03", status: "OPEN" }])).toBe("2026-02");
    expect(latestLocked([{ name: "2026-03", status: "OPEN" }])).toBeNull();
  });
});
