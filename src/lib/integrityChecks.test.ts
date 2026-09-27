import { describe, it, expect } from "vitest";
import { findUnbalancedEntries, findDuplicateSourcePostings, findOrphanedReversals, findNegativeLines } from "./integrityChecks";

describe("findUnbalancedEntries", () => {
  it("passes a balanced entry", () => {
    const issues = findUnbalancedEntries([
      { id: "e1", entryNumber: "JE-0001", lines: [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }] },
    ]);
    expect(issues).toEqual([]);
  });

  it("flags an entry whose debits and credits don't match", () => {
    const issues = findUnbalancedEntries([
      { id: "e1", entryNumber: "JE-0001", lines: [{ debit: 100, credit: 0 }, { debit: 0, credit: 90 }] },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entryId: "e1", entryNumber: "JE-0001", totalDebit: "100.00", totalCredit: "90.00", difference: "10.00" });
  });

  it("sums across more than two lines per entry", () => {
    const issues = findUnbalancedEntries([
      { id: "e1", entryNumber: "JE-0001", lines: [{ debit: 60, credit: 0 }, { debit: 40, credit: 0 }, { debit: 0, credit: 100 }] },
    ]);
    expect(issues).toEqual([]);
  });

  it("only reports the entries that are actually unbalanced", () => {
    const issues = findUnbalancedEntries([
      { id: "e1", entryNumber: "JE-0001", lines: [{ debit: 100, credit: 100 }] },
      { id: "e2", entryNumber: "JE-0002", lines: [{ debit: 50, credit: 40 }] },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.entryId).toBe("e2");
  });
});

describe("findDuplicateSourcePostings", () => {
  it("passes when every source posted exactly once", () => {
    const issues = findDuplicateSourcePostings([
      { id: "e1", entryNumber: "JE-0001", sourceType: "INVOICE", sourceId: "inv1" },
      { id: "e2", entryNumber: "JE-0002", sourceType: "BILL", sourceId: "bill1" },
    ]);
    expect(issues).toEqual([]);
  });

  it("flags two entries posted for the same source (the race-condition case)", () => {
    const issues = findDuplicateSourcePostings([
      { id: "e1", entryNumber: "JE-0001", sourceType: "INVOICE", sourceId: "inv1" },
      { id: "e2", entryNumber: "JE-0002", sourceType: "INVOICE", sourceId: "inv1" },
    ]);
    expect(issues).toEqual([{ source: "INVOICE:inv1", count: 2, entryNumbers: "JE-0001, JE-0002" }]);
  });

  it("never confuses the same sourceId under different sourceTypes", () => {
    const issues = findDuplicateSourcePostings([
      { id: "e1", entryNumber: "JE-0001", sourceType: "INVOICE", sourceId: "x1" },
      { id: "e2", entryNumber: "JE-0002", sourceType: "BILL", sourceId: "x1" },
    ]);
    expect(issues).toEqual([]);
  });

  it("ignores entries with no sourceId (manual journal entries)", () => {
    const issues = findDuplicateSourcePostings([
      { id: "e1", entryNumber: "JE-0001", sourceType: "MANUAL", sourceId: null },
      { id: "e2", entryNumber: "JE-0002", sourceType: "MANUAL", sourceId: null },
    ]);
    expect(issues).toEqual([]);
  });
});

describe("findOrphanedReversals", () => {
  it("passes a reversal that correctly references an existing entry", () => {
    const issues = findOrphanedReversals(
      [{ id: "e2", entryNumber: "JE-0002", sourceType: "REVERSAL", reversalOfId: "e1" }],
      new Set(["e1", "e2"]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a reversal with no reversalOfId", () => {
    const issues = findOrphanedReversals(
      [{ id: "e2", entryNumber: "JE-0002", sourceType: "REVERSAL", reversalOfId: null }],
      new Set(["e2"]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.problem).toContain("no reversalOfId");
  });

  it("flags a reversal pointing at an entry that doesn't exist", () => {
    const issues = findOrphanedReversals(
      [{ id: "e2", entryNumber: "JE-0002", sourceType: "REVERSAL", reversalOfId: "ghost" }],
      new Set(["e2"]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.problem).toContain("ghost");
  });

  it("ignores non-reversal entries entirely", () => {
    const issues = findOrphanedReversals(
      [{ id: "e1", entryNumber: "JE-0001", sourceType: "MANUAL", reversalOfId: null }],
      new Set(["e1"]),
    );
    expect(issues).toEqual([]);
  });
});

describe("findNegativeLines", () => {
  it("passes ordinary non-negative debit/credit lines", () => {
    const issues = findNegativeLines([{ id: "l1", debit: 100, credit: 0 }]);
    expect(issues).toEqual([]);
  });

  it("flags a negative debit", () => {
    const issues = findNegativeLines([{ id: "l1", debit: -5, credit: 0 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ lineId: "l1", debit: "-5.00" });
  });

  it("flags a negative credit", () => {
    const issues = findNegativeLines([{ id: "l1", debit: 0, credit: -5 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ lineId: "l1", credit: "-5.00" });
  });

  it("treats a zero-value line as fine", () => {
    const issues = findNegativeLines([{ id: "l1", debit: 0, credit: 0 }]);
    expect(issues).toEqual([]);
  });
});
