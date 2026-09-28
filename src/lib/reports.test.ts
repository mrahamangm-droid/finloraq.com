import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { agingBucket, ledgerPeriodRange, buildLedger, fiscalYearStart, buildBalanceSheet, type TrialBalanceRow } from "./reports";

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
  const at = <T,>(items: T[], i: number): T => {
    const item = items[i];
    if (item === undefined) throw new Error(`missing item ${i}`);
    return item;
  };
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
    const bank = at(sections, 0);
    expect(bank.opening.toNumber()).toBe(100);
    expect(bank.entries.map((e) => e.balance.toNumber())).toEqual([150, 120]);
    expect(bank.closing.toNumber()).toBe(120);
  });
  it("shows credit-natural accounts as positive", () => {
    expect(at(sections, 1).closing.toNumber()).toBe(50);
  });
  it("rolls up all twelve months", () => {
    const bank = at(sections, 0);
    expect(bank.months).toHaveLength(12);
    expect(at(bank.months, 0).closing.toNumber()).toBe(150);
    expect(at(bank.months, 1).credit.toNumber()).toBe(30);
    expect(at(bank.months, 11).closing.toNumber()).toBe(120);
  });
});

describe("fiscalYearStart", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  it("December year end starts on 1 January of the same year", () => {
    expect(fiscalYearStart(d("2026-09-28"), 12)).toEqual(d("2026-01-01"));
    expect(fiscalYearStart(d("2026-01-01"), 12)).toEqual(d("2026-01-01"));
    expect(fiscalYearStart(d("2026-12-31"), 12)).toEqual(d("2026-01-01"));
  });
  it("March year end starts on 1 April, rolling back a year before April", () => {
    expect(fiscalYearStart(d("2026-09-28"), 3)).toEqual(d("2026-04-01"));
    expect(fiscalYearStart(d("2026-03-31"), 3)).toEqual(d("2025-04-01"));
    expect(fiscalYearStart(d("2026-04-01"), 3)).toEqual(d("2026-04-01"));
  });
  it("June year end starts on 1 July", () => {
    expect(fiscalYearStart(d("2026-02-10"), 6)).toEqual(d("2025-07-01"));
  });
});

describe("buildBalanceSheet", () => {
  const row = (accountCode: string, type: string, debit: number, credit: number): TrialBalanceRow => ({
    accountCode,
    accountName: accountCode,
    type,
    debit: new Decimal(debit),
    credit: new Decimal(credit),
  });
  const asOf = new Date("2026-09-28T00:00:00Z");

  it("balances when the only activity is an unpaid invoice", () => {
    // Dr Receivable 1,050 / Cr Revenue 1,000 / Cr Output VAT 50
    const rows = [row("1100", "ASSET", 1050, 0), row("2100", "LIABILITY", 0, 50), row("4000", "REVENUE", 0, 1000)];
    const bs = buildBalanceSheet(asOf, rows, []);
    expect(bs.currentYearEarnings.toFixed(2)).toBe("1000.00");
    expect(bs.retainedEarnings.toFixed(2)).toBe("0.00");
    expect(bs.totalEquity.toFixed(2)).toBe("1000.00");
    expect(bs.outOfBalance.toFixed(2)).toBe("0.00");
  });

  it("splits prior-year profit into retained earnings and this year's into current year earnings", () => {
    const beforeFy = [row("1000", "ASSET", 500, 0), row("4000", "REVENUE", 0, 800), row("5000", "EXPENSE", 300, 0)];
    const now = [
      row("1000", "ASSET", 800, 0),
      row("3000", "EQUITY", 0, 100),
      row("4000", "REVENUE", 0, 1500),
      row("5000", "EXPENSE", 800, 0),
    ];
    const bs = buildBalanceSheet(asOf, now, beforeFy);
    expect(bs.retainedEarnings.toFixed(2)).toBe("500.00"); // 800 - 300
    expect(bs.currentYearEarnings.toFixed(2)).toBe("200.00"); // (1500 - 800) - 500
    expect(bs.equity.filter((e) => e.computed).map((e) => e.accountName)).toEqual(["Retained earnings", "Current year earnings"]);
    expect(bs.totalEquity.toFixed(2)).toBe("800.00");
    expect(bs.outOfBalance.toFixed(2)).toBe("0.00");
  });

  it("shows a loss as negative earnings", () => {
    const rows = [row("1000", "ASSET", 0, 300), row("5000", "EXPENSE", 300, 0)];
    const bs = buildBalanceSheet(asOf, rows, []);
    expect(bs.currentYearEarnings.toFixed(2)).toBe("-300.00");
    expect(bs.outOfBalance.toFixed(2)).toBe("0.00");
  });

  it("adds no computed lines when the P&L nets to zero", () => {
    const rows = [row("1000", "ASSET", 100, 0), row("3000", "EQUITY", 0, 100)];
    const bs = buildBalanceSheet(asOf, rows, []);
    expect(bs.equity.some((e) => e.computed)).toBe(false);
    expect(bs.outOfBalance.toFixed(2)).toBe("0.00");
  });

  it("still reports a real imbalance", () => {
    const rows = [row("1000", "ASSET", 100, 0)];
    expect(buildBalanceSheet(asOf, rows, []).outOfBalance.toFixed(2)).toBe("100.00");
  });
});
