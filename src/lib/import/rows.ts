import { isoDay, parseIsoDay, periodEndDay } from "@/lib/periods";

/**
 * Turns a spreadsheet's rows (from src/lib/files/csv.ts or xlsx-lite.ts)
 * into clean, typed import rows. Pure — no database — so every parsing rule
 * is unit-tested, and the server re-runs the same code on commit rather than
 * trusting what the browser sends back.
 *
 * Dates stay exactly as the sheet says: a row dated 2023-03-14 is posted on
 * 2023-03-14 and shows up in March 2023 / Q1 2023 / 2023 reports. Loose dates
 * ("2023", "2023-03", "2023-Q1", "2023-W12") mean "a total for that period"
 * and are posted on the period's last day.
 */

export const IMPORT_KINDS = ["transactions", "invoices", "bills"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const MAX_IMPORT_ROWS = 10000;

export interface TxnRow {
  line: number;
  date: string; // YYYY-MM-DD
  description: string;
  /** Gross amount, tax included, always positive. */
  amount: number;
  type: "income" | "expense";
  category: string;
  tax: number;
}

export interface DocRow {
  line: number;
  date: string;
  dueDate: string;
  party: string;
  ref: string;
  description: string;
  /** Before tax. */
  amount: number;
  /** Percent, e.g. 5 for 5% VAT; null = no tax. */
  taxRate: number | null;
  paid: number;
  paidDate: string | null;
  category: string;
}

export type ImportRow = TxnRow | DocRow;

export interface ParsedRow<T> {
  line: number;
  row: T | null;
  errors: string[];
  notes: string[];
  /** Which sheet this came from — only set when the workbook had more than
   *  one sheet contributing rows (e.g. separate Income/Expense registers). */
  sheet?: string;
}

// ------------------------------------------------------------------ headers

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, "");

const ALIASES: Record<string, string[]> = {
  date: ["date", "transactiondate", "txndate", "invoicedate", "billdate", "issuedate", "period", "month", "year", "week", "day", "postingdate", "valuedate", "entrydate", "voucherdate", "trandate", "activitydate"],
  dueDate: ["duedate", "due", "paymentdue", "dueon", "duebydate"],
  description: ["description", "details", "memo", "narration", "particulars", "item", "notes", "note", "remarks", "transactiondetails"],
  amount: ["amount", "total", "value", "net", "subtotal", "netamount", "amountbeforetax", "sum", "grandtotal", "amountaed"],
  income: ["income", "revenue", "sales", "moneyin", "in", "credit", "cr", "receipts", "received", "deposit", "deposits", "inflow"],
  expense: ["expense", "expenses", "cost", "costs", "moneyout", "out", "debit", "dr", "spent", "payments", "withdrawal", "withdrawals", "outflow"],
  type: ["type", "kind", "direction", "inout", "incomeexpense", "transactiontype", "drcr", "entrytype"],
  category: ["category", "account", "accountcode", "accountname", "head", "ledger", "expensecategory", "incomecategory", "class", "accounthead", "costcenter"],
  tax: ["tax", "vat", "vatamount", "taxamount", "gst"],
  taxRate: ["taxrate", "vatrate", "tax%", "vat%", "taxpercent", "vatpercent", "gstrate"],
  party: ["customer", "client", "supplier", "vendor", "payee", "party", "name", "customername", "suppliername", "vendorname", "partyname"],
  ref: ["invoice", "invoiceno", "invoicenumber", "billno", "billnumber", "bill", "number", "ref", "reference", "docno", "no", "voucherno", "transactionid"],
  paid: ["paid", "amountpaid", "paidamount", "payment", "received", "settled"],
  paidDate: ["paiddate", "paymentdate", "datepaid", "settleddate", "receiveddate"],
};

/** How many leading rows (title lines, company name, generated-on notes, blank
 *  spacer rows…) a real-world export can carry before the actual header. */
const MAX_HEADER_SEARCH_ROWS = 30;

/** How many body rows under a candidate header to sample when sanity-checking
 *  that a money-like column actually holds numbers (see moneyColumnLooksReal). */
const MONEY_COLUMN_SAMPLE_ROWS = 20;

const isNumericLooking = (s: string): boolean => {
  const t = s.trim();
  if (!t) return true; // blank cells don't count against a column either way
  const stripped = t.replace(/^\(|\)$/g, "").replace(/[A-Za-z$€£¥₹%\s,']/g, "");
  return /^-?\d+(\.\d+)?-?$/.test(stripped);
};

/**
 * A header word matching an amount/income/expense/tax alias isn't proof the
 * column holds money — real exports have status/reference/text columns
 * whose normalized name happens to share a prefix with a money alias (e.g.
 * "Payment Status" starts with the "expense" alias "payments"). Before
 * trusting a money-field match, sample the rows under it and require most
 * non-blank values to actually look numeric; otherwise the match is
 * discarded as a false positive rather than silently feeding text into
 * amount parsing (which would either crash the row or, worse, coincidentally
 * parse into a plausible-looking wrong number).
 */
function moneyColumnLooksReal(table: string[][], headerIndex: number, colIndex: number): boolean {
  let seen = 0, numeric = 0;
  for (let i = headerIndex + 1; i < table.length && seen < MONEY_COLUMN_SAMPLE_ROWS; i++) {
    const v = String((table[i] ?? [])[colIndex] ?? "").trim();
    if (!v) continue;
    seen++;
    if (isNumericLooking(v)) numeric++;
  }
  if (seen < 2) return true; // not enough data to judge — don't punish a short/sparse sheet
  return numeric / seen >= 0.6;
}

/**
 * Finds the header row and maps fields to column indexes. Two passes per
 * candidate row: an exact match against ALIASES (so "Paid date" isn't taken
 * as "date"), then a looser pass for anything still unmatched — a header
 * like "Amount (AED)" or "Transaction Date" normalizes to "amountaed" /
 * "transactiondate", which doesn't equal an alias but does start with one,
 * so real-world column names with units, currency codes or extra words
 * still resolve instead of failing the whole import.
 */
export function detectColumns(table: string[][]): { headerIndex: number; columns: Partial<Record<keyof typeof ALIASES, number>> } | null {
  for (let h = 0; h < Math.min(table.length, MAX_HEADER_SEARCH_ROWS); h++) {
    const header = (table[h] ?? []).map((c) => norm(String(c ?? "")));
    if (header.every((c) => !c)) continue; // blank spacer row — never a header
    const columns: Partial<Record<keyof typeof ALIASES, number>> = {};
    const used = () => new Set(Object.values(columns));

    for (const [field, aliases] of Object.entries(ALIASES)) {
      const taken = used();
      const i = header.findIndex((c, idx) => aliases.includes(c) && !taken.has(idx));
      if (i >= 0) columns[field as keyof typeof ALIASES] = i;
    }
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (columns[field as keyof typeof ALIASES] !== undefined) continue;
      const taken = used();
      const i = header.findIndex((c, idx) => c.length >= 3 && !taken.has(idx) && aliases.some((a) => a.length >= 3 && (c.startsWith(a) || a.startsWith(c))));
      if (i >= 0) columns[field as keyof typeof ALIASES] = i;
    }
    // Last resort: a longer alias appearing anywhere in the header text, not
    // just as a prefix — e.g. "P&L Category" (normalizes to "plcategory")
    // contains "category" but doesn't start with it. Restricted to aliases
    // of 5+ characters so this doesn't start matching on short, common
    // fragments ("no", "ref", "in", "out"...).
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (columns[field as keyof typeof ALIASES] !== undefined) continue;
      const taken = used();
      const i = header.findIndex((c, idx) => c.length >= 5 && !taken.has(idx) && aliases.some((a) => a.length >= 5 && c.includes(a)));
      if (i >= 0) columns[field as keyof typeof ALIASES] = i;
    }

    // A money-shaped field matched by name alone isn't trustworthy until we
    // check its actual values — drop it if the column it landed on doesn't
    // really hold numbers (see moneyColumnLooksReal).
    for (const field of ["amount", "income", "expense", "tax", "taxRate", "paid"] as const) {
      const idx = columns[field];
      if (idx !== undefined && !moneyColumnLooksReal(table, h, idx)) delete columns[field];
    }

    const hasMoney = columns.amount !== undefined || columns.income !== undefined || columns.expense !== undefined;
    if (columns.date !== undefined && hasMoney) return { headerIndex: h, columns };
  }
  return null;
}

// ------------------------------------------------------------------ values

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const ymd = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return parseIsoDay(s) ? s : null;
};

/**
 * Accepts the date shapes people actually put in sheets. `dayFirst` settles
 * 03/04/2023 (3 April vs March 4) — it comes from the user's date-format
 * preference. Returns YYYY-MM-DD, or null when it can't be read.
 */
export function parseSheetDate(raw: string, dayFirst = true): { date: string; periodTotal: boolean } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) {
    const d = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    return d ? { date: d, periodTotal: false } : null;
  }
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) {
    const d = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    return d ? { date: d, periodTotal: false } : null;
  }
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    // An impossible reading settles it regardless of preference (13/02 must be day-first).
    const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : dayFirst ? [a, b] : [b, a];
    const r = ymd(y, mo, d);
    return r ? { date: r, periodTotal: false } : null;
  }
  // 14 Mar 2023 / 14-March-2023 / Mar 14, 2023
  if ((m = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})\.?[\s\-,]+(\d{2,4})$/))) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    const r = mo ? ymd(Number(m[3]), mo, Number(m[1])) : null;
    return r ? { date: r, periodTotal: false } : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    const r = mo ? ymd(Number(m[3]), mo, Number(m[2])) : null;
    return r ? { date: r, periodTotal: false } : null;
  }
  // Month totals: "Mar 2023", "March-2023", "2023 March"
  if ((m = s.match(/^([A-Za-z]{3,9})[\s\-']+(\d{2,4})$/)) || (m = s.match(/^(\d{4})[\s\-]+([A-Za-z]{3,9})$/))) {
    const [mon, yr] = /^\d/.test(m[1]!) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    const mo = MONTHS[mon.toLowerCase()];
    let y = Number(yr);
    if (y < 100) y += 2000;
    const end = mo ? periodEndDay(`${y}-${mo}`) : null;
    return end ? { date: isoDay(end), periodTotal: true } : null;
  }
  // Excel serial day numbers (a date cell exported without its format).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 20000 && n < 80000) return { date: isoDay(new Date(Date.UTC(1899, 11, 30) + n * 86_400_000)), periodTotal: false };
  }
  const end = periodEndDay(s.replace(/\s+/g, ""));
  return end ? { date: isoDay(end), periodTotal: true } : null;
}

/** "AED 1,234.50", "(1 234,50)", "1.234,50-", "12%" → number. NaN when unreadable, 0 for blank. */
export function parseAmount(raw: string): number {
  let s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "—") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { negative = true; s = s.slice(0, -1); }
  s = s.replace(/[A-Za-z$€£¥₹%\s  ']/g, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Comma is the decimal mark if 1–2 digits follow it (1.234,56 / 12,5); otherwise a thousands separator.
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Math.round(Number(s) * 100) / 100;
  return negative ? -n : n;
}

const INCOME_WORDS = ["income", "revenue", "sale", "sales", "receipt", "received", "in", "moneyin", "credit", "cr", "deposit", "inflow"];
const EXPENSE_WORDS = ["expense", "expenses", "cost", "purchase", "payment", "paid", "out", "moneyout", "debit", "dr", "withdrawal", "outflow", "spend"];

export function parseType(raw: string): "income" | "expense" | null {
  const v = norm(String(raw ?? ""));
  if (INCOME_WORDS.includes(v)) return "income";
  if (EXPENSE_WORDS.includes(v)) return "expense";
  return null;
}

// ------------------------------------------------------------------ rows

const cell = (r: string[], i: number | undefined) => (i === undefined ? "" : String(r[i] ?? "").trim());

/**
 * Parses one already-located table (header row found, columns mapped).
 * Shared by `parseTable` (single sheet/CSV) and `parseWorkbook` (multi-sheet
 * .xlsx, one call per contributing sheet) so both apply identical row rules.
 *
 * `forcedType`, set only for `transactions`, is used when a sheet has no
 * Type/Income/Expense column of its own but its role is known from context
 * (e.g. a workbook's dedicated "Expense Register" tab) — it's a floor, not
 * an override: a row's own Type/Income/Expense column, or a negative
 * amount, still wins.
 */
function parseSingleTable(
  kind: ImportKind,
  table: string[][],
  opts: { dayFirst?: boolean; forcedType?: "income" | "expense"; sheet?: string; rowBudget?: number },
): { rows: ParsedRow<ImportRow>[]; error?: string; periodTotals: number } {
  const detected = detectColumns(table);
  if (!detected) {
    return { rows: [], periodTotals: 0, error: "Couldn't find the header row. The sheet needs a Date column and an Amount (or Income / Expense) column — download the template to see the layout." };
  }
  const { headerIndex, columns: c } = detected;
  const body = table.slice(headerIndex + 1);
  const dayFirst = opts.dayFirst ?? true;
  const rowBudget = opts.rowBudget ?? MAX_IMPORT_ROWS;
  const out: ParsedRow<ImportRow>[] = [];
  let periodTotals = 0;

  if (kind !== "transactions" && c.party === undefined) {
    return { rows: [], periodTotals: 0, error: `Couldn't find a ${kind === "invoices" ? "Customer" : "Supplier"} column.` };
  }

  for (let i = 0; i < body.length; i++) {
    const r = body[i] ?? [];
    const line = headerIndex + i + 2; // 1-based, as the spreadsheet shows it
    if (r.every((x) => !String(x ?? "").trim())) continue;
    if (out.length >= rowBudget) {
      return { rows: out, periodTotals, error: `Only the first ${MAX_IMPORT_ROWS} rows are read in one import — split the sheet and import the rest separately.` };
    }
    const errors: string[] = [];
    const notes: string[] = [];

    const d = parseSheetDate(cell(r, c.date), dayFirst);
    if (!d) errors.push(`Date "${cell(r, c.date) || "(blank)"}" isn't a date I can read.`);
    else if (d.periodTotal) { notes.push(`Period total — dated ${d.date}`); periodTotals++; }
    const description = cell(r, c.description).slice(0, 300);
    const category = cell(r, c.category).slice(0, 80);

    if (kind === "transactions") {
      let type: "income" | "expense" | null = c.type !== undefined ? parseType(cell(r, c.type)) : null;
      let amount = parseAmount(cell(r, c.amount));
      const inc = parseAmount(cell(r, c.income));
      const exp = parseAmount(cell(r, c.expense));
      if (c.amount === undefined || (!amount && (inc || exp))) {
        if (inc && exp) errors.push("Both Income and Expense are filled in — use one per row.");
        amount = inc || exp;
        type = type ?? (inc ? "income" : exp ? "expense" : null);
      }
      if (Number.isNaN(amount)) errors.push("Amount isn't a number.");
      else if (amount === 0) errors.push("Amount is empty or zero.");
      if (!type && !Number.isNaN(amount) && amount !== 0) {
        if (c.type !== undefined && cell(r, c.type)) errors.push(`Type "${cell(r, c.type)}" should be Income or Expense.`);
        else if (opts.forcedType && amount > 0) { type = opts.forcedType; notes.push(`No Type column — treated as ${type} (sheet: ${opts.sheet})`); }
        else { type = amount < 0 ? "expense" : "income"; notes.push(`No type given — treated as ${type} from the sign`); }
      }
      if (amount < 0) amount = -amount;
      const tax = Math.abs(parseAmount(cell(r, c.tax)) || 0);
      if (tax && tax >= amount) errors.push("Tax can't be as large as the whole amount (Amount should include tax).");
      out.push({
        line, errors, notes, sheet: opts.sheet,
        row: errors.length ? null : { line, date: d!.date, description, amount, type: type!, category, tax },
      });
      continue;
    }

    // invoices / bills
    const party = cell(r, c.party).slice(0, 120);
    if (!party) errors.push(`${kind === "invoices" ? "Customer" : "Supplier"} is empty.`);
    const amount = parseAmount(cell(r, c.amount));
    if (Number.isNaN(amount) || amount <= 0) errors.push("Amount must be a positive number.");
    let taxRate: number | null = null;
    if (c.taxRate !== undefined && cell(r, c.taxRate)) {
      let t = parseAmount(cell(r, c.taxRate));
      if (t > 0 && t < 1) t = Math.round(t * 10000) / 100; // 0.05 → 5
      if (Number.isNaN(t) || t < 0 || t > 100) errors.push("Tax rate should be a percentage like 5.");
      else if (t > 0) taxRate = t;
    }
    let dueDate = d?.date ?? "";
    if (c.dueDate !== undefined && cell(r, c.dueDate)) {
      const dd = parseSheetDate(cell(r, c.dueDate), dayFirst);
      if (!dd) errors.push("Due date isn't a date I can read.");
      else dueDate = dd.date;
    } else if (d) {
      dueDate = isoDay(new Date(parseIsoDay(d.date)!.getTime() + 30 * 86_400_000));
      notes.push("No due date — 30 days after the date");
    }
    if (d && dueDate && dueDate < d.date) errors.push("Due date is before the date.");
    const paidRaw = cell(r, c.paid);
    let paid = 0;
    if (paidRaw) {
      const low = paidRaw.toLowerCase();
      if (["yes", "y", "paid", "true", "full", "✓"].includes(low)) paid = Infinity;
      else if (["no", "n", "unpaid", "false"].includes(low)) paid = 0;
      else {
        paid = parseAmount(paidRaw);
        if (Number.isNaN(paid) || paid < 0) { errors.push("Paid should be an amount or Yes/No."); paid = 0; }
      }
    }
    // "Yes" means the whole invoice/bill, tax included.
    if (paid === Infinity) paid = Number.isNaN(amount) ? 0 : Math.round(amount * (1 + (taxRate ?? 0) / 100) * 100) / 100;
    let paidDate: string | null = null;
    if (c.paidDate !== undefined && cell(r, c.paidDate)) {
      const pd = parseSheetDate(cell(r, c.paidDate), dayFirst);
      if (!pd) errors.push("Paid date isn't a date I can read.");
      else paidDate = pd.date;
    }
    if (paidDate && d && paidDate < d.date) errors.push("Paid date is before the date.");
    out.push({
      line, errors, notes, sheet: opts.sheet,
      row: errors.length ? null : {
        line, date: d!.date, dueDate, party, ref: cell(r, c.ref).slice(0, 60), description, amount, taxRate,
        paid, paidDate: paid ? paidDate ?? d!.date : null, category,
      },
    });
  }
  return { rows: out, periodTotals };
}

export function parseTable(kind: ImportKind, table: string[][], opts: { dayFirst?: boolean } = {}): {
  rows: ParsedRow<ImportRow>[];
  error?: string;
  periodTotals: number;
} {
  return parseSingleTable(kind, table, opts);
}

/** A sheet name that unambiguously means "every row here is income" or
 *  "every row here is expense" — used only when a matching sheet has no
 *  Type/Income/Expense column of its own (a dedicated register tab, common
 *  in real bookkeeping exports). Kept deliberately narrow: generic terms
 *  like "summary", "statement", "report", "reconciliation", "receivable"
 *  or "payable" are excluded on purpose, since those sheets often restate
 *  figures that already appear elsewhere (recognizing them as income/
 *  expense too would double-count the same money). */
const INCOME_SHEET_HINT = /\b(income|revenue|sales)\b/i;
const EXPENSE_SHEET_HINT = /\b(expenses?|purchases?|payroll)\b/i;
const NON_TRANSACTION_SHEET_HINT = /\b(summary|statement|report|reconciliation|review|audit|duplicate|balance|schedule|dashboard|cover|master|control|log|source ?data|quality|receivable|payable|register of|forecast|budget|kpi)\b/i;

function sheetTypeHint(name: string): "income" | "expense" | null {
  if (NON_TRANSACTION_SHEET_HINT.test(name)) return null;
  if (INCOME_SHEET_HINT.test(name)) return "income";
  if (EXPENSE_SHEET_HINT.test(name)) return "expense";
  return null;
}

/**
 * Parses a multi-sheet .xlsx workbook for the `transactions` / `invoices` /
 * `bills` importer. Real accounting exports are rarely one flat sheet: the
 * data-carrying tab is often not first (a cover page or dashboard usually
 * is), and it's common to split income and expenses into two separate
 * registers rather than one sheet with a Type column.
 *
 * Strategy: search every sheet for a valid header (same rules as a single
 * sheet), and only put a sheet's rows in the import when we can be
 * confident about what they are — either the sheet has its own
 * Type/Income/Expense column, or its name unambiguously says "income" or
 * "expense" (see sheetTypeHint) and it actually produced at least one good
 * row. A matching sheet whose role we can't determine safely is left out
 * rather than guessed at, and reported in `skipped` so nothing silently
 * vanishes — the alternative (merging it in anyway) risks double-counting
 * money that's just as likely restated on a reconciliation/report tab.
 */
/** Fingerprint used only to spot one sheet restating another's rows (see
 *  parseWorkbook) — deliberately looser than rowKeys' dedup fingerprint
 *  (no description/category), since a category breakout sheet often
 *  shortens or drops those while keeping the same date and amount. */
function overlapKey(kind: ImportKind, row: ImportRow): string {
  return "type" in row ? `${row.date}|${row.amount.toFixed(2)}` : `${row.date}|${row.amount.toFixed(2)}|${norm(row.party)}`;
}

export function parseWorkbook(
  kind: ImportKind,
  sheets: { name: string; rows: string[][] }[],
  opts: { dayFirst?: boolean } = {},
): {
  rows: ParsedRow<ImportRow>[];
  error?: string;
  periodTotals: number;
  sheetsUsed: string[];
  skipped: { name: string; reason: "ambiguous" | "overlap" }[];
} {
  if (sheets.length <= 1) {
    const r = parseSingleTable(kind, sheets[0]?.rows ?? [], opts);
    return { ...r, sheetsUsed: r.error ? [] : [sheets[0]?.name ?? ""], skipped: [] };
  }

  const contributions: { name: string; result: ReturnType<typeof parseSingleTable> }[] = [];
  const skipped: { name: string; reason: "ambiguous" | "overlap" }[] = [];
  const seenKeys = new Set<string>();
  let anyHeaderFound = false;

  for (const sheet of sheets) {
    const detected = detectColumns(sheet.rows);
    if (!detected) continue;
    anyHeaderFound = true;
    const hasOwnType = detected.columns.type !== undefined || detected.columns.income !== undefined || detected.columns.expense !== undefined;
    const hint = (kind === "transactions" && !hasOwnType ? sheetTypeHint(sheet.name) : undefined) ?? undefined;

    if (kind === "transactions" && !hasOwnType && !hint) {
      // Can't safely tell what this sheet's rows are — try it, and only
      // keep it if it actually produces good rows (worth flagging), but
      // never merge it blind: report it as skipped either way.
      const probe = parseSingleTable(kind, sheet.rows, { ...opts, sheet: sheet.name });
      if (probe.rows.some((r) => r.row)) skipped.push({ name: sheet.name, reason: "ambiguous" });
      continue;
    }

    const result = parseSingleTable(kind, sheet.rows, { ...opts, forcedType: hint, sheet: sheet.name });
    const good = result.rows.filter((r) => r.row);
    if (!good.length) continue;

    // Real exports often also carry per-category "breakout" sheets (Payroll,
    // Utilities, a project cost centre…) that just re-list a slice of the
    // main register's own rows for readability. Since those share tab
    // wording with the register itself ("payroll" reads as an expense-sheet
    // hint too), catch them by content instead of name: if most of a
    // sheet's rows share their (date, amount) with rows a prior sheet
    // already contributed, it's restating data, not adding it — merging it
    // in would double-count that money.
    const overlapping = good.filter((r) => seenKeys.has(overlapKey(kind, r.row!))).length;
    if (good.length >= 2 && overlapping / good.length >= 0.4) {
      skipped.push({ name: sheet.name, reason: "overlap" });
      continue;
    }

    for (const r of good) seenKeys.add(overlapKey(kind, r.row!));
    contributions.push({ name: sheet.name, result });
  }

  if (!contributions.length) {
    return {
      rows: [], periodTotals: 0, sheetsUsed: [], skipped,
      error: anyHeaderFound
        ? "Found header rows, but couldn't tell which sheet(s) hold the transactions — download the template to see the expected layout."
        : "Couldn't find the header row. The sheet needs a Date column and an Amount (or Income / Expense) column — download the template to see the layout.",
    };
  }

  let rows: ParsedRow<ImportRow>[] = [];
  let periodTotals = 0;
  for (const { result } of contributions) {
    rows = rows.concat(result.rows);
    periodTotals += result.periodTotals;
  }

  let error: string | undefined;
  const goodCount = rows.filter((r) => r.row).length;
  if (goodCount > MAX_IMPORT_ROWS) {
    // Trim from the back, sheet by sheet, until the combined good-row count fits.
    let kept = 0;
    const trimmed: ParsedRow<ImportRow>[] = [];
    for (const r of rows) {
      if (r.row && kept >= MAX_IMPORT_ROWS) continue;
      if (r.row) kept++;
      trimmed.push(r);
    }
    rows = trimmed;
    error = `Only the first ${MAX_IMPORT_ROWS} rows are read in one import — split the sheet and import the rest separately.`;
  }

  return { rows, error, periodTotals, sheetsUsed: contributions.map((c) => c.name), skipped };
}

/**
 * Stable fingerprint for duplicate protection: importing the same sheet
 * twice (or overlapping sheets) skips rows already posted. Identical rows
 * inside one sheet are told apart by their occurrence number, so two real
 * AED 50 coffees on the same day both import.
 */
export function rowKeys(kind: ImportKind, rows: ImportRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = "type" in r
      ? [kind, r.date, r.type, r.amount.toFixed(2), r.tax.toFixed(2), norm(r.category), norm(r.description)].join("|")
      : [kind, r.date, norm(r.party), norm(r.ref), r.amount.toFixed(2), String(r.taxRate ?? ""), norm(r.description)].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

/** CSV templates offered for download on the import page. */
export const TEMPLATES: Record<ImportKind, string> = {
  transactions:
    "Date,Type,Category,Description,Amount,VAT\n" +
    "2023-01-15,Income,Sales Revenue,Website project for client,10500,500\n" +
    "2023-01-20,Expense,Rent,Office rent January,6000,\n" +
    "2023-02,Expense,Salaries,February salaries (monthly total),24000,\n" +
    "2022,Income,Consulting,2022 consulting income (yearly total),180000,\n",
  invoices:
    "Invoice date,Due date,Customer,Invoice no,Description,Amount,VAT %,Paid,Paid date\n" +
    "2023-03-01,2023-03-31,Acme Trading LLC,INV-0105,Design retainer March,8000,5,8400,2023-03-28\n" +
    "2023-04-01,2023-04-30,Acme Trading LLC,INV-0112,Design retainer April,8000,5,,\n",
  bills:
    "Bill date,Due date,Supplier,Bill no,Category,Description,Amount,VAT %,Paid,Paid date\n" +
    "2023-03-05,2023-04-04,Dubai Office Supplies,B-2231,Office supplies,Printer paper and toner,1200,5,Yes,2023-03-20\n",
};

/**
 * Re-checks a row the browser sends back for commit. The preview already
 * validated it, but the server never trusts the client: anything that isn't
 * exactly a well-formed row is rejected.
 */
export function checkRow(kind: ImportKind, raw: unknown): ImportRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const day = (v: unknown) => (typeof v === "string" && parseIsoDay(v) ? v : null);
  const line = typeof r.line === "number" && Number.isInteger(r.line) && r.line > 0 ? r.line : null;
  const date = day(r.date);
  const description = str(r.description ?? "", 300);
  const category = str(r.category ?? "", 80);
  const amount = num(r.amount);
  if (!line || !date || description === null || category === null || amount === null || amount <= 0 || amount > 1e12) return null;

  if (kind === "transactions") {
    const tax = num(r.tax ?? 0);
    if ((r.type !== "income" && r.type !== "expense") || tax === null || tax < 0 || tax >= amount) return null;
    return { line, date, description, amount, type: r.type, category, tax };
  }
  const party = str(r.party, 120);
  const ref = str(r.ref ?? "", 60);
  const dueDate = day(r.dueDate);
  const paid = num(r.paid ?? 0);
  const taxRate = r.taxRate === null || r.taxRate === undefined ? null : num(r.taxRate);
  const paidDate = r.paidDate === null || r.paidDate === undefined ? null : day(r.paidDate);
  if (!party?.trim() || ref === null || !dueDate || dueDate < date || paid === null || paid < 0) return null;
  if (taxRate !== null && (taxRate <= 0 || taxRate > 100)) return null;
  if (r.paidDate && !paidDate) return null;
  return { line, date, dueDate, party, ref, description, amount, taxRate, paid, paidDate, category };
}
