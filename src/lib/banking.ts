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
