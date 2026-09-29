/**
 * Bank reconciliation business logic.
 *
 * A reconciliation links a bank statement period (opening → closing balance)
 * to a set of bank transactions the user has "cleared" against that statement.
 * When the cleared balance matches the statement closing balance the user can
 * finalise the reconciliation, which locks it and marks all linked transactions
 * as RECONCILED.
 *
 * Double-entry safety: this module does NOT write JournalEntry rows. The
 * reconciliation is a matching/audit tool. Any journal corrections implied by
 * unmatched items should flow through the normal ledger pathway
 * (src/lib/ledger.ts) as separate entries.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReconciliationSummary {
  id: string;
  statementDate: Date;
  openingBalance: number;
  closingBalance: number;
  status: "DRAFT" | "COMPLETED";
  completedAt: Date | null;
  clearedCount: number;
  clearedBalance: number;
  difference: number; // closingBalance - openingBalance - clearedBalance
}

export interface ReconciliationTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  status: string;
  cleared: boolean; // included in this reconciliation
}

// ─── List reconciliations for a bank account ─────────────────────────────────

export async function listReconciliations(companyId: string, bankAccountId: string) {
  const recs = await prisma.bankReconciliation.findMany({
    where: { companyId, bankAccountId },
    include: { _count: { select: { transactions: true } } },
    orderBy: { statementDate: "desc" },
  });

  type RecRow = (typeof recs)[number];
  return recs.map((r: RecRow) => ({
    id: r.id,
    statementDate: r.statementDate,
    openingBalance: r.openingBalance.toNumber(),
    closingBalance: r.closingBalance.toNumber(),
    status: r.status as "DRAFT" | "COMPLETED",
    completedAt: r.completedAt,
    transactionCount: r._count.transactions,
  }));
}

// ─── Get single reconciliation with its transactions ──────────────────────────

export async function getReconciliation(companyId: string, reconciliationId: string) {
  const rec = await prisma.bankReconciliation.findFirst({
    where: { id: reconciliationId, companyId },
    include: { bankAccount: { select: { id: true, name: true, currency: true } } },
  });
  if (!rec) return null;

  // All transactions for this bank account that are either:
  //   • already linked to THIS reconciliation (cleared)
  //   • unreconciled (UNMATCHED or MATCHED) and available to be cleared
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: rec.bankAccountId,
      OR: [
        { reconciliationId: reconciliationId },
        { status: { in: ["UNMATCHED", "MATCHED"] }, reconciliationId: null },
      ],
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  type TxRow = (typeof transactions)[number];
  const clearedAmounts = transactions
    .filter((t: TxRow) => t.reconciliationId === reconciliationId)
    .map((t: TxRow) => t.amount.toNumber());

  const clearedBalance = clearedAmounts.reduce((s: number, a: number) => s + a, 0);
  const openingBalance = rec.openingBalance.toNumber();
  const closingBalance = rec.closingBalance.toNumber();
  const difference = closingBalance - openingBalance - clearedBalance;

  const summary: ReconciliationSummary = {
    id: rec.id,
    statementDate: rec.statementDate,
    openingBalance,
    closingBalance,
    status: rec.status as "DRAFT" | "COMPLETED",
    completedAt: rec.completedAt,
    clearedCount: clearedAmounts.length,
    clearedBalance,
    difference,
  };

  const rows: ReconciliationTransaction[] = transactions.map((t: TxRow) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount.toNumber(),
    status: t.status,
    cleared: t.reconciliationId === reconciliationId,
  }));

  return { summary, transactions: rows, bankAccount: rec.bankAccount };
}

// ─── Create a new reconciliation ─────────────────────────────────────────────

export async function createReconciliation(
  companyId: string,
  membershipId: string,
  bankAccountId: string,
  statementDate: Date,
  openingBalance: number,
  closingBalance: number
) {
  await requirePermission(membershipId, "banking", "EDIT");

  // Verify bank account belongs to this company
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } });
  if (!account) throw new Error("Bank account not found.");

  // Prevent duplicate draft reconciliation for the same statement date
  const existing = await prisma.bankReconciliation.findFirst({
    where: { companyId, bankAccountId, statementDate, status: "DRAFT" },
  });
  if (existing) throw new Error("A draft reconciliation already exists for this statement date.");

  const rec = await prisma.bankReconciliation.create({
    data: {
      companyId,
      bankAccountId,
      statementDate,
      openingBalance,
      closingBalance,
      status: "DRAFT",
    },
  });

  await recordAuditEvent({
    companyId,
    action: "banking.reconciliation_created",
    entityType: "BankReconciliation",
    entityId: rec.id,
    newValue: { bankAccountId, statementDate: statementDate.toISOString(), openingBalance, closingBalance },
  });

  return rec;
}

// ─── Toggle a transaction cleared/uncleared in a draft reconciliation ─────────

export async function toggleTransaction(
  companyId: string,
  membershipId: string,
  reconciliationId: string,
  transactionId: string,
  cleared: boolean
) {
  await requirePermission(membershipId, "banking", "EDIT");

  const rec = await prisma.bankReconciliation.findFirst({ where: { id: reconciliationId, companyId } });
  if (!rec) throw new Error("Reconciliation not found.");
  if (rec.status !== "DRAFT") throw new Error("Cannot modify a completed reconciliation.");

  // Confirm the transaction belongs to the same bank account
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, bankAccountId: rec.bankAccountId },
  });
  if (!tx) throw new Error("Transaction not found.");

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { reconciliationId: cleared ? reconciliationId : null },
  });
}

// ─── Complete a reconciliation ────────────────────────────────────────────────

export async function completeReconciliation(
  companyId: string,
  membershipId: string,
  userId: string,
  reconciliationId: string
) {
  await requirePermission(membershipId, "banking", "EDIT");

  const rec = await prisma.bankReconciliation.findFirst({
    where: { id: reconciliationId, companyId },
    include: { transactions: true },
  });
  if (!rec) throw new Error("Reconciliation not found.");
  if (rec.status !== "DRAFT") throw new Error("Reconciliation is already completed.");

  // Verify that the cleared balance matches
  type RecTx = (typeof rec.transactions)[number];
  const clearedBalance = rec.transactions.reduce((s: number, t: RecTx) => s + t.amount.toNumber(), 0);
  const expected = rec.closingBalance.toNumber() - rec.openingBalance.toNumber();
  const diff = Math.abs(clearedBalance - expected);
  if (diff > 0.005) {
    throw new Error(
      `Clearing balance (${clearedBalance.toFixed(2)}) does not match statement difference (${expected.toFixed(2)}). Difference: ${diff.toFixed(2)}.`
    );
  }

  // Lock reconciliation + mark all linked transactions RECONCILED in a transaction
  const txIds = rec.transactions.map((t: RecTx) => t.id);
  await prisma.$transaction([
    prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: { status: "COMPLETED", completedAt: new Date(), completedById: userId },
    }),
    prisma.bankTransaction.updateMany({
      where: { id: { in: txIds } },
      data: { status: "RECONCILED" },
    }),
  ]);

  await recordAuditEvent({
    companyId,
    userId,
    action: "banking.reconciliation_completed",
    entityType: "BankReconciliation",
    entityId: reconciliationId,
    newValue: { clearedCount: txIds.length, clearedBalance },
  });
}
