import { describe, it, expect } from "vitest";
import { MAX_IMPORT_ROWS, parseAmount, parseSheetDate, parseTable, parseType, rowKeys, TEMPLATES, type DocRow, type TxnRow } from "./rows";
import { parseCsv } from "../files/csv";

describe("parseSheetDate", () => {
  it("reads ISO, slashed and named-month dates", () => {
    expect(parseSheetDate("2023-03-14")).toEqual({ date: "2023-03-14", periodTotal: false });
    expect(parseSheetDate("14/03/2023")?.date).toBe("2023-03-14");
    expect(parseSheetDate("03/04/2023", true)?.date).toBe("2023-04-03");
    expect(parseSheetDate("03/04/2023", false)?.date).toBe("2023-03-04");
    expect(parseSheetDate("13/02/2023", false)?.date).toBe("2023-02-13"); // impossible month settles it
    expect(parseSheetDate("14 Mar 2023")?.date).toBe("2023-03-14");
    expect(parseSheetDate("March 14, 2023")?.date).toBe("2023-03-14");
    expect(parseSheetDate("44999")?.date).toBe("2023-03-14"); // Excel serial
  });

  it("treats a bare year / month / quarter / week as a period total on its last day", () => {
    expect(parseSheetDate("2022")).toEqual({ date: "2022-12-31", periodTotal: true });
    expect(parseSheetDate("Feb 2024")).toEqual({ date: "2024-02-29", periodTotal: true });
    expect(parseSheetDate("2023-02")).toEqual({ date: "2023-02-28", periodTotal: true });
    expect(parseSheetDate("2023-Q3")?.date).toBe("2023-09-30");
    expect(parseSheetDate("2026-W39")?.date).toBe("2026-09-27");
  });

  it("rejects junk", () => {
    expect(parseSheetDate("31/02/2023")).toBeNull();
    expect(parseSheetDate("soon")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("parseAmount / parseType", () => {
  it("handles currencies, separators and negatives", () => {
    expect(parseAmount("AED 1,234.50")).toBe(1234.5);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("(250)")).toBe(-250);
    expect(parseAmount("99-")).toBe(-99);
    expect(parseAmount("")).toBe(0);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });
  it("maps type words", () => {
    expect(parseType("Income")).toBe("income");
    expect(parseType("Money out")).toBe("expense");
    expect(parseType("maybe")).toBeNull();
  });
});

describe("parseTable", () => {
  it("reads the transactions template, keeping sheet dates", () => {
    const { rows, periodTotals, error } = parseTable("transactions", parseCsv(TEMPLATES.transactions));
    expect(error).toBeUndefined();
    expect(rows.map((r) => r.errors.length)).toEqual([0, 0, 0, 0]);
    const t = rows.map((r) => r.row as TxnRow);
    expect(t.map((r) => [r.date, r.type, r.amount])).toEqual([
      ["2023-01-15", "income", 10500],
      ["2023-01-20", "expense", 6000],
      ["2023-02-28", "expense", 24000],
      ["2022-12-31", "income", 180000],
    ]);
    expect(t[0]!.tax).toBe(500);
    expect(periodTotals).toBe(2); // "2023-02" and "2022" are period totals
  });

  it("supports separate Income / Expense columns and flags bad rows by line", () => {
    const table = [["Title row"], ["Date", "Details", "Money in", "Money out"], ["2021-05-01", "Sale", "300", ""], ["2021-05-02", "Fuel", "", "80"], ["bad", "x", "1", ""], ["2021-05-03", "Both", "5", "5"]];
    const { rows } = parseTable("transactions", table);
    expect(rows.map((r) => r.line)).toEqual([3, 4, 5, 6]);
    expect((rows[0]!.row as TxnRow).type).toBe("income");
    expect((rows[1]!.row as TxnRow).type).toBe("expense");
    expect(rows[2]!.errors.length).toBe(1);
    expect(rows[3]!.errors.length).toBe(1);
  });

  it("reads invoices with paid status and default due date", () => {
    const { rows } = parseTable("invoices", parseCsv(TEMPLATES.invoices));
    const [a, b] = rows.map((r) => r.row as DocRow);
    expect([a!.party, a!.ref, a!.amount, a!.taxRate, a!.paid, a!.paidDate]).toEqual(["Acme Trading LLC", "INV-0105", 8000, 5, 8400, "2023-03-28"]);
    expect([b!.paid, b!.paidDate]).toEqual([0, null]);
  });

  it("bills: Yes means paid in full including tax", () => {
    const { rows } = parseTable("bills", parseCsv(TEMPLATES.bills));
    const bill = rows[0]!.row as DocRow;
    expect([bill.paid, bill.paidDate, bill.category]).toEqual([1260, "2023-03-20", "Office supplies"]);
  });

  it("explains a missing header", () => {
    expect(Boolean(parseTable("transactions", [["foo", "bar"], ["1", "2"]]).error)).toBe(true);
  });

  it("finds the header past title rows, blank spacer rows and an opening-balance line", () => {
    const table = [
      ["MADEEN BUILDING CONTRACTING LLC"],
      ["Opening Balance and FY2023 Ledger"],
      ["Generated on 2026-09-26"],
      [""],
      ["Opening Balance", "", "", "125000.00"],
      [""],
      ["", "", "", ""],
      ["Voucher Date", "Particulars", "Debit", "Credit"],
      ["2023-01-05", "Cash sale", "", "5000"],
      ["2023-01-10", "Office rent", "2000", ""],
    ];
    const { rows, error } = parseTable("transactions", table);
    expect(error).toBeUndefined();
    expect(rows.length).toBe(2);
    expect((rows[0]!.row as TxnRow).type).toBe("income");
    expect((rows[0]!.row as TxnRow).amount).toBe(5000);
    expect((rows[1]!.row as TxnRow).type).toBe("expense");
    expect((rows[1]!.row as TxnRow).amount).toBe(2000);
  });

  it("matches header names with extra words, units or currency codes", () => {
    const { rows, error } = parseTable("transactions", [
      ["Transaction Date", "Category", "Type", "Amount (AED)"],
      ["2023-02-01", "Sales", "Income", "1000"],
    ]);
    expect(error).toBeUndefined();
    expect((rows[0]!.row as TxnRow).amount).toBe(1000);
  });

  it("skips fully blank rows instead of flagging them as errors", () => {
    const { rows, error } = parseTable("transactions", [
      ["Date", "Type", "Category", "Amount"],
      ["2023-05-01", "Income", "", "100"],
      ["", "", "", ""],
      ["2023-05-02", "Expense", "Fuel", "50"],
    ]);
    expect(error).toBeUndefined();
    expect(rows.length).toBe(2);
  });
});

describe("MAX_IMPORT_ROWS", () => {
  it("is 10,000", () => {
    expect(MAX_IMPORT_ROWS).toBe(10000);
  });
});

describe("rowKeys", () => {
  it("is stable and tells identical rows apart", () => {
    const r: TxnRow = { line: 2, date: "2023-01-01", description: "Coffee", amount: 50, type: "expense", category: "Meals", tax: 0 };
    const keys = rowKeys("transactions", [r, { ...r, line: 3 }]);
    expect(keys[0]!.endsWith("#1") && keys[1]!.endsWith("#2")).toBe(true);
    expect(rowKeys("transactions", [{ ...r, line: 99 }])[0]).toBe(keys[0]);
  });
});
