// Local, in-browser inspection of a file a visitor drops on the homepage demo.
//
// Nothing here uploads anything: the file is read with the File API inside the
// visitor's own tab and discarded. The marketing page has no backend access to
// the real extraction pipeline (that lives behind login in /api/documents), so
// this preview is deliberately honest about what it can know:
//   • FACTS it really reads from the file (format, size, PDF page count, image
//     dimensions, CSV columns and row count, email subject/sender, chat lines);
//   • a document TYPE guessed from those facts + the file name (labelled as a guess);
//   • the ROUTE and posting TEMPLATE Finloraq would use for that type, with the
//     amounts left blank because only the live product reads them.
// `classify()` is pure so it is unit-tested without a DOM.

import type { InputKind, ModuleId, PostingLine, Trace } from "./content";

export type FileFormat = "pdf" | "image" | "spreadsheet" | "email" | "text" | "unknown";

export type DocKind =
  | "invoice"
  | "credit-note"
  | "receipt"
  | "bank-statement"
  | "purchase-order"
  | "quote"
  | "payroll"
  | "chat"
  | "email"
  | "screenshot"
  | "photo"
  | "spreadsheet"
  | "document";

export interface Signals {
  name: string;
  mime: string;
  /** CSV header cells, lower-cased. */
  headers?: readonly string[];
  emailSubject?: string;
  /** True when a .txt looks like a WhatsApp chat export. */
  chatExport?: boolean;
}

export const MAX_BYTES = 25 * 1024 * 1024;

export function detectFormat(name: string, mime: string): FileFormat {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const m = mime.toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "tif", "tiff"].includes(ext)) return "image";
  if (["csv", "tsv", "xls", "xlsx", "xlsm", "ods", "numbers"].includes(ext) || m.includes("spreadsheet") || m.includes("excel") || m === "text/csv") return "spreadsheet";
  if (["eml", "msg"].includes(ext) || m === "message/rfc822") return "email";
  if (["txt", "text"].includes(ext) || m.startsWith("text/")) return "text";
  return "unknown";
}

const has = (hay: string, ...needles: string[]) => needles.some((n) => hay.includes(n));

/** Guess the business document type from signals we genuinely have. Pure. */
export function classify(s: Signals): DocKind {
  const format = detectFormat(s.name, s.mime);
  // Normalise separators so "tax_invoice-0142" matches "tax invoice".
  const text = ` ${s.name} ${s.emailSubject ?? ""} `.toLowerCase().replace(/[_\-.]+/g, " ");
  const headers = (s.headers ?? []).map((h) => h.toLowerCase());

  if (s.chatExport || has(text, "whatsapp")) return "chat";
  if (has(text, "credit note", "creditnote", " cn ")) return "credit-note";
  if (has(text, "payslip", "payroll", "salary", "wps ")) return "payroll";
  if (has(text, "statement", "bank ", " stmt")) return "bank-statement";
  if (has(text, "purchase order", " po ", "p o ")) return "purchase-order";
  if (has(text, "quotation", "quote", "estimate", "proforma")) return "quote";
  if (has(text, "invoice", " inv ", "tax invoice", " bill ")) return "invoice";
  if (has(text, "receipt", "rcpt", "fuel", "taxi", "parking")) return "receipt";

  if (format === "spreadsheet" && headers.length) {
    const col = (...k: string[]) => headers.some((h) => k.some((x) => h.includes(x)));
    if (col("balance") || (col("date") && col("debit", "withdrawal") && col("credit", "deposit"))) return "bank-statement";
    if (col("invoice")) return "invoice";
  }
  if (format === "email") return "email";
  if (format === "image") return has(text, "screenshot", "screen shot", "capture") ? "screenshot" : "photo";
  if (format === "spreadsheet") return "spreadsheet";
  return "document";
}

interface KindTemplate {
  input: InputKind;
  title: string;
  modules: readonly ModuleId[];
  routeNote: string;
  posting: readonly PostingLine[];
  postingNote: string;
  fields: readonly string[];
  action: string;
  actionShort: string;
  response: { channel: string; text: string };
  bubble: string;
}

const PENDING = null;

const TEMPLATES: Record<DocKind, KindTemplate> = {
  invoice: {
    input: "invoice",
    title: "Invoice",
    modules: ["purchases", "sales", "taxes"],
    routeNote: "Purchases if you received it, Sales if you issued it — Finloraq checks the parties",
    posting: [
      { account: "Expense or asset account", dr: PENDING },
      { account: "VAT recoverable (input)", dr: PENDING },
      { account: "Accounts payable — supplier", cr: PENDING },
    ],
    postingNote: "Shown for a received invoice · amounts come from your document",
    fields: ["Supplier / customer", "Invoice no.", "Date & due date", "TRN", "Line items", "VAT", "Total"],
    action: "Draft bill or invoice prepared for your approval",
    actionShort: "Approve draft",
    response: { channel: "Email", text: "Acknowledgement to the other party, if your rules allow it" },
    bubble: "Invoice received",
  },
  "credit-note": {
    input: "pdf",
    title: "Credit note",
    modules: ["purchases", "suppliers", "taxes"],
    routeNote: "Matched to the original invoice, VAT adjusted",
    posting: [
      { account: "Accounts payable — supplier", dr: PENDING },
      { account: "Expense account (reversal)", cr: PENDING },
      { account: "VAT recoverable (input)", cr: PENDING },
    ],
    postingNote: "Reverses part of the original bill · amounts come from your document",
    fields: ["Supplier", "Credit note no.", "Original invoice", "VAT", "Total"],
    action: "Credit applied to the open bill after your approval",
    actionShort: "Apply credit",
    response: { channel: "Email", text: "Supplier notified the credit was applied" },
    bubble: "Credit note applied",
  },
  receipt: {
    input: "receipt",
    title: "Expense receipt",
    modules: ["expenses", "taxes"],
    routeNote: "Expense claim in Expenses, VAT split out",
    posting: [
      { account: "Expense category", dr: PENDING },
      { account: "VAT recoverable (input)", dr: PENDING },
      { account: "Card / cash / employee payable", cr: PENDING },
    ],
    postingNote: "Amounts come from your receipt",
    fields: ["Merchant", "Date", "Category", "Net", "VAT", "Total paid"],
    action: "Expense claim queued for approval",
    actionShort: "Approve claim",
    response: { channel: "WhatsApp", text: "Submitter told the claim is in" },
    bubble: "Claim submitted ✓",
  },
  "bank-statement": {
    input: "sheet",
    title: "Bank statement",
    modules: ["banking", "accounting"],
    routeNote: "Each line matched against open invoices and bills in Banking",
    posting: [
      { account: "Bank account", dr: PENDING },
      { account: "Matched receivable / payable", cr: PENDING },
    ],
    postingNote: "One entry per matched line · unmatched lines wait for review",
    fields: ["Statement period", "Opening / closing balance", "Lines", "Matches found"],
    action: "Unmatched lines flagged for your review",
    actionShort: "Review lines",
    response: { channel: "Email", text: "Payment receipts to customers whose payments matched" },
    bubble: "Payment received — thank you",
  },
  "purchase-order": {
    input: "pdf",
    title: "Purchase order",
    modules: ["purchases", "suppliers"],
    routeNote: "Stored in Purchases so the supplier's invoice can be matched to it later",
    posting: [],
    postingNote: "No posting yet — a purchase order is a commitment, not a transaction",
    fields: ["Supplier", "PO number", "Items & quantities", "Expected total"],
    action: "Ready for three-way match when the invoice arrives",
    actionShort: "Await invoice",
    response: { channel: "Email", text: "Supplier confirmation, if you choose to send it" },
    bubble: "PO confirmed",
  },
  quote: {
    input: "pdf",
    title: "Quote / estimate",
    modules: ["sales", "customers"],
    routeNote: "Linked to the customer in Sales",
    posting: [],
    postingNote: "No posting until the quote becomes an invoice",
    fields: ["Customer", "Quote no.", "Items", "Validity", "Total"],
    action: "Follow-up scheduled before the quote expires",
    actionShort: "Follow up",
    response: { channel: "WhatsApp", text: "Customer reminder, if your rules allow it" },
    bubble: "Your quote is ready",
  },
  payroll: {
    input: "sheet",
    title: "Payroll document",
    modules: ["accounting", "banking"],
    routeNote: "Salary cost and payment recorded against the payroll period",
    posting: [
      { account: "Salaries expense", dr: PENDING },
      { account: "Salaries payable", cr: PENDING },
    ],
    postingNote: "Amounts come from your document",
    fields: ["Period", "Employees", "Gross", "Deductions", "Net pay"],
    action: "Payroll journal prepared for approval",
    actionShort: "Approve payroll",
    response: { channel: "Email", text: "Internal only — no customer response" },
    bubble: "Payroll recorded",
  },
  chat: {
    input: "whatsapp",
    title: "WhatsApp conversation",
    modules: ["customers", "sales"],
    routeNote: "Linked to the customer; orders and questions extracted",
    posting: [],
    postingNote: "Posts only if the chat contains an order you approve",
    fields: ["Customer", "Intent", "Items or question", "Referenced invoices"],
    action: "Reply or quote drafted",
    actionShort: "Reply drafted",
    response: { channel: "WhatsApp", text: "Answer sent within the rules you set" },
    bubble: "Thanks — we're on it",
  },
  email: {
    input: "email",
    title: "Email",
    modules: ["customers", "sales"],
    routeNote: "Attachments read as documents; the message linked to the right customer or supplier",
    posting: [],
    postingNote: "The email itself doesn't post — its attachments might",
    fields: ["Sender", "Intent", "Attachments", "Referenced invoices"],
    action: "Reply drafted, attachments processed",
    actionShort: "Reply drafted",
    response: { channel: "Email", text: "Answer sent automatically or after your review" },
    bubble: "Thanks — here's your answer",
  },
  screenshot: {
    input: "screenshot",
    title: "Screenshot",
    modules: ["accounting"],
    routeNote: "Text read from the image, then routed like any other document",
    posting: [],
    postingNote: "Depends on what the screenshot shows",
    fields: ["Document type", "Party", "Date", "Amounts"],
    action: "Next step prepared once the content is understood",
    actionShort: "Next step ready",
    response: { channel: "Website chat", text: "Depends on the document" },
    bubble: "Got it",
  },
  photo: {
    input: "photo",
    title: "Photo of a document",
    modules: ["expenses", "purchases"],
    routeNote: "Most photos are receipts or bills — the text decides",
    posting: [
      { account: "Expense account", dr: PENDING },
      { account: "VAT recoverable (input)", dr: PENDING },
      { account: "Payment account", cr: PENDING },
    ],
    postingNote: "Shown for a receipt · amounts come from your photo",
    fields: ["Merchant / supplier", "Date", "Net", "VAT", "Total"],
    action: "Draft expense or bill prepared for approval",
    actionShort: "Approve draft",
    response: { channel: "WhatsApp", text: "Submitter told it was received" },
    bubble: "Received ✓",
  },
  spreadsheet: {
    input: "sheet",
    title: "Spreadsheet",
    modules: ["accounting"],
    routeNote: "Columns mapped to Finloraq fields, rows imported in bulk",
    posting: [],
    postingNote: "Depends on what the rows are — sales, bills or bank lines",
    fields: ["Column mapping", "Rows", "Totals check"],
    action: "Import preview prepared for your confirmation",
    actionShort: "Confirm import",
    response: { channel: "Email", text: "Internal only" },
    bubble: "Import ready",
  },
  document: {
    input: "pdf",
    title: "Business document",
    modules: ["accounting"],
    routeNote: "Routed once its content is read",
    posting: [],
    postingNote: "Depends on the document",
    fields: ["Document type", "Parties", "Dates", "Amounts"],
    action: "Next step prepared for your review",
    actionShort: "Review",
    response: { channel: "Email", text: "Depends on the document" },
    bubble: "Received",
  },
};

export interface Inspection {
  format: FileFormat;
  kind: DocKind;
  facts: Array<{ label: string; value: string }>;
  trace: Trace;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const FORMAT_LABEL: Record<FileFormat, string> = {
  pdf: "PDF",
  image: "Image",
  spreadsheet: "Spreadsheet",
  email: "Email message",
  text: "Text",
  unknown: "Unrecognised format",
};

/** Minimal CSV/TSV header split that respects double quotes. */
export function splitCsvLine(line: string): string[] {
  const delim = line.includes("\t") && !line.includes(",") ? "\t" : line.includes(";") && !line.includes(",") ? ";" : ",";
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === delim && !q) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Reads a header value (with RFC 5322 folding) from the top of an .eml file. */
export function emailHeader(raw: string, name: string): string | undefined {
  const head = raw.split(/\r?\n\r?\n/)[0] ?? "";
  const re = new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const m = head.match(re);
  return m?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim() || undefined;
}

const WHATSAPP_LINE = /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\]?\s?(?:-\s)?[^:]{1,40}:/im;

export function looksLikeWhatsAppExport(text: string): boolean {
  return WHATSAPP_LINE.test(text);
}

async function readText(file: Blob, limit: number): Promise<string> {
  return file.slice(0, limit).text();
}

/** Inspect a visitor's file locally. Never throws for bad input — returns what it could read. */
export async function inspectFile(file: File): Promise<Inspection> {
  const name = file.name || "untitled";
  const mime = file.type || "";
  const format = detectFormat(name, mime);
  const facts: Array<{ label: string; value: string }> = [
    { label: "File", value: name },
    { label: "Format", value: FORMAT_LABEL[format] },
    { label: "Size", value: formatBytes(file.size) },
  ];
  const signals: Signals = { name, mime };

  try {
    if (format === "pdf") {
      const raw = await readText(file, 8 * 1024 * 1024);
      const pages = (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      if (pages > 0) facts.push({ label: "Pages", value: String(pages) });
      if (/\/Encrypt\b/.test(raw)) facts.push({ label: "Protection", value: "Password-protected PDF" });
    } else if (format === "image" && typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      facts.push({ label: "Dimensions", value: `${bmp.width} × ${bmp.height} px` });
      bmp.close();
    } else if (format === "spreadsheet" && /\.(csv|tsv)$/i.test(name)) {
      const raw = await readText(file, 2 * 1024 * 1024);
      const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
      const header = splitCsvLine(lines[0] ?? "");
      signals.headers = header.map((h) => h.toLowerCase());
      const rows = Math.max(0, lines.length - 1);
      facts.push({ label: "Columns", value: header.slice(0, 6).join(" · ") + (header.length > 6 ? ` +${header.length - 6}` : "") });
      facts.push({ label: "Rows", value: file.size > 2 * 1024 * 1024 ? `${rows.toLocaleString("en")}+` : rows.toLocaleString("en") });
    } else if (format === "spreadsheet") {
      facts.push({ label: "Workbook", value: "Sheets and columns are read in the live product" });
    } else if (format === "email") {
      const raw = await readText(file, 256 * 1024);
      const subject = emailHeader(raw, "Subject");
      const from = emailHeader(raw, "From");
      if (subject) { signals.emailSubject = subject; facts.push({ label: "Subject", value: subject }); }
      if (from) facts.push({ label: "From", value: from });
      if (/^Content-Disposition:\s*attachment/im.test(raw)) facts.push({ label: "Attachments", value: "Yes" });
    } else if (format === "text") {
      const raw = await readText(file, 512 * 1024);
      if (looksLikeWhatsAppExport(raw)) {
        signals.chatExport = true;
        const msgs = raw.split(/\r?\n/).filter((l) => WHATSAPP_LINE.test(l)).length;
        facts.push({ label: "Chat messages", value: msgs.toLocaleString("en") });
      } else {
        const first = raw.split(/\r?\n/).find((l) => l.trim() !== "");
        if (first) facts.push({ label: "First line", value: first.slice(0, 80) });
      }
    }
  } catch {
    facts.push({ label: "Note", value: "Some details could not be read in the browser" });
  }

  const kind = classify(signals);
  const t = TEMPLATES[kind];
  return {
    format,
    kind,
    facts,
    trace: {
      input: format === "image" && t.input === "pdf" ? "photo" : t.input,
      detected: t.title,
      detectedNote: "Best guess from the file itself and its name — the live product reads the content",
      fields: t.fields.map((label) => ({ label, value: "Read in the live product" })),
      fieldsAreDemo: false,
      modules: t.modules,
      routeNote: t.routeNote,
      posting: t.posting,
      postingNote: t.postingNote,
      action: t.action,
      actionShort: t.actionShort,
      response: t.response,
      bubble: t.bubble,
    },
  };
}
