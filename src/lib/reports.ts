import { prisma } from "@/lib/db";
import { sum, roundMoney, money } from "@/lib/currency";
// ─────────────────────────────────────────────────────────────────────────
// Ledger — monthly and yearly
// ─────────────────────────────────────────────────────────────────────────

export type LedgerPeriod = "monthly" | "yearly";

export interface LedgerPeriodRange {
  period: LedgerPeriod;
  /** "YYYY-MM" for monthly, "YYYY" for yearly. */
  value: string;
  label: string;
  from: Date;
  /** Inclusive end: the last millisecond of the period (UTC). */
  to: Date;
  prev: string;
  next: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthValue(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Resolves a period + value from the URL into a UTC date range. Anything
 *  missing or malformed falls back to the period containing `now`. */
export function ledgerPeriodRange(
  period: string | undefined,
  value: string | undefined,
  now: Date = new Date()
): LedgerPeriodRange {
  if (period === "yearly") {
    const parsed = value && /^\d{4}$/.test(value) ? parseInt(value, 10) : NaN;
    const year = parsed >= 1900 && parsed <= 9999 ? parsed : now.getUTCFullYear();
    return {
      period: "yearly",
      value: String(year),
      label: String(year),
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1) - 1),
      prev: String(year - 1),
      next: String(year + 1),
    };
  }

  const m = value?.match(/^(\d{4})-(\d{2})$/);
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (y >= 1900 && mo >= 1 && mo <= 12) {
      year = y;
      monthIndex = mo - 1;
    }
  }
  return {
    period: "monthly",
    value: monthValue(year, monthIndex),
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1) - 1),
    prev: monthValue(year, monthIndex - 1),
    next: monthValue(year, monthIndex + 1),
  };
}

export interface LedgerAccountInput {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface LedgerLineInput {
  accountId: string;
  date: Date;
  entryNumber: string;
  memo: string | null;
  description: string | null;
  debit: Decimal.Value;
  credit: Decimal.Value;
}

export interface LedgerEntryRow {
  date: Date;
  entryNumber: string;
  memo: string | null;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
}

export interface LedgerMonthRow {
  /** "YYYY-MM" */
  month: string;
  label: string;
  debit: Decimal;
  credit: Decimal;
  closing: Decimal;
}

export interface LedgerAccountSection {
  accountCode: string;
  accountName: string;
  type: string;
  opening: Decimal;
  entries: LedgerEntryRow[];
  months: LedgerMonthRow[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  closing: Decimal;
}

/** Assets and expenses carry a natural debit balance; everything else a
 *  natural credit balance. Balances below are shown in the natural sign so
 *  a normal account reads positive. */
function naturalSign(type: string): 1 | -1 {
  return type === "ASSET" || type === "EXPENSE" ? 1 : -1;
}

/** Pure ledger builder (no DB) — opening balance, every entry with a running
 *  balance, a month-by-month rollup, and the closing balance for each
 *  account. Accounts with no opening balance and no activity are dropped. */
export function buildLedger(
  accounts: LedgerAccountInput[],
  openingByAccount: Map<string, { debit: Decimal.Value; credit: Decimal.Value }>,
  lines: LedgerLineInput[],
  from: Date,
  to: Date
): LedgerAccountSection[] {
  const sorted = [...lines].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.entryNumber.localeCompare(b.entryNumber)
  );

  // Every month the period covers, so quiet months still show a row.
  const monthKeys: string[] = [];
  for (let i = 0; Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1) <= to.getTime(); i++) {
    monthKeys.push(monthValue(from.getUTCFullYear(), from.getUTCMonth() + i));
  }

  const sections: LedgerAccountSection[] = [];
  for (const account of accounts) {
    const sign = naturalSign(account.type);
    const open = openingByAccount.get(account.id);
    const opening = roundMoney(
      open ? money(open.debit).minus(open.credit).times(sign) : 0
    );
    const own = sorted.filter((l) => l.accountId === account.id);
    if (own.length === 0 && opening.isZero()) continue;

    let running = opening;
    const entries: LedgerEntryRow[] = own.map((l) => {
      const debit = roundMoney(l.debit);
      const credit = roundMoney(l.credit);
      running = roundMoney(running.plus(debit.minus(credit).times(sign)));
      return {
        date: l.date,
        entryNumber: l.entryNumber,
        memo: l.description || l.memo,
        debit,
        credit,
        balance: running,
      };
    });

    let monthRunning = opening;
    const months: LedgerMonthRow[] = monthKeys.map((key) => {
      const inMonth = entries.filter((e) => monthValue(e.date.getUTCFullYear(), e.date.getUTCMonth()) === key);
      const debit = roundMoney(sum(inMonth.map((e) => e.debit)));
      const credit = roundMoney(sum(inMonth.map((e) => e.credit)));
      monthRunning = roundMoney(monthRunning.plus(debit.minus(credit).times(sign)));
      const [y, mo] = key.split("-").map((n) => parseInt(n, 10));
      return { month: key, label: `${MONTH_NAMES[mo - 1].slice(0, 3)} ${y}`, debit, credit, closing: monthRunning };
    });

    sections.push({
      accountCode: account.code,
      accountName: account.name,
      type: account.type,
      opening,
      entries,
      months,
      totalDebit: roundMoney(sum(entries.map((e) => e.debit))),
      totalCredit: roundMoney(sum(entries.map((e) => e.credit))),
      closing: running,
    });
  }
  return sections;
}

/** General ledger for a date range, computed live from POSTED entries. Pass
 *  `accountCode` to limit it to one account. */
export async function ledgerReport(companyId: string, from: Date, to: Date, accountCode?: string) {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true, ...(accountCode ? { code: accountCode } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const [openingGroups, lines] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: accountIds },
        journalEntry: { companyId, status: "POSTED", date: { lt: from } },
      },
      _sum: { debit: true, credit: true },
    }),
    prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } },
      },
      include: { journalEntry: { select: { date: true, entryNumber: true, memo: true } } },
    }),
  ]);

  const openingByAccount = new Map(
    openingGroups.map((g) => [g.accountId, { debit: g._sum.debit ?? 0, credit: g._sum.credit ?? 0 }])
  );

  return buildLedger(
    accounts,
    openingByAccount,
    lines.map((l) => ({
      accountId: l.accountId,
      date: l.journalEntry.date,
      entryNumber: l.journalEntry.entryNumber,
      memo: l.journalEntry.memo,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
    from,
    to
  );
}

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
