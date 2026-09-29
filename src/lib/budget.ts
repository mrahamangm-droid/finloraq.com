/**
 * Budget management and Budget vs Actual reporting.
 *
 * A Budget is an annual plan broken down by account code and month (1–12).
 * The Budget vs Actual report compares those budget amounts against the
 * actual amounts computed from posted journal entries — the same source used
 * by every other report in this codebase.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { sum, roundMoney } from "@/lib/currency";
import Decimal from "decimal.js";

export interface BudgetItemInput {
  accountCode: string;
  month: number;   // 1-12
  amount: number;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createBudget(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  fiscalYear: number;
  currency: string;
  items: BudgetItemInput[];
}) {
  await requirePermission(params.membershipId, "reports", "CREATE");

  const budget = await prisma.budget.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      fiscalYear: params.fiscalYear,
      currency: params.currency,
      items: {
        create: params.items.map((item) => ({
          accountCode: item.accountCode,
          month: item.month,
          amount: item.amount,
        })),
      },
    },
    include: { items: true },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "budget.created",
    entityType: "Budget",
    entityId: budget.id,
    newValue: { name: budget.name, fiscalYear: budget.fiscalYear },
  });

  return budget;
}

// ─── List / Get ───────────────────────────────────────────────────────────────

export async function listBudgets(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "reports", "VIEW");
  return prisma.budget.findMany({
    where: { companyId },
    orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });
}

export async function getBudget(companyId: string, membershipId: string, id: string) {
  await requirePermission(membershipId, "reports", "VIEW");
  const budget = await prisma.budget.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: [{ accountCode: "asc" }, { month: "asc" }] } },
  });
  if (!budget) throw new Error("Budget not found");
  return budget;
}

// ─── Budget vs Actual report ──────────────────────────────────────────────────

export interface BudgetVsActualRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  months: Array<{
    month: number;
    budget: number;
    actual: number;
    variance: number;  // actual - budget (positive = over budget for expenses, under for revenue)
  }>;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

export async function budgetVsActual(
  companyId: string,
  membershipId: string,
  budgetId: string,
  /** Restrict to specific months (1-12). Defaults to all 12. */
  months?: number[]
): Promise<{ budget: Awaited<ReturnType<typeof getBudget>>; rows: BudgetVsActualRow[] }> {
  await requirePermission(membershipId, "reports", "VIEW");

  const budget = await getBudget(companyId, membershipId, budgetId);
  const targetMonths = months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Build date range: Jan 1 – Dec 31 of the fiscal year
  const fromDate = new Date(Date.UTC(budget.fiscalYear, 0, 1));
  const toDate = new Date(Date.UTC(budget.fiscalYear, 11, 31, 23, 59, 59));

  // Get all accounts that appear in either budget items or actual journal lines
  const budgetAccountCodes = [...new Set(budget.items.map((i: any) => i.accountCode))];

  const accounts = await prisma.account.findMany({
    where: { companyId, code: { in: budgetAccountCodes }, isActive: true },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });

  // Get actual journal lines for the year, grouped by account and month
  const actualLines = await prisma.journalLine.findMany({
    where: {
      account: { companyId },
      journalEntry: {
        companyId,
        status: "POSTED",
        date: { gte: fromDate, lte: toDate },
      },
    },
    include: { journalEntry: { select: { date: true } }, account: { select: { code: true, type: true } } },
  });

  // Build a map: accountCode → month → actual amount (net: debit - credit for ASSET/EXPENSE, credit - debit for REVENUE/LIABILITY)
  const actualMap = new Map<string, Map<number, Decimal>>();
  for (const line of actualLines) {
    const code = line.account.code;
    const month = line.journalEntry.date.getUTCMonth() + 1;
    const type = line.account.type;
    // Net movement in the "natural" direction for this account type
    const amount = (type === "ASSET" || type === "EXPENSE")
      ? new Decimal(line.debit).minus(line.credit)
      : new Decimal(line.credit).minus(line.debit);

    if (!actualMap.has(code)) actualMap.set(code, new Map());
    const monthMap = actualMap.get(code)!;
    monthMap.set(month, (monthMap.get(month) ?? new Decimal(0)).plus(amount));
  }

  // Build budget map: accountCode → month → budget amount
  const budgetMap = new Map<string, Map<number, number>>();
  for (const item of budget.items) {
    if (!budgetMap.has(item.accountCode)) budgetMap.set(item.accountCode, new Map());
    budgetMap.get(item.accountCode)!.set(item.month, Number(item.amount));
  }

  // Build rows
  const rows: BudgetVsActualRow[] = accounts.map((account: any) => {
    const monthData = targetMonths.map((m) => {
      const budgetAmt = budgetMap.get(account.code)?.get(m) ?? 0;
      const actualAmt = roundMoney(actualMap.get(account.code)?.get(m) ?? 0).toNumber();
      return {
        month: m,
        budget: budgetAmt,
        actual: actualAmt,
        variance: actualAmt - budgetAmt,
      };
    });

    const totalBudget = monthData.reduce((a, m) => a + m.budget, 0);
    const totalActual = monthData.reduce((a, m) => a + m.actual, 0);

    return {
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      months: monthData,
      totalBudget,
      totalActual,
      totalVariance: totalActual - totalBudget,
    };
  });

  return { budget, rows };
}

// ─── Upsert items (replace all items for the budget) ─────────────────────────

export async function upsertBudgetItems(
  companyId: string,
  membershipId: string,
  userId: string,
  budgetId: string,
  items: BudgetItemInput[]
) {
  await requirePermission(membershipId, "reports", "EDIT");

  const budget = await prisma.budget.findFirst({ where: { id: budgetId, companyId } });
  if (!budget) throw new Error("Budget not found");

  // Replace all items atomically
  await prisma.$transaction([
    prisma.budgetItem.deleteMany({ where: { budgetId } }),
    prisma.budgetItem.createMany({
      data: items.map((i) => ({
        budgetId,
        accountCode: i.accountCode,
        month: i.month,
        amount: i.amount,
      })),
    }),
  ]);

  await recordAuditEvent({
    companyId,
    userId,
    action: "budget.items_updated",
    entityType: "Budget",
    entityId: budgetId,
    newValue: { itemCount: items.length },
  });

  return prisma.budget.findFirst({ where: { id: budgetId }, include: { items: true } });
}
