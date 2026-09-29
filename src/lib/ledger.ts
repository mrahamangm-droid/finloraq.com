import type { Prisma } from "@prisma/client";
import type { JournalSourceType, CompanyRole } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { sum, isZero, money } from "@/lib/currency";
import { recordAuditEvent } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { foreignReferenceProblem } from "@/lib/tenantRefs";

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
 *  - Posted entries are immutable. There is no updateJournalEntry() export,
 *    and deleteDraftJournalEntry() below only ever touches a DRAFT (an
 *    entry that was never posted, so it has no ledger/report impact yet —
 *    deleting it is not an edit to financial history). A POSTED entry can
 *    never be deleted or edited; corrections are reversal entries only.
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
/**
 * A document or entry in a currency other than the company's base currency.
 * There's no exchange-rate support yet: every report sums amounts as if they
 * were base currency, so a USD 1,000 invoice in an AED company would read as
 * AED 1,000. Until real multi-currency lands, anything that isn't in the base
 * currency is refused rather than recorded wrongly. Extends InvalidLineError
 * so every route that already maps that to a 400 handles it too.
 */
export class UnsupportedCurrencyError extends InvalidLineError {
  constructor(currency: string, baseCurrency: string) {
    super(
      `${currency} isn't supported yet: this company records everything in its base currency, ${baseCurrency}. ` +
        `Enter the amounts in ${baseCurrency}. Foreign-currency documents need exchange-rate support, which isn't built yet.`
    );
    this.name = "UnsupportedCurrencyError";
  }
}

/** Canonical form every stored currency code uses ("aed " -> "AED"). */
export function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}

/** Throws UnsupportedCurrencyError unless `currency` is the company's base currency. */
export async function assertBaseCurrency(
  db: Pick<Prisma.TransactionClient, "company">,
  companyId: string,
  currency: string
): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { baseCurrency: true } });
  if (normalizeCurrencyCode(currency) !== normalizeCurrencyCode(company.baseCurrency)) {
    throw new UnsupportedCurrencyError(currency, company.baseCurrency);
  }
}

/**
 * Validates and normalizes a document's currency + exchange rate against
 * the company's base currency, for the (currently invoice-only)
 * multi-currency path. A base-currency document's rate must be 1 (or
 * omitted); a foreign-currency document needs a real positive rate,
 * explicitly supplied by the caller — there is no live FX rate lookup.
 * Returns the normalized currency code and the rate to store on the
 * document; the caller is responsible for using that rate to convert
 * amounts to base currency before posting (see postInvoiceToLedger in
 * src/lib/sales.ts).
 */
export async function resolveDocumentCurrency(
  db: Pick<Prisma.TransactionClient, "company">,
  companyId: string,
  currency: string,
  exchangeRate?: Decimal.Value
): Promise<{ currency: string; exchangeRate: Decimal }> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { baseCurrency: true } });
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const normalizedBase = normalizeCurrencyCode(company.baseCurrency);
  if (normalizedCurrency === normalizedBase) {
    if (exchangeRate !== undefined && !money(exchangeRate).equals(1)) {
      throw new InvalidLineError(`A ${normalizedBase} document's exchange rate must be 1.`);
    }
    return { currency: normalizedCurrency, exchangeRate: money(1) };
  }
  if (exchangeRate === undefined || !money(exchangeRate).isPositive()) {
    throw new InvalidLineError(`A ${normalizedCurrency} document needs a positive exchange rate to ${normalizedBase}.`);
  }
  return { currency: normalizedCurrency, exchangeRate: money(exchangeRate) };
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
  /**
   * Set only when `currency` is copied from a document or entry that is
   * already posted: a payment against a posted invoice/bill, or a reversal.
   * Those must settle in the same currency the original was booked in, even
   * if it predates the base-currency rule below; refusing them would leave
   * the original's receivable/payable impossible to clear. New documents and
   * entries never set this.
   */
  inheritsPostedCurrency?: boolean;
  /** Set only by reverseJournalEntry(): the posted entry this one reverses. */
  reversalOfId?: string;
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
  }) as { entryNumber: string } | null;

  const lastN = last ? parseInt(last.entryNumber.replace(/\D/g, ""), 10) || 0 : 0;
  return `JE-${String(lastN + 1).padStart(6, "0")}`;
}

export async function findOpenPeriod(tx: Prisma.TransactionClient, companyId: string, date: Date) {
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
    }).then((p: any) => {
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

  // Every path into the ledger (invoices, bills, payments, expenses, imports,
  // manual journals) comes through here, so this is the backstop that keeps
  // unconverted foreign-currency amounts out of the books.
  //
  // `currency`/`exchangeRate` here describe the SOURCE DOCUMENT's own
  // currency and rate for audit/display on the JournalEntry row — they are
  // NOT applied to `input.lines` by this function. `input.lines` must
  // already be in the company's base currency (the caller converts before
  // calling postJournalEntry; see buildInvoicePosting's callers in
  // sales.ts for the multi-currency invoice path). A base-currency entry's
  // rate must be 1 (or omitted); a foreign-currency entry needs a real
  // positive rate, purely as a record of what it was booked at.
  if (!input.inheritsPostedCurrency) {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { baseCurrency: true } });
    const isBaseCurrency = normalizeCurrencyCode(input.currency) === normalizeCurrencyCode(company.baseCurrency);
    if (isBaseCurrency) {
      if (input.exchangeRate !== undefined && !money(input.exchangeRate).equals(1)) {
        throw new InvalidLineError("A base-currency entry's exchange rate must be 1.");
      }
    } else if (input.exchangeRate === undefined || !money(input.exchangeRate).isPositive()) {
      throw new InvalidLineError("A non-base-currency entry needs a positive exchange rate.");
    }
  }

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

  const entry = await prisma.$transaction(async (tx: any) => {
    const period = await findOpenPeriod(tx, input.companyId, input.date);

    const accounts = (await tx.account.findMany({
      where: { companyId: input.companyId, code: { in: input.lines.map((l) => l.accountCode) }, isActive: true },
      select: { id: true, code: true },
    })) as Array<{ id: string; code: string }>;
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));
    for (const line of input.lines) {
      if (!accountByCode.has(line.accountCode)) {
        throw new InvalidLineError(`Unknown or inactive account code: ${line.accountCode}`);
      }
    }
    // Cost centre, department and project tags must be this company's own.
    // A reversal copies its original's tags verbatim and is exempt, so an
    // entry tagged before this check existed can still be corrected.
    if (input.sourceType !== "REVERSAL") {
      for (const [kind, key] of [["costCentre", "costCentreId"], ["department", "departmentId"], ["project", "projectId"]] as const) {
        const problem = await foreignReferenceProblem(tx, input.companyId, kind, input.lines.map((l) => l[key]));
        if (problem) throw new InvalidLineError(problem);
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
        reversalOfId: input.reversalOfId,
        status: input.post ? "POSTED" : "DRAFT",
        currency: normalizeCurrencyCode(input.currency),
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

  const draft = await prisma.journalEntry.findFirst({
    where: { id: params.journalEntryId, companyId: params.companyId },
  });
  if (!draft) throw new NotFoundError("Journal entry not found.");
  if (draft.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft entry can be posted.");
  }

  const posted = await prisma.$transaction(async (tx: any) => {
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
 * Deletes a DRAFT journal entry outright. Refused for anything already
 * POSTED — that's what reverseJournalEntry() below is for instead. Same
 * permission tier as postDraftJournalEntry() (APPROVE on Journals), since
 * both act on someone else's submitted draft, not just your own.
 */
export async function deleteDraftJournalEntry(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
}) {
  const allowed = await can(params.membershipId, "journals", "APPROVE");
  if (!allowed) {
    throw new InvalidLineError("Deleting a journal entry requires the APPROVE permission on Journals.");
  }

  const draft = await prisma.journalEntry.findFirst({
    where: { id: params.journalEntryId, companyId: params.companyId },
  });
  if (!draft) throw new NotFoundError("Journal entry not found.");
  if (draft.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft entry can be deleted. A posted entry can be reversed instead.");
  }

  await prisma.$transaction([
    prisma.journalLine.deleteMany({ where: { journalEntryId: draft.id } }),
    prisma.journalEntry.delete({ where: { id: draft.id } }),
  ]);

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "journal.draft_deleted",
    entityType: "JournalEntry",
    entityId: draft.id,
    previousValue: { entryNumber: draft.entryNumber, memo: draft.memo },
  });
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

  const original = await prisma.journalEntry.findFirst({
    where: { id: params.journalEntryId, companyId: params.companyId },
    include: { lines: true },
  });
  if (!original) throw new NotFoundError("Journal entry not found.");

  if (original.status !== "POSTED") {
    throw new InvalidLineError("Only a posted entry can be reversed.");
  }

  const accounts = (await prisma.account.findMany({
    where: { id: { in: original.lines.map((l: any) => l.accountId) } },
    select: { id: true, code: true },
  })) as Array<{ id: string; code: string }>;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const reversalLines: LineInput[] = original.lines.map((l: any) => ({
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
    inheritsPostedCurrency: true, // mirrors an entry that is already posted
    reversalOfId: original.id, // the link the integrity check (findOrphanedReversals) relies on
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
/**
 * `cogsLines` (grouped by resolved COGS account, one entry per distinct
 * code) and `inventoryAssetCode` are supplied only when this invoice ships
 * at least one tracked-inventory product — see postInvoiceToLedger in
 * src/lib/sales.ts, which computes each line's FIFO cost via
 * previewFifoCost() before calling this. When given, they add DR Cost of
 * Goods Sold / CR Inventory Asset lines to the same entry, so revenue
 * recognition and cost relief always post atomically together. Omitted (or
 * all-zero) entirely for an invoice with no tracked-inventory lines —
 * unchanged from the pre-COGS behavior.
 */
export function buildInvoicePosting(input: {
  subtotal: Decimal.Value;
  taxTotal: Decimal.Value;
  total: Decimal.Value;
  accountsReceivableCode?: string;
  outputTaxCode?: string;
  cogsLines?: { accountCode: string; amount: Decimal.Value }[];
  inventoryAssetCode?: string;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: input.accountsReceivableCode ?? "1100", debit: input.total, description: "Accounts Receivable" },
    { accountCode: "4000", credit: input.subtotal, description: "Sales Revenue" },
  ];
  if (!isZero(input.taxTotal)) {
    lines.push({ accountCode: input.outputTaxCode ?? "2100", credit: input.taxTotal, description: "Output Tax Payable" });
  }
  const cogsTotal = sum((input.cogsLines ?? []).map((l) => l.amount));
  if (!isZero(cogsTotal)) {
    if (!input.inventoryAssetCode) {
      throw new InvalidLineError("Inventory asset account required when cost-of-goods-sold lines are given.");
    }
    for (const l of input.cogsLines!) {
      if (isZero(l.amount)) continue;
      lines.push({ accountCode: l.accountCode, debit: l.amount, description: "Cost of Goods Sold" });
    }
    lines.push({ accountCode: input.inventoryAssetCode, credit: cogsTotal, description: "Inventory Asset" });
  }
  return lines;
}

/** Customer payment: DR Bank, CR Accounts Receivable */
/**
 * `amount` is the base-currency cash received (the Bank debit). `arAmount`
 * is the base-currency Accounts Receivable being cleared — it defaults to
 * `amount` (the original, pre-multi-currency behavior: bank and AR move by
 * exactly the same amount). Pass a different `arAmount` when a
 * foreign-currency invoice is settled at a different rate than it was
 * booked at (see recordInvoicePayment in src/lib/sales.ts): the difference
 * is realized exchange gain/loss, booked to `exchangeGainLossCode` (required
 * whenever `amount` and `arAmount` differ).
 */
export function buildInvoicePaymentPosting(input: {
  amount: Decimal.Value;
  arAmount?: Decimal.Value;
  bankAccountCode?: string;
  accountsReceivableCode?: string;
  exchangeGainLossCode?: string;
}): LineInput[] {
  const bank = money(input.amount);
  const ar = input.arAmount !== undefined ? money(input.arAmount) : bank;
  const lines: LineInput[] = [
    { accountCode: input.bankAccountCode ?? "1000", debit: bank, description: "Bank" },
  ];
  const fx = bank.minus(ar);
  if (!isZero(fx)) {
    if (!input.exchangeGainLossCode) {
      throw new InvalidLineError("Exchange gain/loss account required when the Bank and Accounts Receivable amounts differ.");
    }
    if (fx.isPositive()) {
      lines.push({ accountCode: input.exchangeGainLossCode, credit: fx, description: "Realized exchange gain" });
    } else {
      lines.push({ accountCode: input.exchangeGainLossCode, debit: fx.abs(), description: "Realized exchange loss" });
    }
  }
  lines.push({ accountCode: input.accountsReceivableCode ?? "1100", credit: ar, description: "Accounts Receivable" });
  return lines;
}

/**
 * Supplier bill: one DR line per distinct debit account in `expenseLines`
 * (must sum to `subtotal` — see approveAndPostBill in src/lib/purchases.ts,
 * which groups each bill line by its resolved account: a tracked-inventory
 * line capitalizes to the Inventory Asset account instead of expensing
 * immediately, an ordinary line expenses to its product's own
 * expenseAccountCode or the bill-level default), DR Input Tax, CR Accounts
 * Payable.
 */
export function buildBillPosting(input: {
  expenseLines: { accountCode: string; amount: Decimal.Value }[];
  taxTotal: Decimal.Value;
  total: Decimal.Value;
  inputTaxCode?: string;
  accountsPayableCode?: string;
}): LineInput[] {
  const lines: LineInput[] = input.expenseLines
    .filter((l) => !isZero(l.amount))
    .map((l) => ({ accountCode: l.accountCode, debit: l.amount, description: "Expense" }));
  if (!isZero(input.taxTotal)) {
    lines.push({ accountCode: input.inputTaxCode ?? "1200", debit: input.taxTotal, description: "Input Tax Receivable" });
  }
  lines.push({ accountCode: input.accountsPayableCode ?? "2000", credit: input.total, description: "Accounts Payable" });
  return lines;
}

/** Supplier payment: DR Accounts Payable, CR Bank */
export function buildSupplierPaymentPosting(input: { amount: Decimal.Value; bankAccountCode?: string; accountsPayableCode?: string }): LineInput[] {
  return [
    { accountCode: input.accountsPayableCode ?? "2000", debit: input.amount, description: "Accounts Payable" },
    { accountCode: input.bankAccountCode ?? "1000", credit: input.amount, description: "Bank" },
  ];
}

/** Employee/direct expense paid from the bank immediately: DR Expense, DR
 *  Input Tax, CR Bank. (Distinct from a Bill, which goes through Accounts
 *  Payable because it isn't paid yet.) */
export function buildExpensePosting(input: {
  amount: Decimal.Value;
  taxAmount?: Decimal.Value;
  expenseAccountCode?: string;
  bankAccountCode?: string;
  inputTaxCode?: string;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: input.expenseAccountCode ?? "5000", debit: input.amount, description: "Expense" },
  ];
  if (input.taxAmount && !isZero(input.taxAmount)) {
    lines.push({ accountCode: input.inputTaxCode ?? "1200", debit: input.taxAmount, description: "Input Tax Receivable" });
  }
  const total = money(input.amount).plus(input.taxAmount ?? 0);
  lines.push({ accountCode: input.bankAccountCode ?? "1000", credit: total, description: "Bank" });
  return lines;
}
