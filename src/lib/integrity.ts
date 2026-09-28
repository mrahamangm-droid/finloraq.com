import { prisma } from "@/lib/db";
import { sum, roundMoney, isZero } from "@/lib/currency";
import { arAging, apAging, balanceSheet } from "@/lib/reports";
import {
  findUnbalancedEntries,
  findDuplicateSourcePostings,
  findOrphanedReversals,
  findNegativeLines,
  type IntegrityIssue,
} from "@/lib/integrityChecks";

/**
 * Whole-ledger integrity / reconciliation checker — reads the posted
 * ledger back and re-verifies the invariants the rest of the codebase
 * relies on, instead of trusting that every write path enforced them
 * correctly. Every check here is read-only: it never repairs data (a
 * mis-posted entry is corrected the way the ledger already requires —
 * reverseJournalEntry() — never by silently editing history), it only
 * detects and reports.
 *
 * This matters even though src/lib/ledger.ts already validates
 * debit=credit before every write (validateBalanced()): that check runs
 * in application code, not as a database constraint, so it only protects
 * data written through postJournalEntry() — never a hand-run SQL fix, a
 * bug in a future code path, or a genuine race condition in the current
 * one (see findDuplicateSourcePostings in src/lib/integrityChecks.ts). A
 * legal/audit context is exactly where "we're pretty sure the app
 * enforces this" isn't good enough — this module is the independent
 * check. The actual detection logic is pure and lives in
 * integrityChecks.ts; this file is just the DB fetch + two live
 * control-account reconciliations that need real report data.
 */

export interface IntegrityCheckResult {
  name: string;
  description: string;
  passed: boolean;
  issues: IntegrityIssue[];
}

export interface IntegrityReport {
  companyId: string;
  asOf: Date;
  generatedAt: Date;
  checks: IntegrityCheckResult[];
  allPassed: boolean;
}

/**
 * Full integrity/reconciliation sweep for one company. Runs the pure
 * checks in integrityChecks.ts against the posted ledger, plus two
 * control-account reconciliations against the reports every user-facing
 * screen already relies on (src/lib/reports.ts): the Accounts
 * Receivable / Accounts Payable control account balance (account codes
 * 1100 / 2000) must equal the sum of open invoice/bill balances
 * (arAging/apAging) — both are derived from the same posted lines by
 * different code paths, so any drift here is a real bug in one of them,
 * not a data-entry mistake.
 */
export type NonBaseCurrencyRecord = {
  record: "journal entry" | "invoice" | "bill";
  reference: string;
  status: string;
  date: string;
  currency: string;
  amount: string;
};

/**
 * Read-only: every journal entry, invoice and bill whose currency isn't the
 * company's base currency. Before the base-currency guard in
 * postJournalEntry(), these could be created through the API and were posted
 * at an exchange rate of 1, so reports summed their amounts as if they were
 * base currency. This only lists them; nothing is changed.
 */
export async function nonBaseCurrencyRecords(companyId: string): Promise<{ baseCurrency: string; records: NonBaseCurrencyRecord[] }> {
  const { baseCurrency } = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { baseCurrency: true } });
  // Case-insensitive: codes are stored uppercase from now on, but rows saved
  // earlier may be lowercase ("aed") and are still the base currency.
  const notBase = { NOT: { currency: { equals: baseCurrency, mode: "insensitive" as const } } };
  const [entries, invoices, bills] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, ...notBase },
      select: { entryNumber: true, status: true, date: true, currency: true, lines: { select: { debit: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.invoice.findMany({
      where: { companyId, ...notBase },
      select: { invoiceNumber: true, status: true, issueDate: true, currency: true, total: true },
      orderBy: { issueDate: "asc" },
    }),
    prisma.bill.findMany({
      where: { companyId, ...notBase },
      select: { billNumber: true, status: true, issueDate: true, currency: true, total: true },
      orderBy: { issueDate: "asc" },
    }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    baseCurrency,
    records: [
      ...entries.map((e) => ({ record: "journal entry" as const, reference: e.entryNumber, status: e.status, date: day(e.date), currency: e.currency, amount: roundMoney(sum(e.lines.map((l) => l.debit))).toFixed(2) })),
      ...invoices.map((i) => ({ record: "invoice" as const, reference: i.invoiceNumber, status: i.status, date: day(i.issueDate), currency: i.currency, amount: i.total.toFixed(2) })),
      ...bills.map((b) => ({ record: "bill" as const, reference: b.billNumber, status: b.status, date: day(b.issueDate), currency: b.currency, amount: b.total.toFixed(2) })),
    ],
  };
}

export async function runIntegrityCheck(companyId: string, asOf: Date = new Date()): Promise<IntegrityReport> {
  const [entries, sheet, ar, ap, foreign] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, status: "POSTED", date: { lte: asOf } },
      select: { id: true, entryNumber: true, sourceType: true, sourceId: true, reversalOfId: true, lines: { select: { id: true, debit: true, credit: true } } },
    }),
    balanceSheet(companyId, asOf),
    arAging(companyId, asOf),
    apAging(companyId, asOf),
    nonBaseCurrencyRecords(companyId),
  ]);

  const entryIds = new Set<string>(entries.map((e) => e.id));
  const allLines = entries.flatMap((e) => e.lines);

  const [arControlAccount, apControlAccount] = await Promise.all([
    prisma.account.findFirst({ where: { companyId, code: "1100" } }),
    prisma.account.findFirst({ where: { companyId, code: "2000" } }),
  ]);
  const [arControlLines, apControlLines] = await Promise.all([
    arControlAccount
      ? prisma.journalLine.findMany({ where: { accountId: arControlAccount.id, journalEntry: { companyId, status: "POSTED", date: { lte: asOf } } } })
      : Promise.resolve([]),
    apControlAccount
      ? prisma.journalLine.findMany({ where: { accountId: apControlAccount.id, journalEntry: { companyId, status: "POSTED", date: { lte: asOf } } } })
      : Promise.resolve([]),
  ]);

  const arControlBalance = roundMoney(sum(arControlLines.map((l) => l.debit)).minus(sum(arControlLines.map((l) => l.credit))));
  const arAgingTotal = roundMoney(sum(ar.map((r) => r.balance)));
  const apControlBalance = roundMoney(sum(apControlLines.map((l) => l.credit)).minus(sum(apControlLines.map((l) => l.debit))));
  const apAgingTotal = roundMoney(sum(ap.map((r) => r.balance)));

  const checks: IntegrityCheckResult[] = [
    {
      name: "entry-balance",
      description: "Every posted journal entry's own debits equal its own credits.",
      issues: findUnbalancedEntries(entries),
      passed: true,
    },
    {
      name: "duplicate-source-postings",
      description: "No source document (invoice, bill, payment, expense, ...) has posted more than one journal entry.",
      issues: findDuplicateSourcePostings(entries),
      passed: true,
    },
    {
      name: "orphaned-reversals",
      description: "Every reversal entry references a real original entry.",
      issues: findOrphanedReversals(entries, entryIds),
      passed: true,
    },
    {
      name: "negative-line-amounts",
      description: "No journal line has a negative debit or credit.",
      issues: findNegativeLines(allLines),
      passed: true,
    },
    {
      name: "balance-sheet-identity",
      description: "Assets = Liabilities + Equity, as of the check date.",
      issues: isZero(sheet.outOfBalance) ? [] : [{ outOfBalance: sheet.outOfBalance.toFixed(2), totalAssets: sheet.totalAssets.toFixed(2), totalLiabilities: sheet.totalLiabilities.toFixed(2), totalEquity: sheet.totalEquity.toFixed(2) }],
      passed: true,
    },
    {
      name: "ar-control-reconciliation",
      description: "The Accounts Receivable control account balance (1100) matches the sum of open invoice balances (AR aging).",
      issues: arControlBalance.equals(arAgingTotal) ? [] : [{ controlAccountBalance: arControlBalance.toFixed(2), arAgingTotal: arAgingTotal.toFixed(2), difference: roundMoney(arControlBalance.minus(arAgingTotal)).toFixed(2) }],
      passed: true,
    },
    {
      name: "ap-control-reconciliation",
      description: "The Accounts Payable control account balance (2000) matches the sum of open bill balances (AP aging).",
      issues: apControlBalance.equals(apAgingTotal) ? [] : [{ controlAccountBalance: apControlBalance.toFixed(2), apAgingTotal: apAgingTotal.toFixed(2), difference: roundMoney(apControlBalance.minus(apAgingTotal)).toFixed(2) }],
      passed: true,
    },
    {
      name: "base-currency-only",
      description: `Every journal entry, invoice and bill is in the base currency (${foreign.baseCurrency}). Anything listed was recorded at a rate of 1 and is counted as ${foreign.baseCurrency} in every report.`,
      issues: foreign.records,
      passed: true,
    },
  ].map((c) => ({ ...c, passed: c.issues.length === 0 }));

  return {
    companyId,
    asOf,
    generatedAt: new Date(),
    checks,
    allPassed: checks.every((c) => c.passed),
  };
}
