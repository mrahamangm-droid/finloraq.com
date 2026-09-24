/**
 * Minimal, dependency-free CSV reader for the Customer File Intelligence
 * pipeline (src/lib/ai/customer-extraction.ts). We don't add a CSV library
 * because `npm ci` in CI needs package-lock.json to match package.json
 * exactly, and this environment can't reach the npm registry to regenerate
 * the lockfile — see the equivalent note in xlsx-lite.ts. CSV's grammar is
 * small enough that a hand-written parser is the right tradeoff here.
 *
 * Handles the RFC 4180 basics: quoted fields, escaped quotes ("" inside a
 * quoted field), commas/newlines inside quotes, and both \n and \r\n line
 * endings. Does not attempt to sniff a different delimiter (semicolon,
 * tab) — every row is just returned as an array of strings; the caller
 * decides what to do with them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Normalize line endings up front so the main loop only has to think
  // about \n, and strip a leading UTF-8 BOM some spreadsheet exports add.
  const input = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush the last field/row (files don't always end with a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank trailing rows (a common artifact of a trailing newline).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  return rows;
}

/** Renders parsed rows back into a compact, readable text table for
 *  handing to the AI as plain text — not real CSV (no re-escaping needed
 *  since it's just going into a prompt), just aligned-ish columns. */
export function rowsToTableText(rows: string[][], maxRows: number): { text: string; truncated: boolean } {
  const truncated = rows.length > maxRows;
  const slice = rows.slice(0, maxRows);
  const text = slice.map((r) => r.map((c) => c.trim()).join(" | ")).join("\n");
  return { text, truncated };
}
