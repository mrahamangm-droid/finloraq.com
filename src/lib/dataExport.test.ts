import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { buildZip, crc32 } from "@/lib/zip";
import { readZip } from "@/lib/zipTestReader";
import { csvCell, exportColumns, toCsv, EXPORT_TABLES } from "@/lib/dataExport";

describe("zip writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips entries, including UTF-8 names and empty files", () => {
    const big = "a,b,c\r\n".repeat(20000);
    const zip = buildZip([
      { name: "README.txt", data: "hello" },
      { name: "café.csv", data: "x\r\nü\r\n" },
      { name: "empty.csv", data: "" },
      { name: "big.csv", data: big },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["README.txt", "café.csv", "empty.csv", "big.csv"]);
    expect(files.get("café.csv")).toBe("x\r\nü\r\n");
    expect(files.get("big.csv")).toBe(big);
    expect(zip.length).toBeLessThan(big.length / 10); // actually deflated
  });

  it("is readable by the system unzip tool when one is installed", () => {
    let hasUnzip = true;
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
    } catch {
      hasUnzip = false;
    }
    if (!hasUnzip) return;
    const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
    const file = path.join(dir, "t.zip");
    writeFileSync(file, buildZip([{ name: "a.csv", data: "1,2\r\n" }, { name: "b.csv", data: "3,4\r\n" }]));
    expect(execFileSync("unzip", ["-t", file]).toString()).toMatch(/No errors detected/);
  });
});

describe("csvCell", () => {
  it("writes Decimals exactly, never via float or exponent", () => {
    expect(csvCell(new Prisma.Decimal("0.10"))).toBe("0.1");
    expect(csvCell(new Prisma.Decimal("1234567890123456.78"))).toBe("1234567890123456.78");
    expect(csvCell(new Prisma.Decimal("0.00000001"))).toBe("0.00000001");
  });

  it("quotes per RFC 4180 and formats dates, nulls and JSON", () => {
    expect(csvCell('He said "hi", then left\n')).toBe('"He said ""hi"", then left\n"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvCell(true)).toBe("true");
  });

  it("neutralizes spreadsheet formulas but leaves negative numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("+971 4 000")).toBe("'+971 4 000");
  });

  it("builds a header plus rows", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: "x,y" }])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

describe("export columns", () => {
  it("never exports credentials", () => {
    for (const t of EXPORT_TABLES) {
      const cols = exportColumns(t.model);
      expect(cols.length, t.model).toBeGreaterThan(0);
      for (const c of cols) expect(c, `${t.model}.${c}`).not.toMatch(/token|secret|hash|password/i);
    }
    expect(exportColumns("Customer")).not.toContain("portalToken");
    expect(exportColumns("Invoice")).toContain("total");
  });

  it("scopes every table through companyId directly or via its parent", () => {
    for (const t of EXPORT_TABLES) expect(JSON.stringify(t.where("C1")), t.file).toContain('"companyId":"C1"');
  });
});
