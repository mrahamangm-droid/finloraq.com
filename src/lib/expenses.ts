import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { decideExpenseApproval, governingRule, roleSatisfies } from "@/lib/approvals";
import { can, requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import {
  postJournalEntry,
  postDraftJournalEntry,
  buildExpensePosting,
  validateBalanced,
  findOpenPeriod,
  InvalidLineError,
} from "@/lib/ledger";
import { getBankAccountCode } from "@/lib/accounts";

/**
 * A direct/employee expense paid immediately (not a supplier bill on
 * credit terms — that's purchases.ts). Deliberately posted in two steps,
 * not immediately on creation: STAFF can hold expenses:CREATE without
 * holding journals:APPROVE, so a staff member submits a DRAFT here and
 * someone with approval rights (Finance Manager/CFO/Admin) posts it —
 * that's the real shape of section 13's approval workflow.
 * Amount-threshold routing (Expense < AED 500 → Manager, etc.,
 * via WorkflowRule/Approval) is wired in approveExpense() below via checkAndGate().
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
  // Recorded in the company's own base currency — never a hardcoded one,
  // since companies can pick their base currency at onboarding.
  const [{ baseCurrency }, bankAccountCode] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: params.companyId },
      select: { baseCurrency: true },
    }),
    getBankAccountCode(params.companyId),
  ]);

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
    currency: baseCurrency,
    lines: buildExpensePosting({
      amount: params.amount,
      taxAmount: params.taxAmount,
      expenseAccountCode: params.expenseAccountCode,
      bankAccountCode,
    }),
    post: false,
  });

  return entry;
}

/**
 * Edits a DRAFT expense (a JournalEntry with sourceType EXPENSE) — its own
 * date/description/amount/tax/account, rebuilding the DR/CR lines exactly
 * like createExpense() does. Refused once the expense has been approved
 * (postDraftJournalEntry already posted it — the immutable-once-posted rule
 * in src/lib/ledger.ts applies here too). Gated on expenses:EDIT rather
 * than journals:APPROVE, so a Staff submitter (who only holds
 * expenses:CREATE, see the module matrix in src/lib/rbac.ts) still can't
 * edit their own draft — only Accountant and above can, matching how
 * approval-before-posting already works for this module. If the date moves
 * to a different month, the entry is re-homed to that month's period (an
 * approved-immutable entry never needs this, only a still-editable draft).
 */
export async function updateDraftExpense(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
  date?: Date;
  description?: string;
  amount?: number;
  taxAmount?: number;
  expenseAccountCode?: string;
}) {
  await requirePermission(params.membershipId, "expenses", "EDIT");

  const before = await prisma.journalEntry.findFirst({
    where: { id: params.journalEntryId, companyId: params.companyId, sourceType: "EXPENSE" },
    include: { lines: { include: { account: true } } },
  });
  if (!before) throw new NotFoundError("Expense not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft expense can be edited. Once approved, correct it with a reversal instead.");
  }

  const bankAccountCode = await getBankAccountCode(params.companyId);
  const currentExpenseLine = before.lines.find((l: any) => l.account.code !== bankAccountCode && l.account.code !== "1200");
  const currentTaxLine = before.lines.find((l: any) => l.account.code === "1200");

  const amount = params.amount ?? currentExpenseLine?.debit.toNumber() ?? 0;
  const taxAmount = params.taxAmount ?? currentTaxLine?.debit.toNumber() ?? undefined;
  const expenseAccountCode = params.expenseAccountCode ?? currentExpenseLine?.account.code;
  const date = params.date ?? before.date;

  const newLines = buildExpensePosting({ amount, taxAmount, expenseAccountCode, bankAccountCode });
  validateBalanced(newLines);

  const accounts = (await prisma.account.findMany({
    where: { companyId: params.companyId, code: { in: newLines.map((l) => l.accountCode) }, isActive: true },
    select: { id: true, code: true },
  })) as Array<{ id: string; code: string }>;
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  for (const line of newLines) {
    if (!accountByCode.has(line.accountCode)) {
      throw new InvalidLineError(`Unknown or inactive account code: ${line.accountCode}`);
    }
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const period = await findOpenPeriod(tx, params.companyId, date);
    await tx.journalLine.deleteMany({ where: { journalEntryId: before.id } });
    return tx.journalEntry.update({
      where: { id: before.id },
      data: {
        date,
        memo: params.description ?? before.memo,
        periodId: period.id,
        lines: {
          create: newLines.map((l) => ({
            accountId: accountByCode.get(l.accountCode)!.id,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            description: l.description,
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "expense.updated",
    entityType: "JournalEntry",
    entityId: updated.id,
    previousValue: { memo: before.memo, date: before.date.toISOString().slice(0, 10) },
    newValue: { memo: updated.memo, date: updated.date.toISOString().slice(0, 10) },
  });

  return updated;
}

export class ApprovalPolicyError extends Error {}

/**
 * Approves a DRAFT expense, applying the company's amount-based approval
 * rules (Settings → Approvals; policy in src/lib/approvals.ts) before the
 * usual posting. Rules only add restrictions: postDraftJournalEntry() still
 * requires journals:APPROVE, so no rule can grant approval to anyone.
 */
export async function approveExpense(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  journalEntryId: string;
}) {
  // Permission first, so someone who can't approve at all hears that — not a
  // policy reason. postDraftJournalEntry() re-checks it before posting.
  if (!(await can(params.membershipId, "journals", "APPROVE"))) {
    throw new InvalidLineError("Posting a journal entry requires the APPROVE permission on Journals.");
  }

  const [expense, approver, rules] = await Promise.all([
    prisma.journalEntry.findFirst({
      where: { id: params.journalEntryId, companyId: params.companyId, sourceType: "EXPENSE" },
      include: { lines: { include: { account: true } } },
    }),
    prisma.companyMembership.findFirstOrThrow({ where: { id: params.membershipId, companyId: params.companyId } }),
    prisma.workflowRule.findMany({ where: { companyId: params.companyId, entityType: "Expense" } }),
  ]);
  if (!expense) throw new ApprovalPolicyError("Expense not found.");

  // Same amount rule as the Expenses list: the Bank line's credit, else the sum of debits.
  const bankAccountCode = await getBankAccountCode(params.companyId);
  const bankLine = expense.lines.find((l) => l.account.code === bankAccountCode);
  const amount = bankLine ? bankLine.credit.toNumber() : expense.lines.reduce((a, l) => a + l.debit.toNumber(), 0);
  const ruleRows = rules.map((r) => ({
    id: r.id,
    minAmount: r.minAmount === null ? null : r.minAmount.toNumber(),
    maxAmount: r.maxAmount === null ? null : r.maxAmount.toNumber(),
    requiredRole: r.requiredRole,
    isActive: r.isActive,
  }));

  // Only needed for self-approval: could anyone else approve this one?
  let otherEligibleApprovers = 0;
  if (expense.createdBy === params.userId) {
    const rule = governingRule(ruleRows, amount);
    const others = await prisma.companyMembership.findMany({
      where: { companyId: params.companyId, isActive: true, userId: { not: expense.createdBy } },
      select: { id: true, role: true },
    });
    for (const m of others) {
      if ((!rule || roleSatisfies(m.role, rule.requiredRole)) && (await can(m.id, "journals", "APPROVE"))) otherEligibleApprovers++;
    }
  }

  const decision = decideExpenseApproval({
    amount,
    rules: ruleRows,
    approverRole: approver.role,
    approverUserId: params.userId,
    submitterUserId: expense.createdBy,
    otherEligibleApprovers,
  });
  if (!decision.ok) throw new ApprovalPolicyError(decision.reason);

  // Post the expense.
  const posted = await postDraftJournalEntry({
    companyId:      params.companyId,
    membershipId:   params.membershipId,
    userId:         params.userId,
    journalEntryId: params.journalEntryId,
  });

  if (decision.rule) {
    await prisma.approval.create({
      data: {
        workflowRuleId: decision.rule.id,
        entityType: "Expense",
        entityId: posted.id,
        status: "APPROVED",
        decidedBy: params.userId,
        decidedAt: new Date(),
      },
    });
  }
  if (decision.rule || decision.selfApproval) {
    await recordAuditEvent({
      companyId: params.companyId,
      userId: params.userId,
      action: decision.selfApproval ? "expense.self_approved_sole_approver" : "expense.approved_by_rule",
      entityType: "JournalEntry",
      entityId: posted.id,
      newValue: { amount, ruleId: decision.rule?.id ?? null, requiredRole: decision.rule?.requiredRole ?? null, approverRole: approver.role },
    });
  }

  return posted;
}

/**
 * Totals for the same filter as listRecentExpenses(), computed in the
 * database over EVERY matching expense — the list itself is capped, so
 * summing it would understate a period with more expenses than the cap.
 *
 * Mirrors the Expenses page's per-row amount rule exactly: an expense
 * with a Bank line counts that line's credit; one without counts the sum
 * of its debits. Split by the entry's currency, since amounts in
 * different currencies don't add up to a total.
 */
export async function expenseTotals(
  companyId: string,
  range?: { from: Date; to: Date },
  status?: "DRAFT" | "POSTED" | "REVERSED",
) {
  const entryWhere = {
    companyId,
    sourceType: "EXPENSE" as const,
    ...(range ? { date: { gte: range.from, lte: range.to } } : {}),
    ...(status ? { status } : {}),
  };
  const [groups, bankAccountCode] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ["currency"],
      where: entryWhere,
      _count: { _all: true },
      orderBy: { currency: "asc" },
    }),
    getBankAccountCode(companyId),
  ]);

  const byCurrency = await Promise.all(
    groups.map(async (g) => {
      const where = { ...entryWhere, currency: g.currency };
      const [withBank, withoutBank] = await Promise.all([
        prisma.journalLine.aggregate({
          _sum: { credit: true },
          where: { account: { code: bankAccountCode }, journalEntry: where },
        }),
        prisma.journalLine.aggregate({
          _sum: { debit: true },
          where: { journalEntry: { ...where, lines: { none: { account: { code: bankAccountCode } } } } },
        }),
      ]);
      const creditTotal = withBank._sum.credit ? Number(withBank._sum.credit) : 0;
      const debitTotal = withoutBank._sum.debit ? Number(withoutBank._sum.debit) : 0;
      const total = creditTotal + debitTotal;
      return { currency: g.currency, total };
    }),
  );

  return { count: groups.reduce((n, g) => n + g._count._all, 0), byCurrency };
}

/**
 * status narrows the Expenses page's filter tabs (All / Drafts / Posted /
 * Reversed) to one JournalStatus — purely a display filter, no different
 * from the existing date-range one, so it's additive and optional like
 * `range` rather than a new required argument.
 */
export async function listRecentExpenses(
  companyId: string,
  range?: { from: Date; to: Date },
  status?: "DRAFT" | "POSTED" | "REVERSED",
) {
  return prisma.journalEntry.findMany({
    where: {
      companyId,
      sourceType: "EXPENSE",
      ...(range ? { date: { gte: range.from, lte: range.to } } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { date: "desc" },
    take: range ? 500 : 50,
    include: { lines: { include: { account: true } } },
  });
}
