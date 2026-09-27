import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { postJournalEntry, buildInvoicePosting, buildInvoicePaymentPosting, InvalidLineError } from "@/lib/ledger";
import { money, roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

/** Draft only — no ledger impact. Revenue is recognized in postInvoiceToLedger(). */
export async function createInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  lines: InvoiceLineInput[];
}) {
  await requirePermission(params.membershipId, "invoices", "CREATE");

  if (params.lines.length === 0) {
    throw new InvalidLineError("An invoice needs at least one line.");
  }

  const taxCodes = await prisma.taxCode.findMany({
    where: { companyId: params.companyId, id: { in: params.lines.map((l) => l.taxCodeId).filter(Boolean) as string[] } },
  });
  const taxCodeById = new Map(taxCodes.map((t) => [t.id, t]));

  const computedLines = params.lines.map((l) => {
    const lineTotal = roundMoney(money(l.quantity).times(l.unitPrice));
    const taxCode = l.taxCodeId ? taxCodeById.get(l.taxCodeId) : undefined;
    const lineTax = taxCode ? roundMoney(lineTotal.times(taxCode.rate)) : roundMoney(0);
    return { ...l, lineTotal, lineTax };
  });

  const subtotal = roundMoney(sum(computedLines.map((l) => l.lineTotal)));
  const taxTotal = roundMoney(sum(computedLines.map((l) => l.lineTax)));
  const total = roundMoney(subtotal.plus(taxTotal));

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextDocumentNumber(tx, params.companyId, "INV", () =>
      tx.invoice.findFirst({ where: { companyId: params.companyId }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } }).then((r) => (r ? { number: r.invoiceNumber } : null))
    );

    return tx.invoice.create({
      data: {
        companyId: params.companyId,
        customerId: params.customerId,
        invoiceNumber,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: params.currency,
        subtotal,
        taxTotal,
        total,
        status: "DRAFT",
        lines: {
          create: computedLines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    newValue: { invoiceNumber: invoice.invoiceNumber, total: total.toFixed(2) },
  });

  return invoice;
}

/** Draft -> Sent: this is what actually recognizes revenue by posting to
 *  the ledger. Requires invoices:EDIT (transition) *and*, inside
 *  postJournalEntry, journals:APPROVE — so an Accountant can raise an
 *  invoice but typically can't be the one to post it, matching the spec's
 *  approval-workflow intent even though invoices and journals are
 *  separate modules in the permission matrix. */
export async function postInvoiceToLedger(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: params.invoiceId, companyId: params.companyId },
  });

  if (invoice.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft invoice can be posted.");
  }

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: invoice.issueDate,
    sourceType: "INVOICE",
    sourceId: invoice.id,
    memo: `Invoice ${invoice.invoiceNumber}`,
    currency: invoice.currency,
    lines: buildInvoicePosting({ subtotal: invoice.subtotal, taxTotal: invoice.taxTotal, total: invoice.total }),
    post: true,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", journalEntryId: entry.id },
  });

  return updated;
}

/** Customer payment against a sent invoice: DR Bank, CR Accounts
 *  Receivable, and moves the invoice to PARTIALLY_PAID/PAID depending on
 *  cumulative payments recorded via this same JournalSourceType.PAYMENT
 *  trail (summed from posted journal entries, not a separate counter that
 *  could drift). */
export async function recordInvoicePayment(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  invoiceId: string;
  amount: number;
  date: Date;
  /** Stable reference for payments that arrive from a provider (e.g. "stripe:pi_123").
   *  Makes the posting idempotent: the ledger refuses a second entry with the same source. */
  sourceRef?: string;
  memo?: string;
}) {
  await requirePermission(params.membershipId, "invoices", "EDIT");

  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: params.invoiceId, companyId: params.companyId },
  });

  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
    throw new InvalidLineError("Only a sent invoice can receive a payment.");
  }

  // unique per payment so multiple partial payments can each post
  const paymentId = `${invoice.id}:${params.sourceRef ?? Date.now()}`;

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    memo: params.memo ?? `Payment received — Invoice ${invoice.invoiceNumber}`,
    currency: invoice.currency,
    lines: buildInvoicePaymentPosting({ amount: params.amount }),
    post: true,
  });

  const paidSoFar = await sumInvoicePayments(params.companyId, invoice.id);
  const newStatus = paidSoFar.gte(invoice.total) ? "PAID" : "PARTIALLY_PAID";

  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });

  return entry;
}

export async function sumInvoicePayments(companyId: string, invoiceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${invoiceId}:` }, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const bankDebits = entries.flatMap((e) => e.lines.filter((l) => l.account.code === "1000"));
  return roundMoney(sum(bankDebits.map((l) => l.debit)));
}
