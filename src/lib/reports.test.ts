import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { agingBucket, ledgerPeriodRange, buildLedger } from "./reports";

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

describe("ledgerPeriodRange", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  it("defaults monthly to the current month", () => {
    const r = ledgerPeriodRange(undefined, undefined, now);
    expect(r.value).toBe("2026-09");
    expect(r.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-30T23:59:59.999Z");
    expect(r.prev).toBe("2026-08");
    expect(r.next).toBe("2026-10");
  });
  it("wraps months across years", () => {
    expect(ledgerPeriodRange("monthly", "2026-01", now).prev).toBe("2025-12");
    expect(ledgerPeriodRange("monthly", "2026-12", now).next).toBe("2027-01");
  });
  it("yearly covers the whole year", () => {
    const r = ledgerPeriodRange("yearly", "2025", now);
    expect(r.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
  it("falls back on malformed input", () => {
    expect(ledgerPeriodRange("monthly", "2026-13", now).value).toBe("2026-09");
    expect(ledgerPeriodRange("yearly", "abc", now).value).toBe("2026");
  });
});

describe("buildLedger", () => {
  const accounts = [
    { id: "a", code: "1000", name: "Bank", type: "ASSET" },
    { id: "r", code: "4000", name: "Sales", type: "REVENUE" },
    { id: "z", code: "5000", name: "Idle", type: "EXPENSE" },
  ];
  const line = (accountId: string, date: string, n: string, debit: number, credit: number) => ({
    accountId, date: new Date(date), entryNumber: n, memo: null, description: null, debit, credit,
  });
  const { from, to } = ledgerPeriodRange("yearly", "2026");
  const sections = buildLedger(
    accounts,
    new Map([["a", { debit: new Decimal(100), credit: new Decimal(0) }]]),
    [
      line("a", "2026-02-10", "JE-2", 0, 30),
      line("a", "2026-01-05", "JE-1", 50, 0),
      line("r", "2026-01-05", "JE-1", 0, 50),
    ],
    from,
    to
  );

  it("drops accounts with no balance or activity", () => {
    expect(sections.map((s) => s.accountCode)).toEqual(["1000", "4000"]);
  });
  it("carries opening, running and closing balances in date order", () => {
    const bank = sections[0];
    expect(bank.opening.toNumber()).toBe(100);
    expect(bank.entries.map((e) => e.balance.toNumber())).toEqual([150, 120]);
    expect(bank.closing.toNumber()).toBe(120);
  });
  it("shows credit-natural accounts as positive", () => {
    expect(sections[1].closing.toNumber()).toBe(50);
  });
  it("rolls up all twelve months", () => {
    const bank = sections[0];
    expect(bank.months).toHaveLength(12);
    expect(bank.months[0].closing.toNumber()).toBe(150);
    expect(bank.months[1].credit.toNumber()).toBe(30);
    expect(bank.months[11].closing.toNumber()).toBe(120);
  });
});
