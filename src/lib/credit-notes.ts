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

import type Decimal from "decimal.js";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { computeTaxedLines } from "@/lib/taxCalc";
import {
  postJournalEntry,
  validateBalanced,
  resolveDocumentCurrency,
  type LineInput,
} from "@/lib/ledger";
import { roundMoney, money } from "@/lib/currency";
import { getAccountsReceivableCode, getOutputTaxPayableCode } from "@/lib/accounts";
import { sumInvoiceClearedBase } from "@/lib/sales";

export interface CreditNoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

function buildCreditNotePosting(input: {
  subtotal: Decimal.Value;
  taxTotal: Decimal.Value;
  total: Decimal.Value;
  outputTaxCode: string;
  accountsReceivableCode: string;
}): LineInput[] {
  const lines: LineInput[] = [
    { accountCode: "4000", debit: input.subtotal, description: "Sales Revenue (Credit Note)" },
  ];
  if (Number(input.taxTotal) !== 0) {
    lines.push({ accountCode: input.outputTaxCode, debit: input.taxTotal, description: "Output Tax Payable (Credit Note)" });
  }
  lines.push({ accountCode: input.accountsReceivableCode, credit: input.total, description: "Accounts Receivable (Credit Note)" });

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
  /** Rate to convert 1 unit of `currency` into the company's base
   *  currency. Required (and must be a positive number) when `currency`
   *  isn't the company's base currency; must be 1 or omitted otherwise.
   *  There is no live FX rate lookup — the caller supplies the rate. */
  exchangeRate?: number;
  reason?: string;
  lines: CreditNoteLineInput[];
}) {
  await requirePermission(params.membershipId, "credit_notes", "CREATE");
  const { currency, exchangeRate } = await resolveDocumentCurrency(prisma, params.companyId, params.currency, params.exchangeRate);

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
        currency,
        exchangeRate,
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

  // The ledger always posts in base currency. For a foreign-currency
  // credit note, convert using the rate captured at issue time
  // (cn.exchangeRate) — mirrors postInvoiceToLedger in src/lib/sales.ts.
  // baseTotal and baseTaxTotal are each rounded independently, then
  // baseSubtotal is derived as the difference (not rounded independently)
  // so the three always sum exactly.
  const baseTotal = roundMoney(money(cn.total).times(cn.exchangeRate));
  const baseTaxTotal = roundMoney(money(cn.taxTotal).times(cn.exchangeRate));
  const baseSubtotal = baseTotal.minus(baseTaxTotal);

  const postingLines = buildCreditNotePosting({
    subtotal: baseSubtotal,
    taxTotal: baseTaxTotal,
    total: baseTotal,
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
    exchangeRate: cn.exchangeRate,
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
  // sumInvoiceClearedBase (src/lib/sales.ts) adds an applied credit note's
  // total directly to the invoice's own AR-cleared figure and converts the
  // combined amount to base currency using the INVOICE's exchange rate —
  // it has no way to correct for a credit note booked in a different
  // currency, so a mismatch here would silently misstate the invoice's
  // balance due and PAID/PARTIALLY_PAID status.
  if (cn.currency !== invoice.currency)
    throw new Error(
      `Credit note is in ${cn.currency} but invoice ${invoice.invoiceNumber} is in ${invoice.currency} — they must match to apply.`
    );

  // Update credit note: link to invoice + mark applied
  await prisma.creditNote.update({
    where: { id: params.creditNoteId },
    data: { invoiceId: params.invoiceId, status: "APPLIED" },
  });

  // Recompute invoice status in base currency — cash payments already
  // recorded plus this credit note (already APPLIED as of the update
  // above, so sumInvoiceClearedBase's own credit-note query already
  // includes it). Deciding in base currency, not the invoice's own
  // currency, matters here for the same reason it does in
  // recordInvoicePayment (src/lib/sales.ts): dividing a base-currency
  // total back to the invoice's own currency and rounding can leave a
  // fully-cleared invoice a fraction short of invoice.total.
  const baseClearedSoFar = await sumInvoiceClearedBase(params.companyId, params.invoiceId);
  const baseInvoiceTotal = roundMoney(money(invoice.total).times(invoice.exchangeRate));
  const newStatus = baseClearedSoFar.gte(baseInvoiceTotal) ? "PAID" : "PARTIALLY_PAID";

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
