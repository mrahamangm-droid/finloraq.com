import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { postJournalEntry, buildBillPosting, buildSupplierPaymentPosting, InvalidLineError } from "@/lib/ledger";
import { roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";

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

  const { lines: computedLines, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

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
            description: l.line.description,
            quantity: l.line.quantity,
            unitPrice: l.line.unitPrice,
            taxCodeId: l.line.taxCodeId,
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

/**
 * Edits a DRAFT bill's own fields and lines, recomputing subtotal/tax/total
 * exactly like createBill() does. Refused once the bill has left DRAFT
 * (approveAndPostBill already posted it to the ledger by then) — mirrors
 * updateInvoice() in src/lib/sales.ts. Correct an approved bill with a
 * debit note / new bill instead.
 */
export async function updateBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
  supplierId?: string;
  issueDate?: Date;
  dueDate?: Date;
  currency?: string;
  lines?: BillLineInput[];
}) {
  await requirePermission(params.membershipId, "bills", "EDIT");

  const before = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId }, include: { lines: true } });
  if (!before) throw new Error("Bill not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be edited. Once approved, correct it with a debit note or a new bill.");
  }

  let subtotal = before.subtotal, taxTotal = before.taxTotal, total = before.total;
  let lineData: { description: string; quantity: number; unitPrice: number; taxCodeId?: string; lineTotal: Decimal }[] | undefined;

  if (params.lines) {
    if (params.lines.length === 0) {
      throw new InvalidLineError("A bill needs at least one line.");
    }
    const computedLines = await computeTaxedLines(prisma, params.companyId, params.lines);
    subtotal = computedLines.subtotal;
    taxTotal = computedLines.taxTotal;
    total = computedLines.total;
    lineData = computedLines.lines.map((l) => ({ description: l.line.description, quantity: l.line.quantity, unitPrice: l.line.unitPrice, taxCodeId: l.line.taxCodeId, lineTotal: l.lineTotal }));
  }

  const bill = await prisma.$transaction(async (tx) => {
    if (lineData) {
      await tx.billLine.deleteMany({ where: { billId: before.id } });
    }
    return tx.bill.update({
      where: { id: before.id },
      data: {
        supplierId: params.supplierId,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: params.currency,
        subtotal,
        taxTotal,
        total,
        lines: lineData ? { create: lineData } : undefined,
      },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bill.updated",
    entityType: "Bill",
    entityId: bill.id,
    previousValue: { total: before.total.toFixed(2), lineCount: before.lines.length },
    newValue: { total: bill.total.toFixed(2), lineCount: bill.lines.length },
  });

  return bill;
}

/** Deletes a DRAFT bill outright — refused once it's been approved/posted,
 *  same boundary as updateBill() above. */
export async function deleteBill(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  billId: string;
}) {
  await requirePermission(params.membershipId, "bills", "DELETE");

  const bill = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId } });
  if (!bill) throw new Error("Bill not found.");
  if (bill.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be deleted. An approved bill can't be removed — reverse it via a debit note instead.");
  }

  await prisma.$transaction([
    prisma.billLine.deleteMany({ where: { billId: bill.id } }),
    prisma.bill.delete({ where: { id: bill.id } }),
  ]);

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "bill.deleted",
    entityType: "Bill",
    entityId: bill.id,
    previousValue: { billNumber: bill.billNumber, total: bill.total.toFixed(2) },
  });
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
