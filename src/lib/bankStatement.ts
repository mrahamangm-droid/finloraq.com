import { parseCsv } from "@/lib/files/csv";
import { parseAmount, parseSheetDate } from "@/lib/import/rows";

/**
 * Parses a bank statement export (CSV or OFX/QFX) into signed statement
 * lines: + money in, − money out, the same convention BankTransaction.amount
 * uses. Pure — no database — so every bank's quirks can be unit-tested.
 *
 * CSV exports differ by bank: some have one signed Amount column, others a
 * Debit/Money out column and a Credit/Money in column; some put a few lines
 * of account details above the header. The header row is found by looking
 * for a date column plus either an amount column or a debit/credit pair.
 * Balance columns are ignored.
 */

export interface StatementLine {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed, 2dp
}

export interface ParsedStatement {
  format: "csv" | "ofx";
  lines: StatementLine[];
  /** Rows that looked like data but couldn't be read, with the reason. 1-based source row (CSV) or transaction number (OFX). */
  skipped: { row: number; reason: string }[];
}

export class StatementParseError extends Error {}

export const MAX_STATEMENT_LINES = 5000;

const HEADER_ALIASES = {
  date: ["date", "transactiondate", "postingdate", "posteddate", "valuedate", "bookingdate", "txndate", "transdate"],
  description: ["description", "details", "narrative", "particulars", "memo", "payee", "transactiondetails", "remarks", "reference", "transactiondescription", "name"],
  amount: ["amount", "transactionamount", "value", "amountaed", "signedamount"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "moneyout", "paidout", "dr", "debitamount", "out", "outflow"],
  credit: ["credit", "credits", "deposit", "deposits", "moneyin", "paidin", "cr", "creditamount", "in", "inflow"],
} as const;

type Column = keyof typeof HEADER_ALIASES;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function findHeader(table: string[][]): { index: number; cols: Partial<Record<Column, number>> } | null {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols: Partial<Record<Column, number>> = {};
    table[i]!.forEach((cell, c) => {
      const n = norm(cell);
      for (const key of Object.keys(HEADER_ALIASES) as Column[]) {
        if (cols[key] === undefined && (HEADER_ALIASES[key] as readonly string[]).includes(n)) {
          cols[key] = c;
          return;
        }
      }
    });
    const hasMoney = cols.amount !== undefined || (cols.debit !== undefined && cols.credit !== undefined);
    if (cols.date !== undefined && hasMoney) return { index: i, cols };
  }
  return null;
}

function toLine(date: string | undefined, description: string, amount: number, skip: (reason: string) => void): StatementLine | null {
  if (!date) { skip("date not recognised"); return null; }
  if (!Number.isFinite(amount)) { skip("amount not recognised"); return null; }
  if (amount === 0) { skip("zero amount"); return null; }
  return { date, description: description.replace(/\s+/g, " ").trim().slice(0, 500) || "(no description)", amount: Math.round(amount * 100) / 100 };
}

function parseCsvStatement(text: string, dayFirst: boolean): ParsedStatement {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const header = findHeader(table);
  if (!header) {
    throw new StatementParseError("Couldn't find the header row. The file needs a Date column and either an Amount column or Debit and Credit columns.");
  }
  const { cols } = header;
  const lines: StatementLine[] = [];
  const skipped: ParsedStatement["skipped"] = [];

  for (let i = header.index + 1; i < table.length; i++) {
    const row = table[i]!;
    const cell = (c: number | undefined) => (c === undefined ? "" : (row[c] ?? "").trim());
    const rawDate = cell(cols.date);
    // Footer lines ("Closing balance", totals) have no date; skip them silently.
    if (!rawDate) continue;
    const skip = (reason: string) => skipped.push({ row: i + 1, reason });
    const parsedDate = parseSheetDate(rawDate, dayFirst);
    const date = parsedDate && !parsedDate.periodTotal ? parsedDate.date : undefined;

    let amount: number;
    if (cols.amount !== undefined) {
      amount = parseAmount(cell(cols.amount));
    } else {
      const debit = parseAmount(cell(cols.debit));
      const credit = parseAmount(cell(cols.credit));
      amount = Number.isFinite(debit) && Number.isFinite(credit) ? credit - Math.abs(debit) : NaN;
    }
    const line = toLine(date, cell(cols.description), amount, skip);
    if (line) lines.push(line);
  }
  return { format: "csv", lines, skipped };
}

function ofxField(block: string, tag: string): string {
  // OFX 1.x is SGML: closing tags are optional, so read up to the next tag or line break.
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : "";
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseOfxStatement(text: string): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) throw new StatementParseError("This OFX file has no transactions in it.");
  const lines: StatementLine[] = [];
  const skipped: ParsedStatement["skipped"] = [];
  blocks.forEach((raw, n) => {
    const block = raw.split(/<\/STMTTRN>/i)[0]!;
    const skip = (reason: string) => skipped.push({ row: n + 1, reason });
    const posted = ofxField(block, "DTPOSTED").match(/^(\d{4})(\d{2})(\d{2})/);
    const date = posted && parseSheetDate(`${posted[1]}-${posted[2]}-${posted[3]}`)?.date;
    const amount = Number(ofxField(block, "TRNAMT").replace(",", "."));
    const name = decodeEntities(ofxField(block, "NAME"));
    const memo = decodeEntities(ofxField(block, "MEMO"));
    const description = name && memo && !name.includes(memo) ? `${name} ${memo}` : name || memo;
    const line = toLine(date || undefined, description, ofxField(block, "TRNAMT") ? amount : NaN, skip);
    if (line) lines.push(line);
  });
  return { format: "ofx", lines, skipped };
}

export function parseBankStatement(text: string, opts: { fileName?: string; dayFirst?: boolean } = {}): ParsedStatement {
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) throw new StatementParseError("The file is empty.");
  const isOfx = /\.(ofx|qfx)$/i.test(opts.fileName ?? "") || /<OFX>|<STMTTRN>/i.test(body);
  const parsed = isOfx ? parseOfxStatement(body) : parseCsvStatement(body, opts.dayFirst ?? true);
  if (parsed.lines.length === 0) throw new StatementParseError("No transactions could be read from this file.");
  if (parsed.lines.length > MAX_STATEMENT_LINES) {
    throw new StatementParseError(`This file has ${parsed.lines.length} transactions; import at most ${MAX_STATEMENT_LINES} at a time.`);
  }
  return parsed;
}

/**
 * Identity used to skip lines already imported: same day, same amount, same
 * description (case/spacing-insensitive). Counted, not just compared, so a
 * statement with two identical coffees on one day imports both — and
 * re-importing that statement imports neither again.
 */
export function statementFingerprint(line: { date: string; amount: number; description: string }): string {
  return `${line.date}|${line.amount.toFixed(2)}|${line.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/** Splits `lines` into new ones and ones already present in `existing` (multiset difference by fingerprint). */
export function splitNewLines<T extends StatementLine>(lines: T[], existing: StatementLine[]): { fresh: T[]; duplicates: T[] } {
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = statementFingerprint(e);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const line of lines) {
    const k = statementFingerprint(line);
    const left = remaining.get(k) ?? 0;
    if (left > 0) { remaining.set(k, left - 1); duplicates.push(line); } else fresh.push(line);
  }
  return { fresh, duplicates };
}

/**
 * Ranks posted journal entries as candidate matches for one bank line.
 * Only exact-amount candidates are considered (the match itself requires
 * it). Among those, each word the bank description shares with the entry's
 * memo or number counts as much as three days' date difference, so
 * "ACME LTD" three days out beats an unrelated entry on the same day.
 */
export interface MatchCandidate {
  journalEntryId: string;
  entryNumber: string;
  date: string; // YYYY-MM-DD
  memo: string | null;
  bankAmount: number;
}

export const SUGGESTION_WINDOW_DAYS = 10;

const score = (c: { dayGap: number; sharedWords: number }) => c.dayGap - 3 * Math.min(c.sharedWords, 3);

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
}

export function rankCandidates(line: StatementLine, candidates: MatchCandidate[], limit = 3): (MatchCandidate & { dayGap: number; sharedWords: number })[] {
  const lineDay = Date.parse(`${line.date}T00:00:00Z`);
  const lineWords = words(line.description);
  return candidates
    .filter((c) => Math.abs(c.bankAmount - line.amount) < 0.005)
    .map((c) => {
      const dayGap = Math.round(Math.abs(Date.parse(`${c.date}T00:00:00Z`) - lineDay) / 86_400_000);
      const entryWords = words(`${c.memo ?? ""} ${c.entryNumber}`);
      let sharedWords = 0;
      for (const w of lineWords) if (entryWords.has(w)) sharedWords++;
      return { ...c, dayGap, sharedWords };
    })
    .filter((c) => c.dayGap <= SUGGESTION_WINDOW_DAYS)
    .sort((a, b) => score(a) - score(b) || a.dayGap - b.dayGap || a.entryNumber.localeCompare(b.entryNumber))
    .slice(0, limit);
}
