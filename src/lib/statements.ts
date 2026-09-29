/**
 * Customer Statement (AR) and Supplier Statement (AP)
 *
 * A statement shows a chronological list of transactions (invoices, payments,
 * credit notes/bills, bill payments) for one party within a date range, with
 * a running balance, mirroring what that party would see on their own records.
 *
 * All amounts come from the source documents (Invoice, Bill, CreditNote) and
 * from the PAYMENT journal entries in the ledger — no separate payment table
 * that could drift from the ledger.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { sum, roundMoney } from "@/lib/currency";
import { getAccountsReceivableCode, getAccountsPayableCode } from "@/lib/accounts";
import Decimal from "decimal.js";

export type StatementEntryType = "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "BILL" | "BILL_PAYMENT";

export interface StatementEntry {
  date: Date;
  type: StatementEntryType;
  reference: string;
  description: string;
  debit: number;   // amount increasing the balance owed (invoice / bill)
  credit: number;  // amount reducing the balance owed (payment / credit note)
  balance: number; // running balance after this entry
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  companyName: string;
  currency: string;
  from: Date;
  to: Date;
  openingBalance: number;
  entries: StatementEntry[];
  closingBalance: number;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  companyName: string;
  currency: string;
  from: Date;
  to: Date;
  openingBalance: number;
  entries: StatementEntry[];
  closingBalance: number;
}

// ─── Customer Statement ───────────────────────────────────────────────────────

export async function customerStatement(
  companyId: string,
  membershipId: string,
  customerId: string,
  from: Date,
  to: Date
): Promise<CustomerStatement> {
  await requirePermission(membershipId, "invoices", "VIEW");
  await requirePermission(membershipId, "customers", "VIEW");

  const [company, customer] = await Promise.all([
    prisma.company.findFirstOrThrow({ where: { id: companyId }, select: { name: true } }),
    prisma.customer.findFirstOrThrow({ where: { id: customerId, companyId }, select: { name: true, currency: true } }),
  ]);

  // All non-void invoices for this customer
  const invoices = await prisma.invoice.findMany({
    where: { companyId, customerId, status: { not: "VOID" } },
    orderBy: { issueDate: "asc" },
  });

  // ── Compute opening balance ────────────────────────────────────────────────
  // Opening balance = unpaid AR as of (from - 1 day), i.e. invoices issued before
  // the period that still have a balance (total minus payments already received
  // before the period start).
  let openingBalance = new Decimal(0);

  const beforePeriodInvoices = invoices.filter((inv: any) => inv.issueDate < from);
  for (const inv of beforePeriodInvoices) {
    const paid = await sumInvoicePaymentsBefore(companyId, inv.id, inv.exchangeRate, from);
    const balance = new Decimal(inv.total).minus(paid);
    if (balance.gt(0.005)) {
      openingBalance = openingBalance.plus(balance);
    }
  }

  // ── Period transactions ────────────────────────────────────────────────────
  const periodInvoices = invoices.filter(
    (inv: any) => inv.issueDate >= from && inv.issueDate <= to
  );

  // Payments on ANY of this customer's invoices that were received in the period
  const exchangeRateByInvoiceId = new Map(invoices.map((i: any) => [i.id, i.exchangeRate]));
  const periodPayments = await periodPaymentsForInvoices(companyId, exchangeRateByInvoiceId, from, to);

  // Credit notes issued in the period for this customer
  const creditNotes = await prisma.creditNote.findMany({
    where: { companyId, customerId, issueDate: { gte: from, lte: to }, status: { not: "VOID" } },
    orderBy: { issueDate: "asc" },
  });

  // ── Build entries list ────────────────────────────────────────────────────
  const rawEntries: Array<{ date: Date; entry: Omit<StatementEntry, "balance"> }> = [];

  for (const inv of periodInvoices) {
    rawEntries.push({
      date: inv.issueDate,
      entry: {
        date: inv.issueDate,
        type: "INVOICE",
        reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}${inv.dueDate ? ` (due ${inv.dueDate.toISOString().slice(0, 10)})` : ""}`,
        debit: inv.total.toNumber(),
        credit: 0,
      },
    });
  }

  for (const pmt of periodPayments) {
    rawEntries.push({
      date: pmt.date,
      entry: {
        date: pmt.date,
        type: "PAYMENT",
        reference: pmt.entryNumber,
        description: pmt.memo ?? "Payment received",
        debit: 0,
        credit: pmt.amount,
      },
    });
  }

  for (const cn of creditNotes) {
    rawEntries.push({
      date: cn.issueDate,
      entry: {
        date: cn.issueDate,
        type: "CREDIT_NOTE",
        reference: cn.creditNumber,
        description: `Credit Note ${cn.creditNumber}${cn.reason ? ` — ${cn.reason}` : ""}`,
        debit: 0,
        credit: cn.total.toNumber(),
      },
    });
  }

  // Sort by date, then debit-before-credit within the same day
  rawEntries.sort((a, b) => {
    const dt = a.date.getTime() - b.date.getTime();
    if (dt !== 0) return dt;
    // invoices before payments on the same day
    if (a.entry.debit > 0 && b.entry.credit > 0) return -1;
    if (a.entry.credit > 0 && b.entry.debit > 0) return 1;
    return 0;
  });

  let running = openingBalance;
  const entries: StatementEntry[] = rawEntries.map(({ entry }) => {
    running = running.plus(entry.debit).minus(entry.credit);
    return { ...entry, balance: roundMoney(running).toNumber() };
  });

  return {
    customerId,
    customerName: customer.name,
    companyName: company.name,
    currency: customer.currency ?? "USD",
    from,
    to,
    openingBalance: roundMoney(openingBalance).toNumber(),
    entries,
    closingBalance: roundMoney(running).toNumber(),
  };
}

// ─── Supplier Statement ───────────────────────────────────────────────────────

export async function supplierStatement(
  companyId: string,
  membershipId: string,
  supplierId: string,
  from: Date,
  to: Date
): Promise<SupplierStatement> {
  await requirePermission(membershipId, "bills", "VIEW");
  await requirePermission(membershipId, "suppliers", "VIEW");

  const [company, supplier] = await Promise.all([
    prisma.company.findFirstOrThrow({ where: { id: companyId }, select: { name: true } }),
    prisma.supplier.findFirstOrThrow({ where: { id: supplierId, companyId }, select: { name: true, currency: true } }),
  ]);

  const bills = await prisma.bill.findMany({
    where: { companyId, supplierId, status: { not: "VOID" } },
    orderBy: { issueDate: "asc" },
  });

  // Opening balance
  let openingBalance = new Decimal(0);
  const beforePeriodBills = bills.filter((b: any) => b.issueDate < from);
  for (const bill of beforePeriodBills) {
    const paid = await sumBillPaymentsBefore(companyId, bill.id, from);
    const balance = new Decimal(bill.total).minus(paid);
    if (balance.gt(0.005)) {
      openingBalance = openingBalance.plus(balance);
    }
  }

  // Period bills
  const periodBills = bills.filter((b: any) => b.issueDate >= from && b.issueDate <= to);

  // Payments on all bills in the period
  const allBillIds = bills.map((b: any) => b.id);
  const periodPayments = await periodPaymentsForBills(companyId, allBillIds, from, to);

  const rawEntries: Array<{ date: Date; entry: Omit<StatementEntry, "balance"> }> = [];

  for (const bill of periodBills) {
    rawEntries.push({
      date: bill.issueDate,
      entry: {
        date: bill.issueDate,
        type: "BILL",
        reference: bill.billNumber,
        description: `Bill ${bill.billNumber}${bill.dueDate ? ` (due ${bill.dueDate.toISOString().slice(0, 10)})` : ""}`,
        debit: bill.total.toNumber(),
        credit: 0,
      },
    });
  }

  for (const pmt of periodPayments) {
    rawEntries.push({
      date: pmt.date,
      entry: {
        date: pmt.date,
        type: "BILL_PAYMENT",
        reference: pmt.entryNumber,
        description: pmt.memo ?? "Payment made",
        debit: 0,
        credit: pmt.amount,
      },
    });
  }

  rawEntries.sort((a, b) => {
    const dt = a.date.getTime() - b.date.getTime();
    if (dt !== 0) return dt;
    if (a.entry.debit > 0 && b.entry.credit > 0) return -1;
    if (a.entry.credit > 0 && b.entry.debit > 0) return 1;
    return 0;
  });

  let running = openingBalance;
  const entries: StatementEntry[] = rawEntries.map(({ entry }) => {
    running = running.plus(entry.debit).minus(entry.credit);
    return { ...entry, balance: roundMoney(running).toNumber() };
  });

  return {
    supplierId,
    supplierName: supplier.name,
    companyName: company.name,
    currency: supplier.currency ?? "USD",
    from,
    to,
    openingBalance: roundMoney(openingBalance).toNumber(),
    entries,
    closingBalance: roundMoney(running).toNumber(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sum of all payments on an invoice posted BEFORE a given date, in the
 * invoice's own currency. Summed from the AR-credit lines (base currency)
 * and divided by `exchangeRate`, matching sumInvoicePayments in
 * src/lib/sales.ts — a raw Bank-debit sum is in base currency and would
 * misstate this for a foreign-currency invoice.
 */
async function sumInvoicePaymentsBefore(
  companyId: string,
  invoiceId: string,
  exchangeRate: Decimal.Value,
  before: Date
): Promise<Decimal> {
  const [entries, accountsReceivableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: "PAYMENT",
        sourceId: { startsWith: `${invoiceId}:` },
        status: "POSTED",
        date: { lt: before },
      },
      include: { lines: { include: { account: true } } },
    }),
    getAccountsReceivableCode(companyId),
  ]);
  const arCredits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === accountsReceivableCode));
  return roundMoney(sum(arCredits.map((l: any) => l.credit)).dividedBy(exchangeRate));
}

/** Payments on a list of invoices that fall within a date range, each
 *  converted to its own invoice's currency (see sumInvoicePaymentsBefore
 *  above for why AR-credit ÷ exchangeRate rather than a raw Bank-debit sum). */
async function periodPaymentsForInvoices(
  companyId: string,
  exchangeRateByInvoiceId: Map<string, Decimal.Value>,
  from: Date,
  to: Date
): Promise<Array<{ date: Date; entryNumber: string; memo: string | null; amount: number }>> {
  if (exchangeRateByInvoiceId.size === 0) return [];

  // PAYMENT sourceId = "${invoiceId}:${paymentRef}". We need to find entries
  // where sourceId starts with any of our invoice IDs. Prisma doesn't support
  // OR startsWith in a single query; use raw startsWith on each and deduplicate.
  const [entries, accountsReceivableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: "PAYMENT",
        status: "POSTED",
        date: { gte: from, lte: to },
      },
      include: { lines: { include: { account: true } } },
    }),
    getAccountsReceivableCode(companyId),
  ]);

  const result = [];
  for (const entry of entries) {
    if (!entry.sourceId) continue;
    const sourceInvoiceId = entry.sourceId.split(":")[0]!;
    const exchangeRate = exchangeRateByInvoiceId.get(sourceInvoiceId);
    if (exchangeRate === undefined) continue;

    const arCredits = entry.lines.filter((l: any) => l.account.code === accountsReceivableCode);
    const amount = roundMoney(sum(arCredits.map((l: any) => l.credit)).dividedBy(exchangeRate)).toNumber();
    if (amount > 0.005) {
      result.push({
        date: entry.date,
        entryNumber: entry.entryNumber,
        memo: entry.memo,
        amount,
      });
    }
  }
  return result;
}

async function sumBillPaymentsBefore(
  companyId: string,
  billId: string,
  before: Date
): Promise<Decimal> {
  const [entries, accountsPayableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: "PAYMENT",
        sourceId: { startsWith: `${billId}:` },
        status: "POSTED",
        date: { lt: before },
      },
      include: { lines: { include: { account: true } } },
    }),
    getAccountsPayableCode(companyId),
  ]);
  const apCredits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === accountsPayableCode));
  return roundMoney(sum(apCredits.map((l: any) => l.debit)));
}

async function periodPaymentsForBills(
  companyId: string,
  billIds: string[],
  from: Date,
  to: Date
): Promise<Array<{ date: Date; entryNumber: string; memo: string | null; amount: number }>> {
  if (billIds.length === 0) return [];

  const [entries, accountsPayableCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: "PAYMENT",
        status: "POSTED",
        date: { gte: from, lte: to },
      },
      include: { lines: { include: { account: true } } },
    }),
    getAccountsPayableCode(companyId),
  ]);

  const result = [];
  for (const entry of entries) {
    if (!entry.sourceId) continue;
    const isForOneOfOurBills = billIds.some((id) => entry.sourceId!.startsWith(`${id}:`));
    if (!isForOneOfOurBills) continue;

    const apDebits = entry.lines.filter((l: any) => l.account.code === accountsPayableCode);
    const amount = roundMoney(sum(apDebits.map((l: any) => l.debit))).toNumber();
    if (amount > 0.005) {
      result.push({
        date: entry.date,
        entryNumber: entry.entryNumber,
        memo: entry.memo,
        amount,
      });
    }
  }
  return result;
}
