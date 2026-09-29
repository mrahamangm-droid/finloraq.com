import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { receiveStock } from "@/lib/inventory";
import { postJournalEntry, buildBillPosting, buildSupplierPaymentPosting, InvalidLineError, assertBaseCurrency, normalizeCurrencyCode } from "@/lib/ledger";
import { roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { getBankAccountCode, getInputTaxReceivableCode, getAccountsPayableCode } from "@/lib/accounts";
import { foreignReferenceProblem } from "@/lib/tenantRefs";

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
  productId?: string; // optional; if the product trackInventory=true, stock is received on approval
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
  await assertBaseCurrency(prisma, params.companyId, params.currency);

  if (params.lines.length === 0) {
    throw new InvalidLineError("A bill needs at least one line.");
  }
  const supplierProblem = await foreignReferenceProblem(prisma, params.companyId, "supplier", [params.supplierId]);
  if (supplierProblem) throw new InvalidLineError(supplierProblem);

  const { lines: computedLines, subtotal, taxTotal, total } = await computeTaxedLines(prisma, params.companyId, params.lines);

  const bill = await prisma.$transaction(async (tx: any) => {
    const billNumber = await nextDocumentNumber(tx, params.companyId, "BILL", () =>
      tx.bill.findFirst({ where: { companyId: params.companyId }, orderBy: { billNumber: "desc" }, select: { billNumber: true } }).then((r: any) => (r ? { number: r.billNumber } : null))
    );

    return tx.bill.create({
      data: {
        companyId: params.companyId,
        supplierId: params.supplierId,
        billNumber,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: normalizeCurrencyCode(params.currency),
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
            ...(l.line.productId ? { productId: l.line.productId } : {}),
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
  if (!before) throw new NotFoundError("Bill not found.");
  if (before.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be edited. Once approved, correct it with a debit note or a new bill.");
  }
  // Editing may keep the draft's current currency (so an edit never silently
  // re-labels it) or move it to the base currency, but never to another
  // foreign currency. Posting re-checks via postJournalEntry().
  if (params.currency !== undefined && normalizeCurrencyCode(params.currency) !== normalizeCurrencyCode(before.currency)) {
    await assertBaseCurrency(prisma, params.companyId, params.currency);
  }
  const supplierProblem = await foreignReferenceProblem(prisma, params.companyId, "supplier", [params.supplierId]);
  if (supplierProblem) throw new InvalidLineError(supplierProblem);

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
    lineData = computedLines.lines.map((l) => ({ description: l.line.description, quantity: l.line.quantity, unitPrice: l.line.unitPrice, taxCodeId: l.line.taxCodeId, lineTotal: l.lineTotal, ...(l.line.productId ? { productId: l.line.productId } : {}) }));
  }

  const bill = await prisma.$transaction(async (tx: any) => {
    if (lineData) {
      await tx.billLine.deleteMany({ where: { billId: before.id } });
    }
    return tx.bill.update({
      where: { id: before.id },
      data: {
        supplierId: params.supplierId,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        currency: params.currency === undefined ? undefined : normalizeCurrencyCode(params.currency),
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
  if (!bill) throw new NotFoundError("Bill not found.");
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

  const bill = await prisma.bill.findFirst({
    where: { id: params.billId, companyId: params.companyId },
    include: { lines: { include: { product: true } } },
  });
  if (!bill) throw new NotFoundError("Bill not found.");

  if (bill.status !== "DRAFT") {
    throw new InvalidLineError("Only a draft bill can be approved and posted.");
  }

  const [inputTaxCode, accountsPayableCode] = await Promise.all([
    getInputTaxReceivableCode(params.companyId),
    getAccountsPayableCode(params.companyId),
  ]);

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
      inputTaxCode,
      accountsPayableCode,
    }),
    post: true,
  });

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: { status: "APPROVED", journalEntryId: entry.id },
  });

  // Receive inventory for any line that references a tracked product.
  // Failures are logged but never abort the bill approval — the ledger
  // entry is already committed. A manual stock adjustment can correct later.
  for (const line of bill.lines) {
    if (line.product?.trackInventory && line.quantity) {
      try {
        await receiveStock(
          params.companyId,
          params.userId,
          line.product.id,
          Number(line.quantity),
          {
            unitCost: Number(line.unitPrice),
            notes: `Bill ${bill.billNumber}`,
            referenceType: "Bill",
            referenceId: bill.id,
            date: bill.issueDate,
          }
        );
      } catch (err: any) {
        console.error(`[inventory] receiveStock failed for bill ${bill.id} product ${line.product.id}: ${err?.message}`);
      }
    }
  }

  return updated;
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

  const bill = await prisma.bill.findFirst({ where: { id: params.billId, companyId: params.companyId } });
  if (!bill) throw new NotFoundError("Bill not found.");

  if (!["APPROVED", "PARTIALLY_PAID", "OVERDUE"].includes(bill.status)) {
    throw new InvalidLineError("Only an approved bill can receive a payment.");
  }

  const paymentId = `${bill.id}:${Date.now()}`;
  const [bankAccountCode, accountsPayableCode] = await Promise.all([
    getBankAccountCode(params.companyId),
    getAccountsPayableCode(params.companyId),
  ]);

  const entry = await postJournalEntry({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    date: params.date,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    memo: `Payment sent — Bill ${bill.billNumber}`,
    currency: bill.currency,
    inheritsPostedCurrency: true, // settles a bill that is already posted
    lines: buildSupplierPaymentPosting({ amount: params.amount, bankAccountCode, accountsPayableCode }),
    post: true,
  });

  const paidSoFar = await sumBillPayments(params.companyId, bill.id);
  const newStatus = paidSoFar.gte(bill.total) ? "PAID" : "PARTIALLY_PAID";

  await prisma.bill.update({ where: { id: bill.id }, data: { status: newStatus } });

  return entry;
}

async function sumBillPayments(companyId: string, billId: string) {
  const [entries, bankAccountCode] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${billId}:` }, status: "POSTED" },
      include: { lines: { include: { account: true } } },
    }),
    getBankAccountCode(companyId),
  ]);
  const bankCredits = entries.flatMap((e: any) => e.lines.filter((l: any) => l.account.code === bankAccountCode));
  return roundMoney(sum(bankCredits.map((l: any) => l.credit)));
}
