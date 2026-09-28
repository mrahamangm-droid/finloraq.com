import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { InvalidLineError } from "@/lib/ledger";
import { rankCandidates, splitNewLines, type MatchCandidate, type StatementLine, SUGGESTION_WINDOW_DAYS } from "@/lib/bankStatement";

/** The ledger's Bank account. Every bank account currently posts through it (see matchBankTransaction). */
const BANK_ACCOUNT_CODE = "1000";

/** Signed amount of an entry's Bank line: + money in (debit), − money out (credit). Null when it has none. */
export function bankLineAmount(lines: { debit: { gt(n: number): boolean; toNumber(): number }; credit: { toNumber(): number }; account: { code: string } }[]): number | null {
  const bankLine = lines.find((l) => l.account.code === BANK_ACCOUNT_CODE);
  if (!bankLine) return null;
  return bankLine.debit.gt(0) ? bankLine.debit.toNumber() : -bankLine.credit.toNumber();
}

export async function createBankAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  currency: string;
  openingBalance?: number;
}) {
  await requirePermission(params.membershipId, "banking", "CREATE");

  const account = await prisma.bankAccount.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      currency: params.currency,
      openingBalance: params.openingBalance ?? 0,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_account.created",
    entityType: "BankAccount",
    entityId: account.id,
    newValue: { name: account.name },
  });

  return account;
}

/** Thrown for a bad edit or a delete refused because of history/state. */
export class BankValidationError extends Error {}

/**
 * Edits a bank account's own fields (name, currency, active flag). The
 * opening balance is deliberately not editable here once any transaction
 * exists — it's the anchor every later transaction and the bank report
 * add up from, so changing it under existing history would silently shift
 * every running balance after it. Rename/reactivate freely; for a genuine
 * opening-balance correction, adjust it via a manual bank transaction dated
 * on/before the account's first real transaction instead.
 */
export async function updateBankAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankAccountId: string;
  name?: string;
  currency?: string;
  openingBalance?: number;
  isActive?: boolean;
}) {
  await requirePermission(params.membershipId, "banking", "EDIT");

  const before = await prisma.bankAccount.findFirst({ where: { id: params.bankAccountId, companyId: params.companyId } });
  if (!before) throw new NotFoundError("Bank account not found.");

  if (params.name !== undefined && params.name.trim() === "") {
    throw new BankValidationError("Bank account name can't be empty.");
  }

  if (params.openingBalance !== undefined) {
    const txnCount = await prisma.bankTransaction.count({ where: { bankAccountId: before.id } });
    if (txnCount > 0) {
      throw new BankValidationError(
        `${before.name} already has ${txnCount} transaction${txnCount === 1 ? "" : "s"} recorded — its opening balance can't change once transactions exist. Add a dated adjustment transaction instead.`
      );
    }
  }

  const account = await prisma.bankAccount.update({
    where: { id: params.bankAccountId },
    data: {
      name: params.name !== undefined ? params.name.trim() : undefined,
      currency: params.currency !== undefined ? params.currency.toUpperCase() : undefined,
      openingBalance: params.openingBalance,
      isActive: params.isActive,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_account.updated",
    entityType: "BankAccount",
    entityId: account.id,
    previousValue: { name: before.name, currency: before.currency, isActive: before.isActive },
    newValue: { name: account.name, currency: account.currency, isActive: account.isActive },
  });

  return account;
}

/**
 * Permanently removes a bank account. Refused when it has any transaction
 * on record, since deleting it would orphan those rows (and any of them
 * MATCHED to a posted journal entry) — deactivate instead.
 */
export async function deleteBankAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankAccountId: string;
}) {
  await requirePermission(params.membershipId, "banking", "DELETE");

  const account = await prisma.bankAccount.findFirst({ where: { id: params.bankAccountId, companyId: params.companyId } });
  if (!account) throw new NotFoundError("Bank account not found.");

  const txnCount = await prisma.bankTransaction.count({ where: { bankAccountId: account.id } });
  if (txnCount > 0) {
    throw new BankValidationError(
      `${account.name} has ${txnCount} transaction${txnCount === 1 ? "" : "s"} on record and can't be deleted. Deactivate it instead to hide it without losing that history.`
    );
  }

  await prisma.bankAccount.delete({ where: { id: account.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_account.deleted",
    entityType: "BankAccount",
    entityId: account.id,
    previousValue: { name: account.name },
  });
}

/**
 * Edits an UNMATCHED bank transaction's own fields (date, description,
 * amount). Once MATCHED or RECONCILED it's tied to a posted journal entry
 * (or a closed reconciliation) and stays immutable — un-match it first
 * (unmatchBankTransaction(), MATCHED only) rather than editing a matched
 * row out from under its journal entry.
 */
export async function updateBankTransaction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankTransactionId: string;
  date?: Date;
  description?: string;
  amount?: number;
}) {
  await requirePermission(params.membershipId, "banking", "EDIT");

  const before = await prisma.bankTransaction.findFirst({
    where: { id: params.bankTransactionId, bankAccount: { companyId: params.companyId } },
  });
  if (!before) throw new NotFoundError("Bank transaction not found.");
  if (before.status !== "UNMATCHED") {
    throw new BankValidationError(`This transaction is ${before.status.toLowerCase()} and can't be edited.`);
  }
  if (params.description !== undefined && params.description.trim() === "") {
    throw new BankValidationError("Description can't be empty.");
  }

  const tx = await prisma.bankTransaction.update({
    where: { id: params.bankTransactionId },
    data: {
      date: params.date,
      description: params.description !== undefined ? params.description.trim() : undefined,
      amount: params.amount,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_transaction.updated",
    entityType: "BankTransaction",
    entityId: tx.id,
    previousValue: { description: before.description, amount: before.amount.toString(), date: before.date.toISOString() },
    newValue: { description: tx.description, amount: tx.amount.toString(), date: tx.date.toISOString() },
  });

  return tx;
}

/** Deletes an UNMATCHED bank transaction outright. Same immutability rule
 *  as updateBankTransaction() above — a MATCHED/RECONCILED row is refused. */
export async function deleteBankTransaction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankTransactionId: string;
}) {
  await requirePermission(params.membershipId, "banking", "DELETE");

  const before = await prisma.bankTransaction.findFirst({
    where: { id: params.bankTransactionId, bankAccount: { companyId: params.companyId } },
  });
  if (!before) throw new NotFoundError("Bank transaction not found.");
  if (before.status !== "UNMATCHED") {
    throw new BankValidationError(`This transaction is ${before.status.toLowerCase()} and can't be deleted.`);
  }

  await prisma.bankTransaction.delete({ where: { id: before.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_transaction.deleted",
    entityType: "BankTransaction",
    entityId: before.id,
    previousValue: { description: before.description, amount: before.amount.toString() },
  });
}

/** Manual transaction entry — the honest substitute for a live bank feed
 *  until Phase 7's external integrations land. Amount is signed: positive
 *  = money in, negative = money out. */
export async function recordBankTransaction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankAccountId: string;
  date: Date;
  description: string;
  amount: number;
}) {
  await requirePermission(params.membershipId, "banking", "CREATE");

  const account = await prisma.bankAccount.findFirst({
    where: { id: params.bankAccountId, companyId: params.companyId },
  });
  if (!account) throw new NotFoundError("Bank account not found.");

  const tx = await prisma.bankTransaction.create({
    data: {
      bankAccountId: account.id,
      date: params.date,
      description: params.description,
      amount: params.amount,
      status: "UNMATCHED",
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_transaction.recorded",
    entityType: "BankTransaction",
    entityId: tx.id,
    newValue: { amount: params.amount, description: params.description },
  });

  return tx;
}

/** Matches a bank transaction to a posted journal entry that hit the Bank
 *  account (code "1000") for the same amount and sign. Amount tolerance is
 *  zero — money either matches exactly or it doesn't; a partial match is a
 *  human decision, not something to fuzz silently. */
export async function matchBankTransaction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankTransactionId: string;
  journalEntryId: string;
}) {
  await requirePermission(params.membershipId, "banking", "EDIT");

  const [txn, entry] = await Promise.all([
    prisma.bankTransaction.findFirstOrThrow({
      where: { id: params.bankTransactionId },
      include: { bankAccount: true },
    }),
    prisma.journalEntry.findFirstOrThrow({
      where: { id: params.journalEntryId, companyId: params.companyId, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
  ]);

  if (txn.bankAccount.companyId !== params.companyId) {
    throw new InvalidLineError("Bank transaction does not belong to this company.");
  }
  if (txn.status !== "UNMATCHED") {
    throw new InvalidLineError("Only an unmatched transaction can be matched.");
  }

  const entryAmount = bankLineAmount(entry.lines);
  if (entryAmount === null) {
    throw new InvalidLineError("That journal entry has no Bank line to match against.");
  }
  const txnAmount = txn.amount.toNumber();
  if (Math.abs(entryAmount - txnAmount) > 0.005) {
    throw new InvalidLineError(
      `Amount mismatch: transaction is ${txnAmount.toFixed(2)}, journal entry Bank line is ${entryAmount.toFixed(2)}.`
    );
  }

  // One posted entry clears one bank line. Matching it twice would let a
  // single payment reconcile two statement lines.
  const alreadyMatched = await prisma.bankTransaction.findFirst({
    where: { matchedJournalEntryId: entry.id, id: { not: txn.id }, bankAccount: { companyId: params.companyId } },
    select: { description: true, date: true },
  });
  if (alreadyMatched) {
    throw new InvalidLineError(
      `${entry.entryNumber} is already matched to the bank line "${alreadyMatched.description}" on ${alreadyMatched.date.toISOString().slice(0, 10)}. Un-match that one first.`
    );
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: txn.id },
    data: { status: "MATCHED", matchedJournalEntryId: entry.id },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_transaction.matched",
    entityType: "BankTransaction",
    entityId: txn.id,
    newValue: { journalEntryId: entry.id },
  });

  return updated;
}

/** Undoes a match (MATCHED → UNMATCHED) so a wrong pairing can be corrected
 *  before month-end. Only the BankTransaction's own match state changes —
 *  the journal entry it pointed at is posted and untouched, so the ledger
 *  is unaffected. A RECONCILED transaction is refused: reconciliation is a
 *  banking:APPROVE sign-off, and quietly reopening it from an EDIT-level
 *  action would undo someone else's approval. Same permission as matching. */
export async function unmatchBankTransaction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankTransactionId: string;
}) {
  await requirePermission(params.membershipId, "banking", "EDIT");

  const before = await prisma.bankTransaction.findFirst({
    where: { id: params.bankTransactionId, bankAccount: { companyId: params.companyId } },
  });
  if (!before) throw new BankValidationError("Bank transaction not found.");
  if (before.status !== "MATCHED") {
    throw new BankValidationError(
      before.status === "RECONCILED"
        ? "This transaction is reconciled and can't be un-matched."
        : "Only a matched transaction can be un-matched.",
    );
  }

  // Conditional on status so a reconcile that lands between the read above
  // and this write can't be silently reversed.
  const { count } = await prisma.bankTransaction.updateMany({
    where: { id: before.id, status: "MATCHED" },
    data: { status: "UNMATCHED", matchedJournalEntryId: null },
  });
  if (count === 0) {
    throw new BankValidationError("This transaction changed while you were un-matching it — refresh and try again.");
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_transaction.unmatched",
    entityType: "BankTransaction",
    entityId: before.id,
    previousValue: { journalEntryId: before.matchedJournalEntryId },
  });

  return { id: before.id, status: "UNMATCHED" as const };
}

/** Month-end-close style bulk step: every MATCHED transaction for this
 *  account becomes RECONCILED. Nothing UNMATCHED is touched — reconciling
 *  is a statement about matched pairs, not a way to force-clear stragglers. */
export async function reconcileBankAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankAccountId: string;
}) {
  await requirePermission(params.membershipId, "banking", "APPROVE");

  const account = await prisma.bankAccount.findFirst({
    where: { id: params.bankAccountId, companyId: params.companyId },
  });
  if (!account) throw new NotFoundError("Bank account not found.");

  const result = await prisma.bankTransaction.updateMany({
    where: { bankAccountId: account.id, status: "MATCHED" },
    data: { status: "RECONCILED" },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_account.reconciled",
    entityType: "BankAccount",
    entityId: account.id,
    newValue: { transactionsReconciled: result.count },
  });

  return result.count;
}

/**
 * Imports parsed statement lines into a bank account as UNMATCHED bank
 * transactions. This never touches the ledger: statement lines are the
 * bank's side of the story, to be matched against posted entries.
 *
 * Lines already in the account (same date, amount and description, counted
 * — see splitNewLines) are skipped, so importing an overlapping or repeated
 * statement is safe. With `commit: false` nothing is written and the
 * result says what would happen.
 */
export async function importBankStatement(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  bankAccountId: string;
  lines: StatementLine[];
  fileName: string;
  commit: boolean;
}): Promise<{ toImport: number; duplicates: number; imported: number; importBatchId: string | null; preview: StatementLine[] }> {
  await requirePermission(params.membershipId, "banking", "CREATE");

  const account = await prisma.bankAccount.findFirst({
    where: { id: params.bankAccountId, companyId: params.companyId },
  });
  if (!account) throw new NotFoundError("Bank account not found.");
  if (params.lines.length === 0) throw new BankValidationError("There are no transactions to import.");

  const dates = params.lines.map((l) => l.date).sort();
  const existing = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
      date: { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates[dates.length - 1]}T23:59:59.999Z`) },
    },
    select: { date: true, amount: true, description: true },
  });
  const { fresh, duplicates } = splitNewLines(
    params.lines,
    existing.map((e) => ({ date: e.date.toISOString().slice(0, 10), amount: e.amount.toNumber(), description: e.description }))
  );

  const summary = { toImport: fresh.length, duplicates: duplicates.length, preview: fresh.slice(0, 20) };
  if (!params.commit || fresh.length === 0) return { ...summary, imported: 0, importBatchId: null };

  const importBatchId = crypto.randomUUID();
  const { count } = await prisma.bankTransaction.createMany({
    data: fresh.map((l) => ({
      bankAccountId: account.id,
      date: new Date(`${l.date}T00:00:00Z`),
      description: l.description,
      amount: l.amount,
      status: "UNMATCHED" as const,
      importBatchId,
    })),
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bank_statement.imported",
    entityType: "BankAccount",
    entityId: account.id,
    newValue: { fileName: params.fileName.slice(0, 200), imported: count, duplicatesSkipped: duplicates.length, importBatchId },
  });

  return { ...summary, imported: count, importBatchId };
}

/**
 * Suggested matches for the given unmatched bank transactions: posted
 * entries that hit the Bank account for exactly the same signed amount
 * within SUGGESTION_WINDOW_DAYS, and aren't already matched to another bank
 * line. Read-only. Keyed by bank transaction id; transactions with no
 * candidate are omitted.
 */
export async function suggestBankMatches(
  companyId: string,
  transactions: { id: string; date: Date; description: string; amount: number; status: string }[]
): Promise<Record<string, { entryNumber: string; date: string; memo: string | null; dayGap: number; sharedWords: number }[]>> {
  const unmatched = transactions.filter((t) => t.status === "UNMATCHED");
  if (unmatched.length === 0) return {};

  const times = unmatched.map((t) => t.date.getTime());
  const pad = SUGGESTION_WINDOW_DAYS * 86_400_000;
  const [entries, taken] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        status: "POSTED",
        date: { gte: new Date(Math.min(...times) - pad), lte: new Date(Math.max(...times) + pad) },
        lines: { some: { account: { code: BANK_ACCOUNT_CODE } } },
      },
      select: { id: true, entryNumber: true, date: true, memo: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
      take: 2000,
    }),
    prisma.bankTransaction.findMany({
      where: { bankAccount: { companyId }, matchedJournalEntryId: { not: null } },
      select: { matchedJournalEntryId: true },
    }),
  ]);
  const takenIds = new Set(taken.map((t) => t.matchedJournalEntryId));

  const candidates: MatchCandidate[] = [];
  for (const e of entries) {
    if (takenIds.has(e.id)) continue;
    const bankAmount = bankLineAmount(e.lines);
    if (bankAmount === null) continue;
    candidates.push({ journalEntryId: e.id, entryNumber: e.entryNumber, date: e.date.toISOString().slice(0, 10), memo: e.memo, bankAmount });
  }

  const out: Record<string, { entryNumber: string; date: string; memo: string | null; dayGap: number; sharedWords: number }[]> = {};
  for (const t of unmatched) {
    const ranked = rankCandidates({ date: t.date.toISOString().slice(0, 10), description: t.description, amount: t.amount }, candidates);
    if (ranked.length) out[t.id] = ranked.map(({ entryNumber, date, memo, dayGap, sharedWords }) => ({ entryNumber, date, memo, dayGap, sharedWords }));
  }
  return out;
}
