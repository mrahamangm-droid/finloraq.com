import { deflateRawSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { parseXlsxRows, __internal } from "./xlsx-lite";

const { isDateNumFmt, excelSerialToIsoDate } = __internal;

/**
 * Builds a minimal but structurally valid ZIP archive in memory, so the
 * parser can be tested end-to-end without a real .xlsx fixture file or an
 * xlsx-writing library (we don't have one — see the note in xlsx-lite.ts).
 * CRC32 is left as 0: our parser (like most minimal readers) doesn't
 * verify it, so a "wrong" checksum here doesn't affect what's under test.
 */
function buildZip(files: { name: string; data: string; method: 0 | 8 }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const rawData = Buffer.from(f.data, "utf8");
    const compData = f.method === 8 ? deflateRawSync(rawData) : rawData;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(f.method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14); // crc32 (unchecked by our reader)
    localHeader.writeUInt32LE(compData.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([localHeader, nameBuf, compData]);
    localParts.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(f.method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compData.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([centralHeader, nameBuf]));

    offset += localEntry.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const SHARED_STRINGS_XML = `<?xml version="1.0"?><sst><si><t>Customer</t></si><si><t>Acme, Inc.</t></si><si><t>Northwind &amp; Co</t></si></sst>`;

const STYLES_XML = `<?xml version="1.0"?><styleSheet>
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0"/>
    <xf numFmtId="14" fontId="0"/>
    <xf numFmtId="164" fontId="0"/>
  </cellXfs>
</styleSheet>`;

// Row 1 (header): Customer | Date | Amount
// Row 2: shared-string "Acme, Inc." | built-in date style (s=1, numFmtId 14) serial 36526 (2000-01-01) | 1200.5
// Row 3: shared-string "Northwind & Co" | custom date style (s=2, numFmtId 164) serial 36892 (2001-01-01) | inline string amount note
const SHEET_XML = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c></row>
  <row r="2">
    <c r="A2" t="s"><v>1</v></c>
    <c r="B2" s="1"><v>36526</v></c>
    <c r="C2"><v>1200.5</v></c>
  </row>
  <row r="3">
    <c r="A3" t="s"><v>2</v></c>
    <c r="B3" s="2"><v>36892</v></c>
    <c r="D3" t="inlineStr"><is><t>note</t></is></c>
  </row>
</sheetData></worksheet>`;

describe("parseXlsxRows", () => {
  it("reads shared strings, numbers, a built-in date style and a custom date style (deflated)", () => {
    const zip = buildZip([
      { name: "xl/sharedStrings.xml", data: SHARED_STRINGS_XML, method: 8 },
      { name: "xl/styles.xml", data: STYLES_XML, method: 8 },
      { name: "xl/worksheets/sheet1.xml", data: SHEET_XML, method: 8 },
    ]);

    const rows = parseXlsxRows(zip);

    expect(rows[0]).toEqual(["Customer"]);
    expect(rows[1]?.[0]).toBe("Acme, Inc.");
    expect(rows[1]?.[1]).toBe("2000-01-01"); // built-in numFmtId 14 (m/d/yy) on serial 36526
    expect(rows[1]?.[2]).toBe("1200.5");
    expect(rows[2]?.[0]).toBe("Northwind & Co");
    expect(rows[2]?.[1]).toBe("2001-01-01"); // custom "dd/mm/yyyy" style on serial 36892
    // sparse row: column C (index 2) was never set, column D (index 3) is the inline string
    expect(rows[2]?.[2]).toBe("");
    expect(rows[2]?.[3]).toBe("note");
  });

  it("also works with stored (uncompressed) ZIP entries", () => {
    const zip = buildZip([{ name: "xl/worksheets/sheet1.xml", data: SHEET_XML, method: 0 }]);
    const rows = parseXlsxRows(zip);
    // no sharedStrings.xml provided, so t="s" cells fall back to an empty string
    expect(rows[1]?.[0]).toBe("");
    expect(rows[1]?.[2]).toBe("1200.5");
  });

  it("falls back to the lowest-numbered sheet when sheet1.xml is absent", () => {
    const zip = buildZip([{ name: "xl/worksheets/sheet2.xml", data: SHEET_XML, method: 8 }]);
    const rows = parseXlsxRows(zip);
    expect(rows[1]?.[2]).toBe("1200.5");
  });

  it("throws a clear error for a file with no worksheet part", () => {
    const zip = buildZip([{ name: "xl/workbook.xml", data: "<workbook/>", method: 0 }]);
    expect(() => parseXlsxRows(zip)).toThrow(/no worksheet/i);
  });

  it("throws a clear error for a non-ZIP buffer", () => {
    expect(() => parseXlsxRows(Buffer.from("not a zip file"))).toThrow(/not a valid \.xlsx/i);
  });
});

describe("isDateNumFmt", () => {
  it("recognizes built-in date format IDs", () => {
    expect(isDateNumFmt(14, new Map())).toBe(true);
    expect(isDateNumFmt(22, new Map())).toBe(true);
  });

  it("does not treat General or plain numeric formats as dates", () => {
    expect(isDateNumFmt(0, new Map())).toBe(false); // General
    expect(isDateNumFmt(2, new Map())).toBe(false); // 0.00
  });

  it("recognizes a custom format code containing date tokens", () => {
    expect(isDateNumFmt(164, new Map([[164, "dd/mm/yyyy"]]))).toBe(true);
    expect(isDateNumFmt(165, new Map([[165, "[$-409]d\\-mmm\\-yy;@"]]))).toBe(true);
  });

  it("does not false-positive on a currency format that happens to contain 'd'", () => {
    expect(isDateNumFmt(166, new Map([[166, '"USD" #,##0.00']]))).toBe(false);
  });
});

describe("excelSerialToIsoDate", () => {
  it("converts a known serial number correctly", () => {
    // Epoch is 1899-12-30, so serial 2 is a trivial +2 days = 1900-01-01.
    // (Excel itself treats serial 1, not 2, as 1900-01-01 — this two-day
    // epoch offset is the well-known trick that keeps every date from
    // 1900-03-01 onward correct by construction, at the cost of being one
    // day off inside Excel's own fictional Jan/Feb 1900. That range never
    // occurs in real financial documents, so it's not handled specially.)
    expect(excelSerialToIsoDate(2)).toBe("1900-01-01");
    // 36526 = 2000-01-01 is a widely-verified reference value for Excel's
    // date serials (independently confirmed here via real leap-year
    // counting: 25569 days from this epoch to 1970-01-01, plus 10957 real
    // days from 1970-01-01 to 2000-01-01, including seven leap years).
    expect(excelSerialToIsoDate(36526)).toBe("2000-01-01");
    // 2000 was itself a leap year (366 days), so a year later is 36892.
    expect(excelSerialToIsoDate(36892)).toBe("2001-01-01");
  });
});
