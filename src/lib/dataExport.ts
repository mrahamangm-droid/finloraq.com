import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { buildZip, type ZipEntry } from "@/lib/zip";

/**
 * Full company data export (backup): one CSV per core table, zipped.
 *
 * Every table is read with an explicit company scope — directly on
 * companyId, or through the parent row for line/transaction tables, which
 * have no companyId of their own. Columns come from the Prisma schema, so a
 * column added later is exported without touching this file; credentials
 * (portal tokens, anything named token/secret/hash/password) never are.
 */

type Where = (companyId: string) => Record<string, unknown>;

interface ExportTable {
  file: string;
  model: Prisma.ModelName;
  where: Where;
}

export const EXPORT_TABLES: ExportTable[] = [
  { file: "accounts.csv", model: "Account", where: (companyId) => ({ companyId }) },
  { file: "journal_entries.csv", model: "JournalEntry", where: (companyId) => ({ companyId }) },
  { file: "journal_lines.csv", model: "JournalLine", where: (companyId) => ({ journalEntry: { companyId } }) },
  { file: "invoices.csv", model: "Invoice", where: (companyId) => ({ companyId }) },
  { file: "invoice_lines.csv", model: "InvoiceLine", where: (companyId) => ({ invoice: { companyId } }) },
  { file: "bills.csv", model: "Bill", where: (companyId) => ({ companyId }) },
  { file: "bill_lines.csv", model: "BillLine", where: (companyId) => ({ bill: { companyId } }) },
  { file: "customers.csv", model: "Customer", where: (companyId) => ({ companyId }) },
  { file: "suppliers.csv", model: "Supplier", where: (companyId) => ({ companyId }) },
  { file: "tax_codes.csv", model: "TaxCode", where: (companyId) => ({ companyId }) },
  { file: "bank_accounts.csv", model: "BankAccount", where: (companyId) => ({ companyId }) },
  { file: "bank_transactions.csv", model: "BankTransaction", where: (companyId) => ({ bankAccount: { companyId } }) },
];

const SENSITIVE = /token|secret|hash|password/i;

/** Columns exported for a model: every scalar/enum field in schema order, minus credentials. */
export function exportColumns(model: Prisma.ModelName): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) throw new Error(`Unknown model ${model}`);
  return m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !SENSITIVE.test(f.name)).map((f) => f.name);
}

/**
 * One CSV cell. Money/Decimal values are written with Decimal#toFixed() —
 * the exact stored value, never via a float and never in exponent form.
 * Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the
 * start) gets a leading apostrophe, unless it's a plain number like "-12.50".
 */
export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (Prisma.Decimal.isDecimal(value)) s = (value as Prisma.Decimal).toFixed();
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const out = [columns.map(csvCell).join(",")];
  for (const r of rows) out.push(columns.map((c) => csvCell(r[c])).join(","));
  return out.join("\r\n") + "\r\n";
}

/** Shows only the last 4 digits of a bank account number, the same rule the UI follows. */
function maskAccountNumber(row: Record<string, unknown>) {
  const n = row.accountNumber;
  if (typeof n === "string" && n.length > 4) row.accountNumber = `****${n.slice(-4)}`;
}

const BATCH = 5000;

type Delegate = { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };

async function readAll(table: ExportTable, companyId: string, columns: string[]) {
  const delegate = (prisma as unknown as Record<string, Delegate>)[table.model.charAt(0).toLowerCase() + table.model.slice(1)];
  if (!delegate) throw new Error(`No Prisma delegate for ${table.model}`);
  const select = Object.fromEntries(columns.map((c) => [c, true]));
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  // id-cursor batches: bounded memory per query and a stable order.
  for (;;) {
    const batch = await delegate.findMany({
      where: table.where(companyId),
      select,
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    rows.push(...batch);
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1]!.id as string;
  }
  return rows;
}

/** Builds the archive for one company. Pure read; permission and audit live in exportCompanyData(). */
export async function buildCompanyExport(companyId: string, now = new Date()) {
  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};
  for (const table of EXPORT_TABLES) {
    const columns = exportColumns(table.model);
    const rows = await readAll(table, companyId, columns);
    if (table.model === "BankAccount") rows.forEach(maskAccountNumber);
    counts[table.file] = rows.length;
    entries.push({ name: table.file, data: toCsv(columns, rows) });
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, baseCurrency: true } });
  const readme = [
    `Finloraq data export — ${company.name}`,
    `Exported at: ${now.toISOString()}`,
    `Base currency: ${company.baseCurrency}`,
    "",
    "One CSV per table (UTF-8, comma-separated, RFC 4180 quoting). Amounts are exact decimals",
    "as stored; dates are ISO 8601 UTC. Rows link by id columns (e.g. journal_lines.journalEntryId",
    "-> journal_entries.id). Bank account numbers show the last 4 digits only.",
    "",
    "Rows per file:",
    ...Object.entries(counts).map(([f, n]) => `  ${f}: ${n}`),
    "",
  ].join("\r\n");
  entries.unshift({ name: "README.txt", data: readme });
  return { zip: buildZip(entries, now), counts };
}

/**
 * Exports the caller's own company. A full export reads every core table,
 * so it needs settings:EXPORT (Company Admin by default) and is audit-logged
 * with who ran it and how many rows each file held.
 */
export async function exportCompanyData(params: { companyId: string; membershipId: string; userId: string }) {
  await requirePermission(params.membershipId, "settings", "EXPORT");
  const now = new Date();
  const { zip, counts } = await buildCompanyExport(params.companyId, now);
  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "company.data_exported",
    entityType: "Company",
    entityId: params.companyId,
    newValue: { files: counts, bytes: zip.length },
  });
  return { zip, exportedAt: now };
}
