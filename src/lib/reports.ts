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

export interface AgingRow {
  id: string;
  number: string;
  partyName: string;
  dueDate: Date;
  total: number;
  paid: number;
  balance: number;
  bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

export function agingBucket(dueDate: Date, asOf: Date): AgingRow["bucket"] {
  const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / 86400000);
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

/** Accounts Receivable aging — unpaid/partially-paid invoices only,
 *  bucketed by days past due date. Balance is total minus payments
 *  actually posted against that invoice (via JournalSourceType.PAYMENT
 *  entries whose sourceId is prefixed with the invoice id), not a status
 *  flag alone. */
export async function arAging(companyId: string, asOf: Date = new Date()): Promise<AgingRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
    include: { customer: true },
  });

  const rows: AgingRow[] = [];
  for (const inv of invoices) {
    const payments = await prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${inv.id}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    });
    const paid = sum(
      payments.flatMap((e) => e.lines.filter((l) => l.account.code === "1100")).map((l) => l.credit)
    ).toNumber();
    const balance = inv.total.toNumber() - paid;
    if (balance <= 0.005) continue;

    rows.push({
      id: inv.id,
      number: inv.invoiceNumber,
      partyName: inv.customer.name,
      dueDate: inv.dueDate,
      total: inv.total.toNumber(),
      paid,
      balance,
      bucket: agingBucket(inv.dueDate, asOf),
    });
  }
  return rows;
}

/** Accounts Payable aging — the same shape for bills. */
export async function apAging(companyId: string, asOf: Date = new Date()): Promise<AgingRow[]> {
  const bills = await prisma.bill.findMany({
    where: { companyId, status: { in: ["APPROVED", "PARTIALLY_PAID", "OVERDUE"] } },
    include: { supplier: true },
  });

  const rows: AgingRow[] = [];
  for (const bill of bills) {
    const payments = await prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${bill.id}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    });
    const paid = sum(
      payments.flatMap((e) => e.lines.filter((l) => l.account.code === "2000")).map((l) => l.debit)
    ).toNumber();
    const balance = bill.total.toNumber() - paid;
    if (balance <= 0.005) continue;

    rows.push({
      id: bill.id,
      number: bill.billNumber,
      partyName: bill.supplier.name,
      dueDate: bill.dueDate,
      total: bill.total.toNumber(),
      paid,
      balance,
      bucket: agingBucket(bill.dueDate, asOf),
    });
  }
  return rows;
}

/** VAT return — output tax (credits on the Output Tax Payable account)
 *  minus input tax (debits on Input Tax Receivable) for the period, from
 *  posted entries only. Net positive = owed to the tax authority; net
 *  negative = a refund/credit position. */
export async function vatReturn(companyId: string, from: Date, to: Date) {
  const [outputAccount, inputAccount] = await Promise.all([
    prisma.account.findFirst({ where: { companyId, code: "2100" } }),
    prisma.account.findFirst({ where: { companyId, code: "1200" } }),
  ]);

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: [outputAccount?.id, inputAccount?.id].filter(Boolean) as string[] },
      journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } },
    },
  });

  const outputTax = roundMoney(sum(lines.filter((l) => l.accountId === outputAccount?.id).map((l) => l.credit)));
  const inputTax = roundMoney(sum(lines.filter((l) => l.accountId === inputAccount?.id).map((l) => l.debit)));

  return {
    from,
    to,
    outputTax,
    inputTax,
    netPayable: roundMoney(outputTax.minus(inputTax)),
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
