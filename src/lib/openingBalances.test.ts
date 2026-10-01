import { describe, expect, it } from "vitest";
import { InvalidLineError, UnbalancedEntryError } from "@/lib/ledger";
import { defaultOpeningDate, isOpeningBalanceSourceId, openingBalanceSourceId, prepareOpeningBalanceLines } from "@/lib/openingBalances";

describe("prepareOpeningBalanceLines", () => {
  it("accepts a balanced trial balance and drops blank rows", () => {
    const lines = prepareOpeningBalanceLines([
      { accountCode: "1000", debit: "25000.50" },
      { accountCode: "1100", debit: 4000 },
      { accountCode: "", debit: "", credit: "" },
      { accountCode: "2000", credit: "3000.50" },
      { accountCode: "3000", credit: "26000" },
    ]);
    expect(lines.map((l) => l.accountCode)).toEqual(["1000", "1100", "2000", "3000"]);
    expect(String(lines[0]!.debit)).toBe("25000.5");
    expect(lines[0]!.credit).toBeUndefined();
    expect(lines[0]!.description).toBe("Opening balance");
  });

  it("refuses an unbalanced set — even by one cent", () => {
    expect(() =>
      prepareOpeningBalanceLines([{ accountCode: "1000", debit: "100.00" }, { accountCode: "3000", credit: "99.99" }])
    ).toThrow(UnbalancedEntryError);
  });

  it("is exact with decimals that don't add up in floating point", () => {
    // 0.1 + 0.2 !== 0.3 in floats; the ledger uses Decimal throughout.
    expect(() =>
      prepareOpeningBalanceLines([
        { accountCode: "1000", debit: "0.10" },
        { accountCode: "1100", debit: "0.20" },
        { accountCode: "3000", credit: "0.30" },
      ])
    ).not.toThrow();
  });

  it("rejects duplicate accounts, both-sided rows, bad amounts and an empty wizard", () => {
    expect(() => prepareOpeningBalanceLines([{ accountCode: "1000", debit: 5 }, { accountCode: "1000", credit: 5 }])).toThrow(/twice/);
    expect(() => prepareOpeningBalanceLines([{ accountCode: "1000", debit: 5, credit: 5 }, { accountCode: "3000", credit: 0 }])).toThrow(InvalidLineError);
    expect(() => prepareOpeningBalanceLines([{ accountCode: "1000", debit: "-5" }, { accountCode: "3000", credit: "5" }])).toThrow(/valid amount/);
    expect(() => prepareOpeningBalanceLines([{ accountCode: "1000", debit: "5.001" }, { accountCode: "3000", credit: "5.001" }])).toThrow(/valid amount/);
    expect(() => prepareOpeningBalanceLines([{ accountCode: "", debit: "5" }])).toThrow(/needs an account/);
    expect(() => prepareOpeningBalanceLines([{ accountCode: "", debit: "" }])).toThrow(/at least one/);
  });
});

describe("opening balance source ids", () => {
  it("numbers replacements after a reversal and recognizes only its own ids", () => {
    expect(openingBalanceSourceId(1)).toBe("opening-balance");
    expect(openingBalanceSourceId(3)).toBe("opening-balance:3");
    expect(isOpeningBalanceSourceId("opening-balance:2")).toBe(true);
    expect(isOpeningBalanceSourceId("opening-balances-import")).toBe(false);
    expect(isOpeningBalanceSourceId(null)).toBe(false);
  });
});

describe("defaultOpeningDate", () => {
  it("uses the end of the last completed fiscal year", () => {
    const today = new Date(Date.UTC(2026, 9, 1)); // 1 Oct 2026
    expect(defaultOpeningDate(12, today).toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(defaultOpeningDate(3, today).toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(defaultOpeningDate(9, today).toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(defaultOpeningDate(10, today).toISOString().slice(0, 10)).toBe("2025-10-31");
    expect(defaultOpeningDate(2, new Date(Date.UTC(2025, 0, 15))).toISOString().slice(0, 10)).toBe("2024-02-29");
  });
});
