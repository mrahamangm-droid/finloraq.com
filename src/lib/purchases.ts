import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { postJournalEntry, buildBillPosting, buildSupplierPaymentPosting, InvalidLineError } from "@/lib/ledger";
import { money, roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

export async function createBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  supplierId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  lines: BillLineInput[];
}) {
  await requirePermission(params.membershipId, "bills", "CREATE");

  if (params.lines.length === 0) {
    throw new InvalidLineError("A bill needs at least one line.");
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

  const bill = await prisma.$transaction(async (tx) => {
    const billNumber = await nextDocumentNumber(tx, params.companyId, "BILL", () =>
      tx.bill.findFirst({ where: { companyId: params.companyId }, orderBy: { billNumber: "desc" }, select: { billNumber: true } }).then((r) => (r ? { number: r.billNumber } : null))
    );

    return tx.bill.create({
      data: {
        companyId: params.companyId,
        supplierId: params.supplierId,
        billNumber,
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
    action: "bill.created",
    entityType: "Bill",
    entityId: bill.id,
    newValue: { billNumber: bill.billNumber, total: total.toFixed(2) },
  });

  return bill;
}

/** Draft -> Approved, and posts to the ledger in the same step. A
 *  Finance Manager/CFO/Company Admin (who hold bills:APPROVE) can do this;
 *  posting itself additionally requires journals:APPROVE inside
 *  postJournalEntry, same layered-permission pattern as invoices. */
export async function approveAndPostBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  expenseAccountCode?: string;
}) {
  await requirePermission(params.membershipId, "bills", "APPROVE");

  const bill = await prisma.bill.findFirstOrThrow({ where: { id: params.billId, companyId: params.companyId } });

  if (bill.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be approved and posted.");
  }

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: bill.issueDate,
    sourceType: "BILL",
    sourceId: bill.id,
    memo: `Bill ${bill.billNumber}`,
    currency: bill.currency,
    lines: buildBillPosting({
      subtotal: bill.subtotal,
      taxTotal: bill.taxTotal,
      total: bill.total,
      expenseAccountCode: params.expenseAccountCode,
    }),
    post: true,
  });

  return prisma.bill.update({
    where: { id: bill.id },
    data: { status: "APPROVED", journalEntryId: entry.id },
  });
}

export async function recordSupplierPayment(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  amount: number;
  date: Date;
}) {
  await requirePermission(params.membershipId, "bills", "EDIT");

  const bill = await prisma.bill.findFirstOrThrow({ where: { id: params.billId, companyId: params.companyId } });

  if (!["APPROVED", "PARTIALLY_PAID", "OVERDUE"].includes(bill.status)) {
    throw new InvalidLineError("Only an approved bill can receive a payment.");
  }

  const paymentId = `${bill.id}:${Date.now()}`;

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    memo: `Payment sent — Bill ${bill.billNumber}`,
    currency: bill.currency,
    lines: buildSupplierPaymentPosting({ amount: params.amount }),
    post: true,
  });

  const paidSoFar = await sumBillPayments(params.companyId, bill.id);
  const newStatus = paidSoFar.gte(bill.total) ? "PAID" : "PARTIALLY_PAID";

  await prisma.bill.update({ where: { id: bill.id }, data: { status: newStatus } });

  return entry;
}

async function sumBillPayments(companyId: string, billId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${billId}:` }, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const bankCredits = entries.flatMap((e) => e.lines.filter((l) => l.account.code === "1000"));
  return roundMoney(sum(bankCredits.map((l) => l.credit)));
}
