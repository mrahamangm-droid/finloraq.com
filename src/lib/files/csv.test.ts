import { describe, it, expect } from "vitest";
import { parseCsv, detectDelimiter, rowsToTableText } from "./csv";

describe("parseCsv", () => {
  it("parses a simple unquoted CSV", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('name,note\n"Acme, Inc.",hello')).toEqual([
      ["name", "note"],
      ["Acme, Inc.", "hello"],
    ]);
  });

  it("handles escaped quotes inside a quoted field", () => {
    expect(parseCsv('note\n"She said ""hi"""')).toEqual([["note"], ['She said "hi"']]);
  });

  it("handles quoted fields containing newlines", () => {
    expect(parseCsv('note\n"line1\nline2",ok')).toEqual([["note"], ["line1\nline2", "ok"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops trailing blank rows from a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("auto-detects a semicolon delimiter (common in EU-locale bank/ERP exports)", () => {
    expect(parseCsv("Date;Type;Amount\n2023-01-01;Income;500")).toEqual([
      ["Date", "Type", "Amount"],
      ["2023-01-01", "Income", "500"],
    ]);
  });

  it("auto-detects a tab delimiter", () => {
    expect(parseCsv("Date\tType\tAmount\n2023-01-01\tIncome\t500")).toEqual([
      ["Date", "Type", "Amount"],
      ["2023-01-01", "Income", "500"],
    ]);
  });

  it("auto-detects a pipe delimiter", () => {
    expect(parseCsv("Date|Type|Amount\n2023-01-01|Income|500")).toEqual([
      ["Date", "Type", "Amount"],
      ["2023-01-01", "Income", "500"],
    ]);
  });

  it("an explicit delimiter overrides auto-detection", () => {
    expect(parseCsv("a;b,c\n1;2,3", ",")).toEqual([
      ["a;b", "c"],
      ["1;2", "3"],
    ]);
  });

  it("ignores delimiter characters inside quotes when sniffing", () => {
    // Real delimiter is ";" — the quoted field's comma shouldn't confuse detection.
    expect(parseCsv('Name;Note\n"Acme, Inc.";hello')).toEqual([
      ["Name", "Note"],
      ["Acme, Inc.", "hello"],
    ]);
  });
});

describe("detectDelimiter", () => {
  it("defaults to comma when nothing else is present", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("single column\nvalue")).toBe(",");
  });

  it("picks the delimiter that splits every sampled line consistently", () => {
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
});

describe("rowsToTableText", () => {
  it("joins cells with a pipe separator", () => {
    const { text, truncated } = rowsToTableText([["a", "b"], ["1", "2"]], 10);
    expect(text).toBe("a | b\n1 | 2");
    expect(truncated).toBe(false);
  });

  it("truncates to maxRows and reports it", () => {
    const rows = [["h"], ["1"], ["2"], ["3"]];
    const { text, truncated } = rowsToTableText(rows, 2);
    expect(text).toBe("h\n1");
    expect(truncated).toBe(true);
  });
});
