import { createHash } from "node:crypto";
import type { AccountType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requirePermission, ForbiddenError } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { postJournalEntry, DuplicatePostingError, PeriodLockedError, InvalidLineError, UnbalancedEntryError, type LineInput } from "@/lib/ledger";
import { createInvoice, postInvoiceToLedger, recordInvoicePayment } from "@/lib/sales";
import { createBill, approveAndPostBill, recordSupplierPayment } from "@/lib/purchases";
import { createCustomer, createSupplier } from "@/lib/parties";
import { parseIsoDay } from "@/lib/periods";
import { rowKeys, type DocRow, type ImportKind, type ImportRow, type TxnRow } from "./rows";

/**
 * Posting side of "Import past data". Every row goes through the same
 * posting engine as a hand-entered record (src/lib/ledger.ts), so the
 * double-entry check, period locks, permissions and audit trail all apply —
 * the only difference is the date comes from the sheet.
 */

export const refFor = (key: string) => "import:" + createHash("sha256").update(key).digest("hex").slice(0, 32);

type Ctx = { companyId: string; membershipId: string; userId: string };

// ------------------------------------------------------------------ accounts & parties

interface AccountLite { code: string; name: string; type: AccountType; isActive: boolean }

/** Finds the account a sheet's Category means — by code, then by name — for the right side of the ledger. */
function matchAccount(accounts: AccountLite[], category: string, type: "REVENUE" | "EXPENSE"): AccountLite | undefined {
  const c = category.trim().toLowerCase();
  if (!c) return undefined;
  const byCode = accounts.find((a) => a.code.toLowerCase() === c || c.startsWith(a.code.toLowerCase() + " "));
  if (byCode) return byCode;
  return accounts.find((a) => a.type === type && a.name.toLowerCase() === c)
    ?? accounts.find((a) => a.name.toLowerCase() === c);
}

export interface Preview {
  keys: string[];
  duplicates: boolean[];
  /** Category → what happens to it. */
  accounts: { category: string; type: "income" | "expense"; code: string | null; name: string; create: boolean; problem?: string }[];
  newParties: string[];
  lockedPeriods: string[];
  byYear: { year: string; income: number; expense: number; count: number }[];
}

/** Everything the preview needs to say before anything is written. */
export async function previewImport(ctx: Ctx, kind: ImportKind, rows: ImportRow[]): Promise<Preview> {
  const keys = rowKeys(kind, rows);
  const refs = keys.map(refFor);

  let existing = new Set<string>();
  if (kind === "transactions") {
    const found = await prisma.journalEntry.findMany({ where: { companyId: ctx.companyId, sourceId: { in: refs } }, select: { sourceId: true } });
    existing = new Set(found.map((f) => f.sourceId ?? ""));
  } else if (kind === "invoices") {
    const found = await prisma.invoice.findMany({ where: { companyId: ctx.companyId, importRef: { in: refs } }, select: { importRef: true } });
    existing = new Set(found.map((f) => f.importRef ?? ""));
  } else {
    const found = await prisma.bill.findMany({ where: { companyId: ctx.companyId, importRef: { in: refs } }, select: { importRef: true } });
    existing = new Set(found.map((f) => f.importRef ?? ""));
  }

  const accounts = await prisma.account.findMany({ where: { companyId: ctx.companyId }, select: { code: true, name: true, type: true, isActive: true } });
  const cats = new Map<string, Preview["accounts"][number]>();
  for (const r of rows) {
    if (kind === "invoices") continue;
    const type: "income" | "expense" = "type" in r ? r.type : "expense";
    const k = `${type}|${r.category.toLowerCase()}`;
    if (cats.has(k)) continue;
    const want = type === "income" ? "REVENUE" : "EXPENSE";
    const m = matchAccount(accounts, r.category, want);
    const fallback = type === "income" ? "4000" : "5000";
    if (!r.category) {
      const a = accounts.find((x) => x.code === fallback);
      cats.set(k, { category: "(no category)", type, code: fallback, name: a?.name ?? fallback, create: false });
    } else if (m) {
      cats.set(k, {
        category: r.category, type, code: m.code, name: m.name, create: false,
        problem: !m.isActive ? `Account ${m.code} is inactive` : m.code === "1000" ? "Bank can't be the category" : undefined,
      });
    } else {
      cats.set(k, { category: r.category, type, code: null, name: r.category, create: true });
    }
  }

  let newParties: string[] = [];
  if (kind !== "transactions") {
    const names = [...new Set(rows.map((r) => (r as DocRow).party.trim()))];
    const lower = names.map((n) => n.toLowerCase());
    const found = kind === "invoices"
      ? await prisma.customer.findMany({ where: { companyId: ctx.companyId }, select: { name: true } })
      : await prisma.supplier.findMany({ where: { companyId: ctx.companyId }, select: { name: true } });
    const have = new Set(found.map((f) => f.name.trim().toLowerCase()));
    newParties = names.filter((_, i) => !have.has(lower[i]!));
  }

  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))];
  const locked = await prisma.accountingPeriod.findMany({
    where: { companyId: ctx.companyId, name: { in: months }, status: "LOCKED" },
    select: { name: true },
  });

  const years = new Map<string, { income: number; expense: number; count: number }>();
  for (const r of rows) {
    const y = r.date.slice(0, 4);
    const t = years.get(y) ?? { income: 0, expense: 0, count: 0 };
    const isIncome = "type" in r ? r.type === "income" : kind === "invoices";
    const gross = "type" in r ? r.amount : r.amount * (1 + (r.taxRate ?? 0) / 100);
    if (isIncome) t.income += gross; else t.expense += gross;
    t.count++;
    years.set(y, t);
  }

  return {
    keys,
    duplicates: refs.map((r) => existing.has(r)),
    accounts: [...cats.values()],
    newParties,
    lockedPeriods: locked.map((l) => l.name),
    byYear: [...years.entries()].sort().map(([year, t]) => ({ year, ...t, income: Math.round(t.income * 100) / 100, expense: Math.round(t.expense * 100) / 100 })),
  };
}

/** Next free numeric code in a range (4xxx income, 5xxx/6xxx expenses). */
function nextCode(taken: Set<string>, start: number, end: number): string | null {
  for (let n = start; n <= end; n += 10) if (!taken.has(String(n))) return String(n);
  for (let n = start; n <= end; n++) if (!taken.has(String(n))) return String(n);
  return null;
}

async function resolveAccount(ctx: Ctx, category: string, type: "income" | "expense", cache: Map<string, string>): Promise<string> {
  const key = `${type}|${category.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const want = type === "income" ? "REVENUE" : "EXPENSE";
  const fallback = type === "income" ? "4000" : "5000";
  if (!category.trim()) { cache.set(key, fallback); return fallback; }

  const accounts = await prisma.account.findMany({ where: { companyId: ctx.companyId }, select: { code: true, name: true, type: true, isActive: true } });
  const m = matchAccount(accounts, category, want);
  if (m) {
    if (!m.isActive) throw new InvalidLineError(`Account ${m.code} (${m.name}) is inactive.`);
    if (m.code === "1000") throw new InvalidLineError("Bank can't be used as the category.");
    cache.set(key, m.code);
    return m.code;
  }
  // A new category becomes a new account — the same thing an accountant would
  // add by hand. Creating accounts is a settings-level change.
  if (!(await can(ctx.membershipId, "settings", "EDIT"))) {
    throw new InvalidLineError(`No account called "${category}" — ask an admin to add it, or change the category to an existing account.`);
  }
  const taken = new Set<string>(accounts.map((a) => a.code));
  const code = type === "income" ? nextCode(taken, 4010, 4999) : nextCode(taken, 5010, 6999);
  if (!code) throw new InvalidLineError("No free account code left for a new category.");
  try {
    await prisma.account.create({ data: { companyId: ctx.companyId, code, name: category.trim().slice(0, 80), type: want } });
    await recordAuditEvent({ companyId: ctx.companyId, userId: ctx.userId, action: "account.created", entityType: "Account", entityId: code, newValue: { code, name: category, type: want, source: "import" } });
  } catch {
    // A parallel chunk created it first — use whatever now exists.
    const again = await prisma.account.findMany({ where: { companyId: ctx.companyId }, select: { code: true, name: true, type: true, isActive: true } });
    const m2 = matchAccount(again, category, want);
    if (!m2) throw new InvalidLineError(`Couldn't create an account for "${category}".`);
    cache.set(key, m2.code);
    return m2.code;
  }
  cache.set(key, code);
  return code;
}

async function resolveParty(ctx: Ctx, kind: "invoices" | "bills", name: string, cache: Map<string, string>): Promise<string> {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const list = kind === "invoices"
    ? await prisma.customer.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } })
    : await prisma.supplier.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } });
  const found = list.find((p) => p.name.trim().toLowerCase() === key);
  const id = found?.id ?? (kind === "invoices"
    ? (await createCustomer({ ...ctx, name: name.trim() })).id
    : (await createSupplier({ ...ctx, name: name.trim() })).id);
  cache.set(key, id);
  return id;
}

async function taxCodeFor(companyId: string, rate: number | null, cache: Map<string, string | undefined>): Promise<string | undefined> {
  if (!rate) return undefined;
  const k = String(rate);
  if (cache.has(k)) return cache.get(k);
  const codes = await prisma.taxCode.findMany({ where: { companyId, isActive: true }, select: { id: true, rate: true } });
  const hit = codes.find((c) => Math.abs(Number(c.rate) * 100 - rate) < 0.001);
  if (!hit) throw new InvalidLineError(`No tax code at ${rate}% — add one under Taxes first, or leave the tax rate blank.`);
  cache.set(k, hit.id);
  return hit.id;
}

// ------------------------------------------------------------------ commit

export type RowResult = { line: number; status: "imported" | "duplicate" | "failed"; message?: string };

function explain(err: unknown): string {
  if (err instanceof PeriodLockedError || err instanceof InvalidLineError || err instanceof UnbalancedEntryError || err instanceof ForbiddenError) return err.message;
  console.error("[import] row failed", err);
  return "Couldn't save this row.";
}

/**
 * Posts one chunk of already-validated rows. `keys` are the row fingerprints
 * from the preview (computed over the whole sheet, so identical rows keep
 * their occurrence number across chunks) — the server recomputes nothing from
 * them except the hashed reference, and a key only ever skips a row, never
 * changes what's posted.
 */
export async function commitRows(ctx: Ctx & { currency: string }, kind: ImportKind, rows: ImportRow[], keys: string[]): Promise<RowResult[]> {
  if (kind === "transactions") await requirePermission(ctx.membershipId, "journals", "APPROVE");
  if (kind === "invoices") await requirePermission(ctx.membershipId, "invoices", "CREATE");
  if (kind === "bills") await requirePermission(ctx.membershipId, "bills", "APPROVE");

  const accountCache = new Map<string, string>();
  const partyCache = new Map<string, string>();
  const taxCache = new Map<string, string | undefined>();
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const key = keys[i];
    if (!key || !parseIsoDay(row.date)) { results.push({ line: row.line, status: "failed", message: "Invalid row." }); continue; }
    const ref = refFor(key);
    const date = parseIsoDay(row.date)!;
    try {
      if (kind === "transactions") {
        const r = row as TxnRow;
        const account = await resolveAccount(ctx, r.category, r.type, accountCache);
        const net = Math.round((r.amount - r.tax) * 100) / 100;
        const lines: LineInput[] = r.type === "income"
          ? [
              { accountCode: "1000", debit: r.amount, description: "Bank" },
              { accountCode: account, credit: net, description: r.description || r.category || "Income" },
              ...(r.tax ? [{ accountCode: "2100", credit: r.tax, description: "Output Tax Payable" }] : []),
            ]
          : [
              { accountCode: account, debit: net, description: r.description || r.category || "Expense" },
              ...(r.tax ? [{ accountCode: "1200", debit: r.tax, description: "Input Tax Receivable" }] : []),
              { accountCode: "1000", credit: r.amount, description: "Bank" },
            ];
        await postJournalEntry({
          ...ctx,
          date,
          sourceType: r.type === "income" ? "RECEIPT" : "EXPENSE",
          sourceId: ref,
          memo: (r.description || r.category || (r.type === "income" ? "Income" : "Expense")) + " (imported)",
          currency: ctx.currency,
          lines,
          post: true,
        });
      } else {
        const r = row as DocRow;
        const due = parseIsoDay(r.dueDate) ?? date;
        const taxCodeId = await taxCodeFor(ctx.companyId, r.taxRate, taxCache);
        const description = [r.description || (kind === "invoices" ? "Imported invoice" : "Imported bill"), r.ref ? `(ref ${r.ref})` : ""].filter(Boolean).join(" ");
        const line = { description, quantity: 1, unitPrice: r.amount, taxCodeId };

        if (kind === "invoices") {
          if (await prisma.invoice.findFirst({ where: { companyId: ctx.companyId, importRef: ref }, select: { id: true } })) { results.push({ line: r.line, status: "duplicate" }); continue; }
          const customerId = await resolveParty(ctx, "invoices", r.party, partyCache);
          const inv = await createInvoice({ ...ctx, customerId, issueDate: date, dueDate: due, currency: ctx.currency, lines: [line] });
          await prisma.invoice.update({ where: { id: inv.id }, data: { importRef: ref } });
          try {
            await postInvoiceToLedger({ ...ctx, invoiceId: inv.id });
          } catch (e) {
            // Nothing reached the ledger — remove the draft so a retry isn't mistaken for a duplicate.
            await prisma.invoice.delete({ where: { id: inv.id } }).catch(() => undefined);
            throw e;
          }
          if (r.paid > 0) {
            await recordInvoicePayment({ ...ctx, invoiceId: inv.id, amount: Math.min(r.paid, inv.total.toNumber()), date: parseIsoDay(r.paidDate ?? r.date) ?? date });
          }
        } else {
          if (await prisma.bill.findFirst({ where: { companyId: ctx.companyId, importRef: ref }, select: { id: true } })) { results.push({ line: r.line, status: "duplicate" }); continue; }
          const supplierId = await resolveParty(ctx, "bills", r.party, partyCache);
          const expenseAccountCode = await resolveAccount(ctx, r.category, "expense", accountCache);
          const bill = await createBill({ ...ctx, supplierId, issueDate: date, dueDate: due, currency: ctx.currency, lines: [line] });
          await prisma.bill.update({ where: { id: bill.id }, data: { importRef: ref } });
          try {
            await approveAndPostBill({ ...ctx, billId: bill.id, expenseAccountCode });
          } catch (e) {
            await prisma.bill.delete({ where: { id: bill.id } }).catch(() => undefined);
            throw e;
          }
          if (r.paid > 0) {
            await recordSupplierPayment({ ...ctx, billId: bill.id, amount: Math.min(r.paid, bill.total.toNumber()), date: parseIsoDay(r.paidDate ?? r.date) ?? date });
          }
        }
      }
      results.push({ line: row.line, status: "imported" });
    } catch (err) {
      if (err instanceof DuplicatePostingError) results.push({ line: row.line, status: "duplicate" });
      else results.push({ line: row.line, status: "failed", message: explain(err) });
    }
  }

  const imported = results.filter((r) => r.status === "imported").length;
  if (imported) {
    await recordAuditEvent({
      companyId: ctx.companyId, userId: ctx.userId, action: "import.rows_posted", entityType: "Import", entityId: kind,
      newValue: { kind, imported, duplicates: results.filter((r) => r.status === "duplicate").length, failed: results.filter((r) => r.status === "failed").length },
      source: "web",
    });
  }
  return results;
}
