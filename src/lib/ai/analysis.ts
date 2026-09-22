import { prisma } from "@/lib/db";

/**
 * Deterministic analysis — no AI call involved. These back the copilot's
 * "find duplicate invoices", "largest expenses" and anomaly-detection
 * answers with actual query results, not a model's guess, matching the
 * spec's "AI must never invent financial figures" rule by simply not
 * asking the model to produce figures in the first place.
 */

/** Same supplier, same total, issued within 7 days of each other — the
 *  classic duplicate-entry signature (someone re-keyed the same bill). */
export async function findDuplicateBills(companyId: string) {
  const bills = await prisma.bill.findMany({
    where: { companyId, status: { not: "VOID" } },
    include: { supplier: true },
    orderBy: { issueDate: "asc" },
  });

  const duplicates: { a: typeof bills[number]; b: typeof bills[number] }[] = [];
  for (let i = 0; i < bills.length; i++) {
    for (let j = i + 1; j < bills.length; j++) {
      const a = bills[i]!;
      const b = bills[j]!;
      if (a.supplierId !== b.supplierId) continue;
      if (!a.total.equals(b.total)) continue;
      const daysApart = Math.abs(a.issueDate.getTime() - b.issueDate.getTime()) / 86400000;
      if (daysApart <= 7) duplicates.push({ a, b });
    }
  }

  return duplicates.map(({ a, b }) => ({
    supplierName: a.supplier.name,
    amount: a.total.toNumber(),
    billNumbers: [a.billNumber, b.billNumber],
    daysApart: Math.round(Math.abs(a.issueDate.getTime() - b.issueDate.getTime()) / 86400000),
  }));
}

export async function findDuplicateInvoices(companyId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: { not: "VOID" } },
    include: { customer: true },
    orderBy: { issueDate: "asc" },
  });

  const duplicates: { a: typeof invoices[number]; b: typeof invoices[number] }[] = [];
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i]!;
      const b = invoices[j]!;
      if (a.customerId !== b.customerId) continue;
      if (!a.total.equals(b.total)) continue;
      const daysApart = Math.abs(a.issueDate.getTime() - b.issueDate.getTime()) / 86400000;
      if (daysApart <= 7) duplicates.push({ a, b });
    }
  }

  return duplicates.map(({ a, b }) => ({
    customerName: a.customer.name,
    amount: a.total.toNumber(),
    invoiceNumbers: [a.invoiceNumber, b.invoiceNumber],
    daysApart: Math.round(Math.abs(a.issueDate.getTime() - b.issueDate.getTime()) / 86400000),
  }));
}

/** Largest expense-account postings this period, by account. */
export async function largestExpenses(companyId: string, from: Date, to: Date, limit = 10) {
  const lines = await prisma.journalLine.findMany({
    where: {
      account: { companyId, type: "EXPENSE" },
      journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } },
    },
    include: { account: true, journalEntry: true },
    orderBy: { debit: "desc" },
    take: limit,
  });

  return lines
    .filter((l) => l.debit.gt(0))
    .map((l) => ({
      accountName: l.account.name,
      amount: l.debit.toNumber(),
      date: l.journalEntry.date,
      memo: l.journalEntry.memo ?? l.description,
    }));
}

/** Flags an expense-account posting as anomalous when it's more than 3x
 *  that account's average posting over the trailing 90 days (excluding
 *  itself). A simple, explainable threshold — not a trained model — so
 *  "why was this flagged" always has a plain answer. */
export async function detectExpenseAnomalies(companyId: string, asOf: Date = new Date()) {
  const windowStart = new Date(asOf.getTime() - 90 * 86400000);

  const lines = await prisma.journalLine.findMany({
    where: {
      account: { companyId, type: "EXPENSE" },
      journalEntry: { companyId, status: "POSTED", date: { gte: windowStart, lte: asOf } },
    },
    include: { account: true, journalEntry: true },
  });

  const byAccount = new Map<string, typeof lines>();
  for (const line of lines) {
    byAccount.set(line.accountId, [...(byAccount.get(line.accountId) ?? []), line]);
  }

  const anomalies: { accountName: string; amount: number; average: number; date: Date; memo: string | null }[] = [];
  for (const [, accountLines] of byAccount) {
    if (accountLines.length < 3) continue; // not enough history to call anything anomalous
    const amounts = accountLines.map((l) => l.debit.toNumber()).filter((a) => a > 0);
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    for (const line of accountLines) {
      const amount = line.debit.toNumber();
      if (amount > average * 3 && amount > 0) {
        anomalies.push({
          accountName: line.account.name,
          amount,
          average: Math.round(average * 100) / 100,
          date: line.journalEntry.date,
          memo: line.journalEntry.memo ?? line.description,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.amount - a.amount);
}
