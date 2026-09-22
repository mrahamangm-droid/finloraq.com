import { prisma } from "@/lib/db";
import { postJournalEntry, postDraftJournalEntry, buildExpensePosting } from "@/lib/ledger";

/**
 * A direct/employee expense paid immediately (not a supplier bill on
 * credit terms — that's purchases.ts). Deliberately posted in two steps,
 * not immediately on creation: STAFF can hold expenses:CREATE without
 * holding journals:APPROVE, so a staff member submits a DRAFT here and
 * someone with approval rights (Finance Manager/CFO/Admin) posts it —
 * that's the real shape of section 13's approval workflow even though the
 * amount-threshold routing itself (Expense < AED 500 → Manager, etc.,
 * via WorkflowRule/Approval) isn't wired up yet; see TODO below.
 */
export async function createExpense(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  date: Date;
  description: string;
  amount: number;
  taxAmount?: number;
  expenseAccountCode?: string;
}) {
  // post:false inside postJournalEntry only requires journals:CREATE, which
  // every role from STAFF up holds — so submitting an expense never
  // requires the APPROVE permission that posting does.
  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "EXPENSE",
    sourceId: `expense:${params.userId}:${Date.now()}`,
    memo: params.description,
    currency: "AED",
    lines: buildExpensePosting({
      amount: params.amount,
      taxAmount: params.taxAmount,
      expenseAccountCode: params.expenseAccountCode,
    }),
    post: false,
  });

  return entry;
}

/** TODO(Phase 5/13): before approval, check WorkflowRule for entityType
 *  "Expense" against the amount and require the specific role the
 *  matching rule names, rather than the flat journals:APPROVE check that
 *  postDraftJournalEntry() applies today. */
export async function approveExpense(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
}) {
  return postDraftJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    journalEntryId: params.journalEntryId,
  });
}

export async function listRecentExpenses(companyId: string) {
  return prisma.journalEntry.findMany({
    where: { companyId, sourceType: "EXPENSE" },
    orderBy: { date: "desc" },
    take: 50,
    include: { lines: { include: { account: true } } },
  });
}
