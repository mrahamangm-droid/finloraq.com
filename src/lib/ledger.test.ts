import { describe, it, expect } from "vitest";
import {
  validateBalanced,
  UnbalancedEntryError,
  InvalidLineError,
  buildInvoicePosting,
  buildInvoicePaymentPosting,
  buildBillPosting,
  buildSupplierPaymentPosting,
  buildExpensePosting,
} from "./ledger";

describe("validateBalanced — the core double-entry invariant", () => {
  it("accepts a balanced entry", () => {
    const { debits, credits } = validateBalanced([
      { accountCode: "1100", debit: 1050 },
      { accountCode: "4000", credit: 1000 },
      { accountCode: "2100", credit: 50 },
    ]);
    expect(debits.toFixed(2)).toBe("1050.00");
    expect(credits.toFixed(2)).toBe("1050.00");
  });

  it("rejects an unbalanced entry", () => {
    expect(() =>
      validateBalanced([
        { accountCode: "1100", debit: 1050 },
        { accountCode: "4000", credit: 1000 },
      ])
    ).toThrow(UnbalancedEntryError);
  });

  it("rejects a line with both debit and credit set", () => {
    expect(() =>
      validateBalanced([
        { accountCode: "1100", debit: 100, credit: 100 },
        { accountCode: "4000", credit: 100 },
      ])
    ).toThrow(InvalidLineError);
  });

  it("rejects a line with neither debit nor credit", () => {
    expect(() =>
      validateBalanced([
        { accountCode: "1100", debit: 100 },
        { accountCode: "4000" },
      ])
    ).toThrow(InvalidLineError);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      validateBalanced([
        { accountCode: "1100", debit: -100 },
        { accountCode: "4000", credit: -100 },
      ])
    ).toThrow(InvalidLineError);
  });

  it("rejects fewer than two lines", () => {
    expect(() => validateBalanced([{ accountCode: "1100", debit: 100 }])).toThrow(InvalidLineError);
  });

  it("handles floating-point-hostile amounts exactly (no 0.1 + 0.2 drift)", () => {
    const { debits, credits } = validateBalanced([
      { accountCode: "1100", debit: 0.1 },
      { accountCode: "1100", debit: 0.2 },
      { accountCode: "4000", credit: 0.3 },
    ]);
    expect(debits.equals(credits)).toBe(true);
  });
});

describe("posting builders match the spec's exact examples (section 6)", () => {
  it("Invoice: DR Accounts Receivable, CR Revenue, CR Output Tax", () => {
    const lines = buildInvoicePosting({ subtotal: 1000, taxTotal: 50, total: 1050 });
    validateBalanced(lines); // must itself be balanced
    expect(lines).toEqual([
      { accountCode: "1100", debit: 1050, description: "Accounts Receivable" },
      { accountCode: "4000", credit: 1000, description: "Sales Revenue" },
      { accountCode: "2100", credit: 50, description: "Output Tax Payable" },
    ]);
  });

  it("Invoice with zero tax omits the tax line", () => {
    const lines = buildInvoicePosting({ subtotal: 1000, taxTotal: 0, total: 1000 });
    validateBalanced(lines);
    expect(lines).toHaveLength(2);
  });

  it("Customer payment: DR Bank, CR Accounts Receivable", () => {
    const lines = buildInvoicePaymentPosting({ amount: 1050 });
    validateBalanced(lines);
    expect(lines[0]!.accountCode).toBe("1000");
    expect(lines[1]!.accountCode).toBe("1100");
  });

  it("Supplier bill: DR Expense, DR Input Tax, CR Accounts Payable", () => {
    const lines = buildBillPosting({ subtotal: 500, taxTotal: 25, total: 525 });
    validateBalanced(lines);
    expect(lines).toEqual([
      { accountCode: "5000", debit: 500, description: "Expense" },
      { accountCode: "1200", debit: 25, description: "Input Tax Receivable" },
      { accountCode: "2000", credit: 525, description: "Accounts Payable" },
    ]);
  });

  it("Supplier payment: DR Accounts Payable, CR Bank", () => {
    const lines = buildSupplierPaymentPosting({ amount: 525 });
    validateBalanced(lines);
    expect(lines[0]!.accountCode).toBe("2000");
    expect(lines[1]!.accountCode).toBe("1000");
  });

  it("Direct expense with tax: DR Expense, DR Input Tax, CR Bank", () => {
    const lines = buildExpensePosting({ amount: 200, taxAmount: 10 });
    validateBalanced(lines);
    expect(lines).toEqual([
      { accountCode: "5000", debit: 200, description: "Expense" },
      { accountCode: "1200", debit: 10, description: "Input Tax Receivable" },
      { accountCode: "1000", credit: expect.anything(), description: "Bank" },
    ]);
    // credit leg equals amount + tax
    const bankLine = lines[2]!;
    expect(bankLine.credit && Number(bankLine.credit)).toBeCloseTo(210);
  });

  it("Direct expense with no tax omits the tax line", () => {
    const lines = buildExpensePosting({ amount: 200 });
    validateBalanced(lines);
    expect(lines).toHaveLength(2);
  });
});
