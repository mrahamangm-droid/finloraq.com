import { prisma } from "@/lib/db";
import { arAging, apAging, trialBalance } from "@/lib/reports";
import { roundMoney } from "@/lib/currency";

/**
 * Current cash = the Bank account's (code "1000") balance in the trial
 * balance — i.e. derived from posted ledger entries, the same source of
 * truth as every other report, not a separately-tracked running total
 * that could drift from it.
 */
export async function currentCashPosition(companyId: string) {
  const rows = await trialBalance(companyId, new Date());
  const bank = rows.find((r) => r.accountCode === "1000");
  return bank ? roundMoney(bank.debit.minus(bank.credit)).toNumber() : 0;
}

/**
 * 30/60/90-day cash-flow forecast: current cash, plus expected inflows
 * (AR balances due within each horizon) minus expected outflows (AP
 * balances due within each horizon). This is a receivables/payables-due
 * projection, not a statistical model of payment behavior — it answers
 * "if everyone pays what they owe, on time" which is the honest, explicit
 * assumption a first cash-flow feature should make explicit rather than
 * dress up as a prediction.
 */
export async function cashFlowForecast(companyId: string) {
  const now = new Date();
  const [cash, ar, ap] = await Promise.all([
    currentCashPosition(companyId),
    arAging(companyId, now),
    apAging(companyId, now),
  ]);

  const horizonDays = [30, 60, 90] as const;
  const withinDays = (dueDate: Date, days: number) => {
    const diff = (dueDate.getTime() - now.getTime()) / 86400000;
    return diff <= days; // includes already-overdue amounts — those are due now, not excluded
  };

  const buckets = horizonDays.map((days) => {
    const inflow = ar.filter((r) => withinDays(r.dueDate, days)).reduce((a, r) => a + r.balance, 0);
    const outflow = ap.filter((r) => withinDays(r.dueDate, days)).reduce((a, r) => a + r.balance, 0);
    return {
      days,
      expectedInflow: roundMoney(inflow).toNumber(),
      expectedOutflow: roundMoney(outflow).toNumber(),
      projectedCash: roundMoney(cash + inflow - outflow).toNumber(),
    };
  });

  return { asOf: now, currentCash: cash, buckets };
}

/** Customer payment behavior: average days late across their PAID
 *  invoices' actual payment postings vs due date. Empty/positive-only
 *  companies (no history yet) legitimately return an empty list. */
export async function customerPaymentBehavior(companyId: string) {
  const paidInvoices = await prisma.invoice.findMany({
    where: { companyId, status: "PAID" },
    include: { customer: true },
  });

  const results: { customerId: string; customerName: string; avgDaysLate: number; invoiceCount: number }[] = [];
  const byCustomer = new Map<string, typeof paidInvoices>();
  for (const inv of paidInvoices) {
    byCustomer.set(inv.customerId, [...(byCustomer.get(inv.customerId) ?? []), inv]);
  }

  for (const [customerId, invoices] of byCustomer) {
    const daysLateList: number[] = [];
    for (const inv of invoices) {
      const lastPayment = await prisma.journalEntry.findFirst({
        where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${inv.id}:` }, status: "POSTED" },
        orderBy: { date: "desc" },
      });
      if (lastPayment) {
        const daysLate = Math.round((lastPayment.date.getTime() - inv.dueDate.getTime()) / 86400000);
        daysLateList.push(daysLate);
      }
    }
    if (daysLateList.length > 0) {
      results.push({
        customerId,
        customerName: invoices[0]!.customer.name,
        avgDaysLate: Math.round(daysLateList.reduce((a, d) => a + d, 0) / daysLateList.length),
        invoiceCount: daysLateList.length,
      });
    }
  }

  return results.sort((a, b) => b.avgDaysLate - a.avgDaysLate);
}
