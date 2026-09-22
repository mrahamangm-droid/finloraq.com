import { prisma } from "@/lib/db";
import { sum, roundMoney } from "@/lib/currency";
import type Decimal from "decimal.js";

/**
 * Every report here is computed live from JournalLine rows on POSTED
 * entries — there is no separate "reporting totals" table that could drift
 * from the ledger. Slower than a materialized cache, correct by
 * construction; add caching later if it's ever a bottleneck, but never let
 * a cache become a second source of truth.
 */

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  type: string;
  debit: Decimal;
  credit: Decimal;
}

export async function trialBalance(companyId: string, asOf: Date): Promise<TrialBalanceRow[]> {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
    include: {
      journalLines: {
        where: { journalEntry: { companyId, status: "POSTED", date: { lte: asOf } } },
      },
    },
  });

  return accounts
    .map((account) => {
      const debit = sum(account.journalLines.map((l) => l.debit));
      const credit = sum(account.journalLines.map((l) => l.credit));
      return {
        accountCode: account.code,
        accountName: account.name,
        type: account.type,
        debit: roundMoney(debit),
        credit: roundMoney(credit),
      };
    })
    .filter((row) => !row.debit.isZero() || !row.credit.isZero());
}

export async function generalLedger(companyId: string, accountCode: string, from: Date, to: Date) {
  const account = await prisma.account.findFirstOrThrow({ where: { companyId, code: accountCode } });

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } },
    },
    include: { journalEntry: true },
    orderBy: { journalEntry: { date: "asc" } },
  });

  let running = roundMoney(0);
  const sign = account.type === "ASSET" || account.type === "EXPENSE" ? 1 : -1;

  return lines.map((line) => {
    running = running.plus(line.debit.minus(line.credit).times(sign));
    return {
      date: line.journalEntry.date,
      entryNumber: line.journalEntry.entryNumber,
      memo: line.journalEntry.memo,
      debit: line.debit,
      credit: line.credit,
      runningBalance: roundMoney(running),
    };
  });
}

export async function profitAndLoss(companyId: string, from: Date, to: Date) {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true, type: { in: ["REVENUE", "EXPENSE"] } },
    include: {
      journalLines: {
        where: { journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } } },
      },
    },
  });

  const revenue = accounts.filter((a) => a.type === "REVENUE");
  const expense = accounts.filter((a) => a.type === "EXPENSE");

  const revenueLines = revenue.map((a) => ({
    accountCode: a.code,
    accountName: a.name,
    // Revenue accounts carry a natural credit balance.
    amount: roundMoney(sum(a.journalLines.map((l) => l.credit)).minus(sum(a.journalLines.map((l) => l.debit)))),
  }));
  const expenseLines = expense.map((a) => ({
    accountCode: a.code,
    accountName: a.name,
    // Expense accounts carry a natural debit balance.
    amount: roundMoney(sum(a.journalLines.map((l) => l.debit)).minus(sum(a.journalLines.map((l) => l.credit)))),
  }));

  const totalRevenue = roundMoney(sum(revenueLines.map((l) => l.amount)));
  const totalExpense = roundMoney(sum(expenseLines.map((l) => l.amount)));

  return {
    from, to,
    revenue: revenueLines,
    expense: expenseLines,
    totalRevenue,
    totalExpense,
    netProfit: roundMoney(totalRevenue.minus(totalExpense)),
  };
}

export async function balanceSheet(companyId: string, asOf: Date) {
  const rows = await trialBalance(companyId, asOf);

  const byType = (type: string) =>
    rows
      .filter((r) => r.type === type)
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        // Assets/expenses are natural-debit; liabilities/equity/revenue are natural-credit.
        amount:
          type === "ASSET"
            ? roundMoney(r.debit.minus(r.credit))
            : roundMoney(r.credit.minus(r.debit)),
      }));

  const assets = byType("ASSET");
  const liabilities = byType("LIABILITY");
  const equity = byType("EQUITY");

  const totalAssets = roundMoney(sum(assets.map((a) => a.amount)));
  const totalLiabilities = roundMoney(sum(liabilities.map((a) => a.amount)));
  const totalEquity = roundMoney(sum(equity.map((a) => a.amount)));

  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    // The fundamental accounting equation — if this is ever nonzero, the
    // ledger itself is broken, not just this report.
    outOfBalance: roundMoney(totalAssets.minus(totalLiabilities.plus(totalEquity))),
  };
}
