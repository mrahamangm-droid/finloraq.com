import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { InvalidLineError } from "@/lib/ledger";

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
  if (!before) throw new Error("Bank account not found.");

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
  if (!account) throw new Error("Bank account not found.");

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
 * (a rare enough correction that it isn't wired up yet) rather than
 * editing a matched row out from under its journal entry.
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
  if (!before) throw new Error("Bank transaction not found.");
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
  if (!before) throw new Error("Bank transaction not found.");
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

  const account = await prisma.bankAccount.findFirstOrThrow({
    where: { id: params.bankAccountId, companyId: params.companyId },
  });

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

  const bankLine = entry.lines.find((l) => l.account.code === "1000");
  if (!bankLine) {
    throw new InvalidLineError("That journal entry has no Bank line to match against.");
  }
  const entryAmount = bankLine.debit.gt(0) ? bankLine.debit.toNumber() : -bankLine.credit.toNumber();
  const txnAmount = txn.amount.toNumber();
  if (Math.abs(entryAmount - txnAmount) > 0.005) {
    throw new InvalidLineError(
      `Amount mismatch: transaction is ${txnAmount.toFixed(2)}, journal entry Bank line is ${entryAmount.toFixed(2)}.`
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

  const account = await prisma.bankAccount.findFirstOrThrow({
    where: { id: params.bankAccountId, companyId: params.companyId },
  });

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
