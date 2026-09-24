import { inflateRawSync } from "node:zlib";

/**
 * Minimal, dependency-free .xlsx (Office Open XML spreadsheet) reader for
 * the Customer File Intelligence pipeline (src/lib/ai/customer-extraction.ts).
 *
 * We deliberately don't add a real xlsx library (e.g. "xlsx"/"exceljs"):
 * this dev environment has no npm registry access, so package-lock.json
 * can't be regenerated to match a new package.json dependency, and CI runs
 * `npm ci`, which fails on any lockfile/package.json mismatch. A .xlsx file
 * is a ZIP archive of XML parts, and Node's built-in `zlib.inflateRawSync`
 * already implements the one compression method (DEFLATE) that ZIP uses —
 * so reading it needs only a ZIP central-directory parser and a couple of
 * small XML regex passes, both hand-rolled below. No writing, no formulas,
 * no formatting beyond detecting date-formatted cells, no multiple sheets
 * (first sheet only) — just enough to hand the cell text to the AI
 * extraction step as a table.
 *
 * Deliberately reads the ZIP's *central directory* (at the end of the
 * file) rather than trusting local file headers one-by-one: local headers
 * can legally have zeroed size fields when a writer streams a "data
 * descriptor" after the entry instead, and the central directory is the
 * one part of the format guaranteed to have real offsets/sizes for every
 * entry regardless of how it was written.
 */

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;

function readZipEntries(buf: Buffer): ZipEntry[] {
  // The EOCD record is fixed-size (22 bytes) but can be followed by a
  // variable-length comment, so scan backward from the end for its
  // signature rather than assuming it's the last 22 bytes.
  const maxCommentLength = 65536;
  let eocdOffset = -1;
  const searchStart = Math.max(0, buf.length - 22 - maxCommentLength);
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Not a valid .xlsx file (no ZIP end-of-central-directory record found).");
  }

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error("Malformed .xlsx file (ZIP central directory entry has a bad signature).");
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  // Local file header: sig(4) verNeeded(2) flags(2) method(2) time(2)
  // date(2) crc32(4) compSize(4) uncompSize(4) nameLen(2) extraLen(2),
  // then the name and extra field, then the raw data. We re-read
  // nameLen/extraLen from the LOCAL header (not the central directory)
  // because the two can legally differ.
  const nameLen = buf.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(raw); // stored, no compression
  if (entry.compressionMethod === 8) return inflateRawSync(raw); // deflate
  throw new Error(`Unsupported ZIP compression method (${entry.compressionMethod}) in .xlsx file.`);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    // A shared string can be plain <t>text</t> or rich text split across
    // multiple <r><t>...</t></r> runs — concatenate every <t> found inside.
    const text = Array.from((m[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((t) => decodeXmlEntities(t[1] ?? ""))
      .join("");
    strings.push(text);
  }
  return strings;
}

/** Built-in Excel numFmtIds that represent a date and/or time. Covers the
 *  standard set (14-22, 27-36, 45-47, 50-58); anything above 163 is always
 *  a custom format, handled separately via the workbook's own <numFmt>
 *  definitions. */
const BUILTIN_DATE_NUMFMT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56,
  57, 58,
]);

function isDateNumFmt(numFmtId: number, customFormats: Map<number, string>): boolean {
  if (BUILTIN_DATE_NUMFMT_IDS.has(numFmtId)) return true;
  const code = customFormats.get(numFmtId);
  if (!code || /^general$/i.test(code)) return false;
  // A format code is a date/time format if it contains date/time tokens
  // (d, m, y, h, s) outside of quoted literal text (e.g. "Qty: "0) or
  // [bracketed] locale/color tags (e.g. [$-409], [Red]).
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(stripped);
}

/** Excel's day-count epoch is 1899-12-30 (not 1900-01-01) to preserve
 *  Lotus 1-2-3's fictional 1900-02-29 for backward compatibility. We only
 *  need the date part, so the fractional (time-of-day) component of the
 *  serial number is dropped. */
function excelSerialToIsoDate(serial: number): string {
  const epochMs = Date.UTC(1899, 11, 30);
  const days = Math.trunc(serial);
  const ms = epochMs + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parses xl/styles.xml into a lookup from cell style index (the `s`
 *  attribute on a <c> element) to whether that style is a date format. */
function parseDateStyleLookup(stylesXml: string | null): boolean[] {
  if (!stylesXml) return [];

  const customFormats = new Map<number, string>();
  const numFmtsBlock = stylesXml.match(/<numFmts[^>]*>([\s\S]*?)<\/numFmts>/);
  if (numFmtsBlock) {
    for (const m of (numFmtsBlock[1] ?? "").matchAll(/<numFmt\b([^>]*)\/>/g)) {
      const attrs = m[1] ?? "";
      const idMatch = attrs.match(/numFmtId="(\d+)"/);
      const codeMatch = attrs.match(/formatCode="([^"]*)"/);
      if (idMatch && codeMatch) {
        customFormats.set(Number(idMatch[1]), decodeXmlEntities(codeMatch[1] ?? ""));
      }
    }
  }

  const cellXfsBlock = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsBlock) return [];

  const xfRe = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
  const lookup: boolean[] = [];
  let m: RegExpExecArray | null;
  while ((m = xfRe.exec(cellXfsBlock[1] ?? ""))) {
    const idMatch = (m[1] ?? "").match(/numFmtId="(\d+)"/);
    const numFmtId = idMatch ? Number(idMatch[1]) : 0;
    lookup.push(isDateNumFmt(numFmtId, customFormats));
  }
  return lookup;
}

function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetRows(sheetXml: string, sharedStrings: string[], dateStyleLookup: boolean[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(sheetXml))) {
    const rowInner = rowMatch[2] ?? "";
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(rowInner))) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue; // malformed cell, skip rather than misalign the row
      const colIndex = columnLetterToIndex(refMatch[1] ?? "");

      const typeMatch = attrs.match(/\st="([^"]*)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const styleMatch = attrs.match(/\ss="(\d+)"/);
      const styleIndex = styleMatch ? Number(styleMatch[1]) : null;

      let value = "";
      if (inner) {
        if (type === "inlineStr") {
          const t = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
          value = t ? decodeXmlEntities(t[1] ?? "") : "";
        } else {
          const v = inner.match(/<v>([\s\S]*?)<\/v>/);
          const raw = v ? (v[1] ?? "") : "";
          if (type === "s") {
            value = sharedStrings[Number(raw)] ?? "";
          } else if (type === "b") {
            value = raw === "1" ? "TRUE" : "FALSE";
          } else if (type === "str" || type === "e") {
            value = decodeXmlEntities(raw);
          } else if (!type && raw !== "" && styleIndex !== null && dateStyleLookup[styleIndex] && !Number.isNaN(Number(raw))) {
            value = excelSerialToIsoDate(Number(raw));
          } else {
            value = decodeXmlEntities(raw);
          }
        }
      }

      cells[colIndex] = value;
    }

    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }

  return rows;
}

/** Reads the first worksheet of a .xlsx file into rows of cell text.
 *  Date-formatted cells come back as YYYY-MM-DD; everything else comes
 *  back as whatever text/number Excel stored, verbatim. Throws if the
 *  buffer isn't a valid ZIP or has no worksheet part. */
export function parseXlsxRows(buffer: Buffer): string[][] {
  const entries = readZipEntries(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const sheetEntry =
    byName.get("xl/worksheets/sheet1.xml") ??
    entries
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
      .sort((a, b) => {
        const na = Number(a.name.match(/(\d+)/)?.[1] ?? 0);
        const nb = Number(b.name.match(/(\d+)/)?.[1] ?? 0);
        return na - nb;
      })[0];

  if (!sheetEntry) {
    throw new Error("This .xlsx file has no worksheet Finloraq can read (no xl/worksheets/sheet*.xml part found).");
  }

  const sharedStringsEntry = byName.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(readZipEntryData(buffer, sharedStringsEntry).toString("utf8")) : [];

  const stylesEntry = byName.get("xl/styles.xml");
  const dateStyleLookup = stylesEntry ? parseDateStyleLookup(readZipEntryData(buffer, stylesEntry).toString("utf8")) : [];

  const sheetXml = readZipEntryData(buffer, sheetEntry).toString("utf8");
  return parseSheetRows(sheetXml, sharedStrings, dateStyleLookup);
}

// Exported for unit testing the date-format heuristic in isolation.
export const __internal = { isDateNumFmt, excelSerialToIsoDate };
