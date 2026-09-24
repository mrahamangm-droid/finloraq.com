import type { Prisma, JournalSourceType, CompanyRole } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { sum, isZero, money } from "@/lib/currency";
import { recordAuditEvent } from "@/lib/audit";
import { can } from "@/lib/rbac";

/**
 * ============================================================================
 * PHASE 2 — DOUBLE-ENTRY POSTING ENGINE
 * ============================================================================
 * This is the only place in the codebase allowed to write to JournalEntry /
 * JournalLine. Invoices, bills, payments, expenses etc. never write journal
 * rows themselves — they call postJournalEntry() (or a builder below) so the
 * debit=credit invariant, period-lock check, permission check, duplicate
 * prevention and audit trail are enforced in exactly one place.
 *
 * Rules enforced here (per spec section 6):
 *  - TOTAL DEBITS = TOTAL CREDITS, always, checked before any DB write.
 *  - All posting happens server-side inside a DB transaction — never
 *    computed/trusted from the client.
 *  - Posted entries are immutable. There is no updateJournalEntry() or
 *    deleteJournalEntry() export. Corrections are reversal entries.
 *  - Sequential, gapless entry numbering per company.
 *  - The accounting period must be OPEN.
 *  - The acting user must hold the required RBAC permission.
 *  - The same source document can't post twice (duplicate prevention).
 */

export class UnbalancedEntryError extends Error {
  constructor(debits: Decimal, credits: Decimal) {
    super(`Journal entry is not balanced: debits ${debits.toFixed(2)} ≠ credits ${credits.toFixed(2)}.`);
    this.name = "UnbalancedEntryError";
  }
}
export class PeriodLockedError extends Error {
  constructor(periodName: string) {
    super(`Accounting period ${periodName} is locked and cannot accept new postings.`);
    this.name = "PeriodLockedError";
  }
}
export class DuplicatePostingError extends Error {
  constructor(sourceType: string, sourceId: string) {
    super(`${sourceType} ${sourceId} has already been posted.`);
    this.name = "DuplicatePostingError";
  }
}
export class InvalidLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLineError";
  }
}

export interface LineInput {
  accountCode: string;
  debit?: Decimal.Value;
  credit?: Decimal.Value;
  costCentreId?: string;
  departmentId?: string;
  projectId?: string;
  description?: string;
}

export interface PostJournalEntryInput {
  companyId: string;
  membershipId: string;
  userId: string;
  date: Date;
  sourceType: JournalSourceType;
  sourceId?: string;
  memo?: string;
  currency: string;
  exchangeRate?: Decimal.Value;
  lines: LineInput[];
  /** DRAFT entries skip the APPROVE permission check and the duplicate
   *  check still applies once posted, not while draft. */
  post: boolean;
}

/** Pure — no I/O. This is what src/lib/ledger.test.ts exercises directly,
 *  so the core invariant is verified without needing a database. */
export function validateBalanced(lines: LineInput[]): { debits: Decimal; credits: Decimal } {
  if (lines.length < 2) {
    throw new InvalidLineError("A journal entry needs at least two lines.");
  }

  for (const line of lines) {
    const debit = money(line.debit ?? 0);
    const credit = money(line.credit ?? 0);
    if (debit.isNegative() || credit.isNegative()) {
      throw new InvalidLineError("Journal line amounts cannot be negative.");
    }
    if (!debit.isZero() && !credit.isZero()) {
      throw new InvalidLineError("A journal line cannot have both a debit and a credit.");
    }
    if (debit.isZero() && credit.isZero()) {
      throw new InvalidLineError("A journal line must have a nonzero debit or credit.");
    }
  }

  const debits = sum(lines.map((l) => l.debit ?? 0));
  const credits = sum(lines.map((l) => l.credit ?? 0));

  if (!debits.equals(credits)) {
    throw new UnbalancedEntryError(debits, credits);
  }

  return { debits, credits };
}

async function nextEntryNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  // Serialize numbering per company within the transaction so concurrent
  // posts can't race to the same number. A Postgres advisory lock scoped to
  // this transaction (released automatically on commit/rollback) is a
  // pragmatic stand-in for a dedicated per-company sequence; swap for a real
  // `CREATE SEQUENCE` per company if postings-per-second ever gets high
  // enough for advisory-lock contention to matter.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;

  const last = await tx.journalEntry.findFirst({
    where: { companyId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });

  const lastN = last ? parseInt(last.entryNumber.replace(/\D/g, ""), 10) || 0 : 0;
  return `JE-${String(lastN + 1).padStart(6, "0")}`;
}

async function findOpenPeriod(tx: Prisma.TransactionClient, companyId: string, date: Date) {
  const period = await tx.accountingPeriod.findFirst({
    where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (!period) {
    // Periods are monthly and created on demand: onboarding only opens the
    // signup month, so without this every later month — and any imported
    // history from earlier years — would be rejected. A period an admin has
    // LOCKED still blocks postings below; only a missing one is created.
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const name = `${y}-${String(m + 1).padStart(2, "0")}`;
    return tx.accountingPeriod.upsert({
      where: { companyId_name: { companyId, name } },
      create: {
        companyId,
        name,
        startDate: new Date(Date.UTC(y, m, 1)),
        endDate: new Date(Date.UTC(y, m + 1, 1) - 1),
      },
      update: {},
    }).then((p) => {
      if (p.status === "LOCKED") throw new PeriodLockedError(p.name);
      return p;
    });
  }
  if (period.status === "LOCKED") {
    throw new PeriodLockedError(period.name);
  }
  return period;
}

/**
 * The single entry point for writing accounting entries. Builders below
 * (buildInvoicePosting, etc.) produce the `lines` array; this function does
 * every check and the atomic write.
 */
export async function postJournalEntry(input: PostJournalEntryInput) {
  const { debits, credits } = validateBalanced(input.lines);

  if (input.post) {
    const allowed = await can(input.membershipId, "journals", "APPROVE");
    if (!allowed) {
      throw new InvalidLineError("Posting a journal entry requires the APPROVE permission on Journals.");
    }
  } else {
    const allowed = await can(input.membershipId, "journals", "CREATE");
    if (!allowed) {
      throw new InvalidLineError("Creating a journal entry requires the CREATE permission on Journals.");
    }
  }

  if (input.sourceId) {
    const existing = await prisma.journalEntry.findFirst({
      where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId },
    });
    if (existing) {
      throw new DuplicatePostingError(input.sourceType, input.sourceId);
    }
  }

  const entry = await prisma.$transaction(async (tx) => {
    const period = await findOpenPeriod(tx, input.companyId, input.date);

    const accounts = await tx.account.findMany({
      where: { companyId: input.companyId, code: { in: input.lines.map((l) => l.accountCode) }, isActive: true },
    });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));
    for (const line of input.lines) {
      if (!accountByCode.has(line.accountCode)) {
        throw new InvalidLineError(`Unknown or inactive account code: ${line.accountCode}`);
      }
    }

    const entryNumber = await nextEntryNumber(tx, input.companyId);

    const created = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        periodId: period.id,
        entryNumber,
        date: input.date,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        memo: input.memo,
        status: input.post ? "POSTED" : "DRAFT",
        currency: input.currency,
        exchangeRate: input.exchangeRate ?? 1,
        postedAt: input.post ? new Date() : null,
        postedBy: input.post ? input.userId : null,
        createdBy: input.userId,
        lines: {
          create: input.lines.map((l) => ({
            accountId: accountByCode.get(l.accountCode)!.id,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            costCentreId: l.costCentreId,
            departmentId: l.departmentId,
            projectId: l.projectId,
            description: l.description,
          })),
        },
      },
      include: { lines: true },
    });

    return created;
  });

  await recordAuditEvent({
    companyId: input.companyId,
    userId: input.userId,
    action: input.post ? "journal.post" : "journal.draft",
    entityType: "JournalEntry",
    entityId: entry.id,
    newValue: { entryNumber: entry.entryNumber, debits: debits.toFixed(2), credits: credits.toFixed(2) },
    source: "web",
  });

  return entry;
}

/**
 * Transitions an existing DRAFT entry to POSTED in place. This is the one
 * permitted mutation of a JournalEntry row — a DRAFT hasn't been posted
 * yet, so "posted entries are immutable" doesn't apply to it. Once this
 * returns, the row is POSTED and this function (and nothing else) will
 * ever touch it again.
 */
export async function postDraftJournalEntry(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
}) {
  const allowed = await can(params.membershipId, "journals", "APPROVE");
  if (!allowed) {
    throw new InvalidLineError("Posting a journal entry requires the APPROVE permission on Journals.");
  }

  const draft = await prisma.journalEntry.findFirstOrThrow({
    where: { id: params.journalEntryId, companyId: params.companyId },
  });
  if (draft.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft entry can be posted.");
  }

  const posted = await prisma.$transaction(async (tx) => {
    await findOpenPeriod(tx, params.companyId, draft.date); // re-check: period may have locked since the draft was saved
    return tx.journalEntry.update({
      where: { id: draft.id },
      data: { status: "POSTED", postedAt: new Date(), postedBy: params.userId },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "journal.post_draft",
    entityType: "JournalEntry",
    entityId: posted.id,
    newValue: { entryNumber: posted.entryNumber },
  });

  return posted;
}

/**
 * Corrections only — posted entries are never edited or deleted. Creates a
 * new POSTED entry with every line's debit/credit swapped, linked via
 * reversalOfId. The original row is never touched, so "immutable once
 * posted" holds literally, not just by convention.
 */
export async function reverseJournalEntry(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
  memo?: string;
}) {
  const allowed = await can(params.membershipId, "journals", "APPROVE");
  if (!allowed) {
    throw new InvalidLineError("Reversing a journal entry requires the APPROVE permission on Journals.");
  }

  const original = await prisma.journalEntry.findFirstOrThrow({
    where: { id: params.journalEntryId, companyId: params.companyId },
    include: { lines: true },
  });

  if (original.status !== "POSTED") {
    throw new InvalidLineError("Only a posted entry can be reversed.");
  }

  const accounts = await prisma.account.findMany({
    where: { id: { in: original.lines.map((l) => l.accountId) } },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const reversalLines: LineInput[] = original.lines.map((l) => ({
    accountCode: accountById.get(l.accountId)!.code,
    debit: l.credit, // swapped
    credit: l.debit,
    costCentreId: l.costCentreId ?? undefined,
    departmentId: l.departmentId ?? undefined,
    projectId: l.projectId ?? undefined,
    description: l.description ?? undefined,
  }));

  return postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: new Date(),
    sourceType: "REVERSAL",
    sourceId: original.id, // duplicate-prevention keys off (REVERSAL, original.id) — one reversal per entry
    memo: params.memo ?? `Reversal of ${original.entryNumber}`,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    lines: reversalLines,
    post: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Builders — turn a source document into a balanced line set per the exact
// postings the spec's section 6 specifies. These are pure functions (no DB
// writes) so they're independently unit-testable.
// ─────────────────────────────────────────────────────────────────────────

/** Invoice: DR Accounts Receivable, CR Revenue, CR Output Tax */
export function buildInvoicePosting(input: {
  subtotal: Decimal.Value;
  taxTotal: Decimal.Value;
  total: Decimal.Value;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: "1100", debit: input.total, description: "Accounts Receivable" },
    { accountCode: "4000", credit: input.subtotal, description: "Sales Revenue" },
  ];
  if (!isZero(input.taxTotal)) {
    lines.push({ accountCode: "2100", credit: input.taxTotal, description: "Output Tax Payable" });
  }
  return lines;
}

/** Customer payment: DR Bank, CR Accounts Receivable */
export function buildInvoicePaymentPosting(input: { amount: Decimal.Value }): LineInput[] {
  return [
    { accountCode: "1000", debit: input.amount, description: "Bank" },
    { accountCode: "1100", credit: input.amount, description: "Accounts Receivable" },
  ];
}

/** Supplier bill: DR Expense, DR Input Tax, CR Accounts Payable */
export function buildBillPosting(input: {
  subtotal: Decimal.Value;
  taxTotal: Decimal.Value;
  total: Decimal.Value;
  expenseAccountCode?: string;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: input.expenseAccountCode ?? "5000", debit: input.subtotal, description: "Expense" },
  ];
  if (!isZero(input.taxTotal)) {
    lines.push({ accountCode: "1200", debit: input.taxTotal, description: "Input Tax Receivable" });
  }
  lines.push({ accountCode: "2000", credit: input.total, description: "Accounts Payable" });
  return lines;
}

/** Supplier payment: DR Accounts Payable, CR Bank */
export function buildSupplierPaymentPosting(input: { amount: Decimal.Value }): LineInput[] {
  return [
    { accountCode: "2000", debit: input.amount, description: "Accounts Payable" },
    { accountCode: "1000", credit: input.amount, description: "Bank" },
  ];
}

/** Employee/direct expense paid from the bank immediately: DR Expense, DR
 *  Input Tax, CR Bank. (Distinct from a Bill, which goes through Accounts
 *  Payable because it isn't paid yet.) */
export function buildExpensePosting(input: {
  amount: Decimal.Value;
  taxAmount?: Decimal.Value;
  expenseAccountCode?: string;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: input.expenseAccountCode ?? "5000", debit: input.amount, description: "Expense" },
  ];
  if (input.taxAmount && !isZero(input.taxAmount)) {
    lines.push({ accountCode: "1200", debit: input.taxAmount, description: "Input Tax Receivable" });
  }
  const total = money(input.amount).plus(input.taxAmount ?? 0);
  lines.push({ accountCode: "1000", credit: total, description: "Bank" });
  return lines;
}
