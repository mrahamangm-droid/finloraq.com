import { describe, it, expect } from "vitest";
import { isoDay, isoWeek, parseIsoDay, periodEndDay, periodFromRange, periodQuery, resolvePeriod } from "./periods";

const now = new Date("2026-09-25T10:00:00Z"); // a Friday

describe("resolvePeriod", () => {
  it("day", () => {
    const p = resolvePeriod({ period: "day", date: "2023-02-28" }, now);
    expect(isoDay(p.from)).toBe("2023-02-28");
    expect(p.to.toISOString()).toBe("2023-02-28T23:59:59.999Z");
    expect(p.prev).toBe("2023-02-27");
    expect(p.next).toBe("2023-03-01");
    expect(p.isCurrent).toBe(false);
  });

  it("week runs Monday to Sunday", () => {
    const p = resolvePeriod({ period: "week", date: "2026-09-25" }, now);
    expect(isoDay(p.from)).toBe("2026-09-21");
    expect(isoDay(p.to)).toBe("2026-09-27");
    expect(p.isCurrent).toBe(true);
    expect(p.prev).toBe("2026-09-14");
  });

  it("month, including leap February", () => {
    const p = resolvePeriod({ period: "month", date: "2024-02-10" }, now);
    expect(isoDay(p.from)).toBe("2024-02-01");
    expect(isoDay(p.to)).toBe("2024-02-29");
    expect(p.label).toBe("February 2024");
    expect(p.next).toBe("2024-03-01");
  });

  it("quarter and year", () => {
    const q = resolvePeriod({ period: "quarter", date: "2022-08-15" }, now);
    expect([isoDay(q.from), isoDay(q.to), q.label]).toEqual(["2022-07-01", "2022-09-30", "Q3 2022"]);
    const y = resolvePeriod({ period: "year", date: "2019-06-01" }, now);
    expect([isoDay(y.from), isoDay(y.to), y.prev]).toEqual(["2019-01-01", "2019-12-31", "2018-01-01"]);
  });

  it("custom range, swapping reversed dates", () => {
    const p = resolvePeriod({ period: "custom", from: "2023-06-30", to: "2023-01-01" }, now);
    expect([isoDay(p.from), isoDay(p.to), p.prev]).toEqual(["2023-01-01", "2023-06-30", null]);
  });

  it("bad input falls back to the current month", () => {
    const p = resolvePeriod({ period: "nonsense", date: "2023-02-30" }, now);
    expect([p.granularity, isoDay(p.from)]).toEqual(["month", "2026-09-01"]);
  });
});

describe("helpers", () => {
  it("ISO weeks across a year boundary", () => {
    expect(isoWeek(new Date("2021-01-03T00:00:00Z"))).toEqual({ year: 2020, week: 53 });
    expect(isoWeek(new Date("2026-09-25T00:00:00Z"))).toEqual({ year: 2026, week: 39 });
  });

  it("parseIsoDay rejects impossible dates", () => {
    expect(parseIsoDay("2023-02-30")).toBeNull();
    expect(parseIsoDay("2024-02-29") ? "ok" : "no").toBe("ok");
  });

  it("periodEndDay for loose sheet dates", () => {
    expect(isoDay(periodEndDay("2023")!)).toBe("2023-12-31");
    expect(isoDay(periodEndDay("2024-2")!)).toBe("2024-02-29");
    expect(isoDay(periodEndDay("2023-Q2")!)).toBe("2023-06-30");
    expect(isoDay(periodEndDay("2026-W39")!)).toBe("2026-09-27");
    expect(periodEndDay("2023-13")).toBeNull();
  });

  it("periodFromRange keeps the saved dashboard defaults", () => {
    const ytd = periodFromRange("ytd", now);
    expect([isoDay(ytd.from), isoDay(ytd.to)]).toEqual(["2026-01-01", "2026-09-25"]);
    const l30 = periodFromRange("last30", now);
    expect([isoDay(l30.from), isoDay(l30.to)]).toEqual(["2026-08-27", "2026-09-25"]);
  });

  it("periodQuery keeps unrelated params", () => {
    expect(periodQuery({ granularity: "year", date: "2023-01-01" }, { account: "5000", period: "month" })).toBe("account=5000&period=year&date=2023-01-01");
  });
});
