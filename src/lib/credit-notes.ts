/**
 * Credit Notes — reduces what a customer owes.
 *
 * Accounting treatment (reversal of invoice posting):
 *   DR  Sales Revenue (4000)         amount = subtotal
 *   DR  Output Tax Payable (2100)    amount = taxTotal
 *   CR  Accounts Receivable (1100)   amount = total
 *
 * This is the mirror image of buildInvoicePosting() which:
 *   DR  AR, CR Revenue, CR Tax
 *
 * We do NOT call reverseJournalEntry() here because the credit note
 * may not correspond 1:1 with the original invoice amount (partial
 * credits). Instead we post a fresh JournalEntry tagged to the
 * CreditNote sourceId.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import {
  postJournalEntry,
  validateBalanced,
  type LineInput,
} from "@/lib/ledger";
import { getAccountsReceivableCode, getOutputTaxPayableCode } from "@/lib/accounts";
import { sumInvoicePayments } from "@/lib/sales";

export interface CreditNoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

function buildCreditNotePosting(input: {
  subtotal: number | string;
  taxTotal: number | string;
  total: number | string;
  outputTaxCode: string;
  accountsReceivableCode: string;
}): LineInput[] {
  const sub = Number(input.subtotal);
  const tax = Number(input.taxTotal);
  const tot = Number(input.total);

  const lines: LineInput[] = [
    { accountCode: "4000", debit: sub, description: "Sales Revenue (Credit Note)" },
  ];
  if (tax !== 0) {
    lines.push({ accountCode: input.outputTaxCode, debit: tax, description: "Output Tax Payable (Credit Note)" });
  }
  lines.push({ accountCode: input.accountsReceivableCode, credit: tot, description: "Accounts Receivable (Credit Note)" });

  return lines;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listCreditNotes(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "credit_notes", "VIEW");
  return prisma.creditNote.findMany({
    where: { companyId },
    orderBy: { issueDate: "desc" },
    include: { customer: true, invoice: true },
    take: 200,
  });
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getCreditNote(
  companyId: string,
  membershipId: string,
  id: string
) {
  await requirePermission(membershipId, "credit_notes", "VIEW");
  const cn = await prisma.creditNote.findFirst({
    where: { id, companyId },
    include: {
      customer: true,
      invoice: true,
      journalEntry: true,
      lines: { include: { taxCode: true } },
    },
  });
  if (!cn) throw new Error("Credit note not found");
  return cn;
}

// ─── Create (draft) ───────────────────────────────────────────────────────────

export async function createCreditNote(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  invoiceId?: string;
  issueDate: Date;
  currency: string;
  reason?: string;
  lines: CreditNoteLineInput[];
}) {
  await requirePermission(params.membershipId, "credit_notes", "CREATE");

  if (params.lines.length === 0) throw new Error("A credit note needs at least one line.");

  const { lines: computed, subtotal, taxTotal, total } = await computeTaxedLines(
    prisma, params.companyId, params.lines
  );

  const cn = await prisma.$transaction(async (tx: any) => {
    const creditNumber = await nextDocumentNumber(
      tx, params.companyId, "CN",
      () => tx.creditNote.findFirst({
        where: { companyId: params.companyId },
        orderBy: { creditNumber: "desc" },
        select: { creditNumber: true },
      }).then((r: any) => (r ? { number: r.creditNumber } : null))
    );

    return tx.creditNote.create({
      data: {
        companyId: params.companyId,
        customerId: params.customerId,
        invoiceId: params.invoiceId,
        creditNumber,
        issueDate: params.issueDate,
        currency: params.currency,
        subtotal,
        taxTotal,
        total,
        reason: params.reason,
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
    action: "credit_note.created",
    entityType: "CreditNote",
    entityId: cn.id,
    newValue: { creditNumber: cn.creditNumber, total: cn.total.toString() },
  });

  return cn;
}

// ─── Post to ledger ───────────────────────────────────────────────────────────

export async function postCreditNote(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string
) {
  await requirePermission(membershipId, "credit_notes", "EDIT");

  const cn = await prisma.creditNote.findFirst({
    where: { id, companyId },
    include: { lines: true },
  });
  if (!cn) throw new Error("Credit note not found");
  if (cn.status !== "DRAFT") throw new Error("Only draft credit notes can be posted.");
  if (cn.journalEntryId) throw new Error("Credit note is already posted.");

  const [outputTaxCode, accountsReceivableCode] = await Promise.all([
    getOutputTaxPayableCode(companyId),
    getAccountsReceivableCode(companyId),
  ]);

  const postingLines = buildCreditNotePosting({
    subtotal: cn.subtotal.toNumber(),
    taxTotal: cn.taxTotal.toNumber(),
    total: cn.total.toNumber(),
    outputTaxCode,
    accountsReceivableCode,
  });

  // Validate double-entry balance before posting
  validateBalanced(postingLines);

  const entry = await postJournalEntry({
    companyId,
    membershipId,
    userId,
    date: cn.issueDate,
    memo: `Credit Note ${cn.creditNumber}`,
    sourceType: "ADJUSTMENT", // credit notes adjust AR without a dedicated source type
    sourceId: cn.id,
    currency: cn.currency,
    lines: postingLines,
    post: true,
  });

  await prisma.creditNote.update({
    where: { id },
    data: { status: "POSTED", journalEntryId: entry.id },
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "credit_note.posted",
    entityType: "CreditNote",
    entityId: id,
    newValue: { journalEntryId: entry.id },
  });

  return entry;
}

// ─── Apply to Invoice ────────────────────────────────────────────────────────

/**
 * Apply a POSTED credit note against a specific open invoice.
 *
 * Accounting note: the double-entry (DR Revenue/Tax, CR AR) was already created
 * when the credit note was posted. This step simply *allocates* that AR reduction
 * to a specific invoice so the invoice's balance-due display can reflect it.
 * No new journal entry is created here — the ledger is already balanced.
 *
 * The invoice's status is recalculated after the allocation:
 *   total payments (cash) + applied credit note total ≥ invoice total → PAID
 *   otherwise → PARTIALLY_PAID
 */
export async function applyCreditNoteToInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  creditNoteId: string;
  invoiceId: string;
}) {
  await requirePermission(params.membershipId, "credit_notes", "EDIT");

  // Load the credit note
  const cn = await prisma.creditNote.findFirst({
    where: { id: params.creditNoteId, companyId: params.companyId },
  });
  if (!cn) throw new Error("Credit note not found.");
  if (cn.status !== "POSTED")
    throw new Error("Only POSTED credit notes can be applied. Post it first.");

  // Load the invoice
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status))
    throw new Error(
      `Invoice ${invoice.invoiceNumber} must be SENT, PARTIALLY_PAID, or OVERDUE to apply a credit note (current status: ${invoice.status}).`
    );
  if (invoice.customerId !== cn.customerId)
    throw new Error("Credit note and invoice must belong to the same customer.");

  // Update credit note: link to invoice + mark applied
  await prisma.creditNote.update({
    where: { id: params.creditNoteId },
    data: { invoiceId: params.invoiceId, status: "APPLIED" },
  });

  // Recompute invoice status — cash payments already recorded plus this
  // credit note (already APPLIED as of the update above, so
  // sumInvoicePayments' own credit-note query already includes it).
  // sumInvoicePayments is the single correct implementation of "how much
  // of this invoice has been cleared" — it works in the invoice's own
  // currency (dividing the base-currency AR-credit lines by the invoice's
  // exchangeRate), unlike a raw bank-debit sum, which is in base currency
  // and would silently misstate this comparison for a foreign-currency
  // invoice. See src/lib/sales.ts.
  const totalCleared = (await sumInvoicePayments(params.companyId, params.invoiceId)).toNumber();
  const newStatus = totalCleared >= Number(invoice.total) ? "PAID" : "PARTIALLY_PAID";

  await prisma.invoice.update({
    where: { id: params.invoiceId },
    data: { status: newStatus },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "credit_note.applied",
    entityType: "CreditNote",
    entityId: params.creditNoteId,
    newValue: {
      invoiceId: params.invoiceId,
      creditTotal: cn.total.toString(),
      invoiceNewStatus: newStatus,
    },
    source: "web",
  });

  return { invoiceId: params.invoiceId, invoiceStatus: newStatus };
}

// ─── Void ─────────────────────────────────────────────────────────────────────

export async function voidCreditNote(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string
) {
  await requirePermission(membershipId, "credit_notes", "EDIT");

  const cn = await prisma.creditNote.findFirst({ where: { id, companyId } });
  if (!cn) throw new Error("Credit note not found");
  if (cn.status === "VOID") throw new Error("Credit note is already voided.");
  if (cn.status === "APPLIED") throw new Error("Applied credit notes cannot be voided.");

  // If posted, post a reversing journal entry
  if (cn.journalEntryId) {
    const { reverseJournalEntry } = await import("@/lib/ledger");
    await reverseJournalEntry({
      companyId,
      membershipId,
      userId,
      journalEntryId: cn.journalEntryId,
      memo: `Void: Credit Note ${cn.creditNumber}`,
    });
  }

  await prisma.creditNote.update({
    where: { id },
    data: { status: "VOID" },
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "credit_note.voided",
    entityType: "CreditNote",
    entityId: id,
    previousValue: { status: cn.status },
    newValue: { status: "VOID" },
  });
}
