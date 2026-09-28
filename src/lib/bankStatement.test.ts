import { describe, it, expect } from "vitest";
import { parseBankStatement, splitNewLines, rankCandidates, StatementParseError, type MatchCandidate } from "./bankStatement";

describe("parseBankStatement — CSV", () => {
  it("reads a signed Amount column", () => {
    const csv = "Date,Description,Amount,Balance\n15/03/2026,ACME LTD INV-0012,1050.00,5000\n16/03/2026,DEWA bill,-420.50,4579.50\n";
    const r = parseBankStatement(csv);
    expect(r.format).toBe("csv");
    expect(r.lines).toEqual([
      { date: "2026-03-15", description: "ACME LTD INV-0012", amount: 1050 },
      { date: "2026-03-16", description: "DEWA bill", amount: -420.5 },
    ]);
  });

  it("combines separate Debit / Credit columns into one signed amount", () => {
    const csv = "Posting Date;Narrative;Debit;Credit\n2026-03-01;Salary;;12.000,00\n2026-03-02;Rent;4.500,00;\n";
    const r = parseBankStatement(csv);
    expect(r.lines.map((l) => l.amount)).toEqual([12000, -4500]);
  });

  it("finds the header below bank account preamble and ignores footer lines", () => {
    const csv = [
      "Account,Current Account",
      "IBAN,AE07 0331 2345 6789 0123 456",
      "",
      "Transaction Date,Details,Money Out,Money In",
      "01 Mar 2026,Coffee,12.50,",
      "01 Mar 2026,Coffee,12.50,",
      ",Closing balance,,999.00",
    ].join("\n");
    const r = parseBankStatement(csv);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toEqual({ date: "2026-03-01", description: "Coffee", amount: -12.5 });
    expect(r.skipped).toEqual([]);
  });

  it("respects month-first dates when asked, and reports unreadable rows", () => {
    const csv = "Date,Description,Amount\n03/04/2026,A,10\nnot-a-date,B,5\n03/05/2026,C,abc\n03/06/2026,D,0\n";
    const r = parseBankStatement(csv, { dayFirst: false });
    expect(r.lines).toEqual([{ date: "2026-03-04", description: "A", amount: 10 }]);
    expect(r.skipped).toEqual([
      { row: 3, reason: "date not recognised" },
      { row: 4, reason: "amount not recognised" },
      { row: 5, reason: "zero amount" },
    ]);
  });

  it("refuses a file without a recognisable header", () => {
    expect(() => parseBankStatement("foo,bar\n1,2\n")).toThrow(StatementParseError);
    expect(() => parseBankStatement("   ")).toThrow("The file is empty.");
  });
});

describe("parseBankStatement — OFX", () => {
  it("reads SGML-style OFX 1.x transactions", () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260310120000[+4:GST]
<TRNAMT>-99.90
<FITID>0001
<NAME>ETISALAT
<MEMO>Monthly plan
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260311
<TRNAMT>2500.00
<FITID>0002
<NAME>Client A &amp; Co
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseBankStatement(ofx, { fileName: "march.ofx" });
    expect(r.format).toBe("ofx");
    expect(r.lines).toEqual([
      { date: "2026-03-10", description: "ETISALAT Monthly plan", amount: -99.9 },
      { date: "2026-03-11", description: "Client A & Co", amount: 2500 },
    ]);
  });
});

describe("splitNewLines", () => {
  it("imports each identical line only as many times as it isn't already there", () => {
    const coffee = { date: "2026-03-01", description: "Coffee", amount: -12.5 };
    const rent = { date: "2026-03-02", description: "Rent", amount: -4500 };
    const { fresh, duplicates } = splitNewLines([coffee, coffee, rent], [{ ...coffee, description: "  COFFEE " }]);
    expect(fresh).toEqual([coffee, rent]);
    expect(duplicates).toEqual([coffee]);
  });

  it("makes re-importing the same statement a no-op", () => {
    const lines = [{ date: "2026-03-01", description: "A", amount: 1 }, { date: "2026-03-01", description: "A", amount: 1 }];
    expect(splitNewLines(lines, lines).fresh).toEqual([]);
  });
});

describe("rankCandidates", () => {
  const line = { date: "2026-03-15", description: "ACME LTD payment", amount: 1050 };
  const c = (entryNumber: string, date: string, bankAmount: number, memo: string | null = null): MatchCandidate => ({ journalEntryId: entryNumber, entryNumber, date, memo, bankAmount });

  it("only offers exact-amount entries within the date window", () => {
    const r = rankCandidates(line, [c("JE-1", "2026-03-15", 1049.99), c("JE-2", "2026-04-15", 1050), c("JE-3", "2026-03-20", 1050)]);
    expect(r.map((x) => x.entryNumber)).toEqual(["JE-3"]);
  });

  it("prefers a description match over a slightly closer date", () => {
    const r = rankCandidates(line, [c("JE-1", "2026-03-15", 1050, "Office chairs"), c("JE-2", "2026-03-17", 1050, "Payment from Acme")]);
    expect(r[0]!.entryNumber).toBe("JE-2");
    expect(r[0]!.sharedWords).toBe(2);
  });
});
