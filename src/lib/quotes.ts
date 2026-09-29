import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { roundMoney, sum } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import { createInvoice } from "@/lib/sales";
import type Decimal from "decimal.js";

export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listQuotes(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "quotes", "VIEW");
  return prisma.quote.findMany({
    where: { companyId },
    orderBy: { issueDate: "desc" },
    include: { customer: true },
    take: 200,
  });
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getQuote(companyId: string, membershipId: string, id: string) {
  await requirePermission(membershipId, "quotes", "VIEW");
  const quote = await prisma.quote.findFirst({
    where: { id, companyId },
    include: {
      customer: true,
      deal: true,
      project: true,
      invoice: true,
      lines: { include: { taxCode: true } },
    },
  });
  if (!quote) throw new Error("Quote not found");
  return quote;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createQuote(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  dealId?: string;
  projectId?: string;
  issueDate: Date;
  expiryDate?: Date;
  currency: string;
  notes?: string;
  lines: QuoteLineInput[];
}) {
  await requirePermission(params.membershipId, "quotes", "CREATE");

  if (params.lines.length === 0) throw new Error("A quote needs at least one line.");

  const { lines: computed, subtotal, taxTotal, total } = await computeTaxedLines(
    prisma, params.companyId, params.lines
  );

  const quote = await prisma.$transaction(async (tx: any) => {
    const quoteNumber = await nextDocumentNumber(
      tx, params.companyId, "QUO",
      () => tx.quote.findFirst({
        where: { companyId: params.companyId },
        orderBy: { quoteNumber: "desc" },
        select: { quoteNumber: true },
      }).then((r: any) => (r ? { number: r.quoteNumber } : null))
    );

    return tx.quote.create({
      data: {
        companyId: params.companyId,
        customerId: params.customerId,
        dealId: params.dealId,
        projectId: params.projectId,
        quoteNumber,
        issueDate: params.issueDate,
        expiryDate: params.expiryDate,
        currency: params.currency,
        subtotal,
        taxTotal,
        total,
        notes: params.notes,
        status: "DRAFT",
        lines: {
          create: computed.map((l) => ({
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
    action: "quote.created",
    entityType: "Quote",
    entityId: quote.id,
    newValue: { quoteNumber: quote.quoteNumber, total: quote.total.toString() },
  });

  return quote;
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateQuoteStatus(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string,
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "INVOICED"
) {
  await requirePermission(membershipId, "quotes", "EDIT");

  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) throw new Error("Quote not found");
  if (quote.status === "INVOICED") throw new Error("Cannot change status of an invoiced quote.");

  const updated = await prisma.quote.update({
    where: { id },
    data: { status },
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "quote.status_changed",
    entityType: "Quote",
    entityId: id,
    previousValue: { status: quote.status },
    newValue: { status },
  });

  return updated;
}

// ─── Convert accepted quote to invoice ────────────────────────────────────────

export async function convertQuoteToInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  quoteId: string;
  dueDate: Date;
}) {
  await requirePermission(params.membershipId, "quotes", "EDIT");
  await requirePermission(params.membershipId, "invoices", "CREATE");

  const quote = await prisma.quote.findFirst({
    where: { id: params.quoteId, companyId: params.companyId },
    include: { lines: true },
  });
  if (!quote) throw new Error("Quote not found");
  if (quote.status !== "ACCEPTED") throw new Error("Only an accepted quote can be converted to an invoice.");
  if (quote.invoiceId) throw new Error("This quote has already been converted to an invoice.");

  // Create the invoice with the same lines
  const invoice = await createInvoice({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    customerId: quote.customerId,
    issueDate: new Date(),
    dueDate: params.dueDate,
    currency: quote.currency,
    lines: quote.lines.map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxCodeId: l.taxCodeId ?? undefined,
    })),
  });

  // Link quote → invoice and mark as INVOICED
  await prisma.quote.update({
    where: { id: params.quoteId },
    data: { status: "INVOICED", invoiceId: invoice.id },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "quote.converted_to_invoice",
    entityType: "Quote",
    entityId: params.quoteId,
    newValue: { invoiceId: invoice.id },
  });

  return invoice;
}

// ─── Delete (draft only) ──────────────────────────────────────────────────────

export async function deleteQuote(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string
) {
  await requirePermission(membershipId, "quotes", "DELETE");

  const quote = await prisma.quote.findFirst({ where: { id, companyId } });
  if (!quote) throw new Error("Quote not found");
  if (quote.status !== "DRAFT") throw new Error("Only draft quotes can be deleted.");

  await prisma.quote.delete({ where: { id } });

  await recordAuditEvent({
    companyId,
    userId,
    action: "quote.deleted",
    entityType: "Quote",
    entityId: id,
    previousValue: { quoteNumber: quote.quoteNumber },
  });
}
