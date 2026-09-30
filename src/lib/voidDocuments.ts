import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { reverseJournalEntry, InvalidLineError } from "@/lib/ledger";
import { releasePOBilledQuantities } from "@/lib/po-billing";

/**
 * Voiding a posted invoice or bill.
 *
 * A posted document's journal entry is never edited or deleted. Voiding
 * reverses it through reverseJournalEntry() (a new, offsetting entry dated
 * today, so it also works when the original month is locked) and then marks
 * the document VOID, which takes it out of AR/AP aging, project figures and
 * payment links.
 *
 * Only unpaid documents can be voided: once money has moved, the payment
 * entries would also need unwinding, which is a refund/credit-note flow, not
 * a void. Retrying after a failure is safe: if the reversal already exists
 * (one per entry, enforced by the ledger), it's reused and only the status is
 * finished off.
 */

const MIN_REASON = 5;

async function findOrCreateReversal(ctx: Ctx, entryId: string, memo: string) {
  const existing = await prisma.journalEntry.findFirst({
    where: { companyId: ctx.companyId, sourceType: "REVERSAL", sourceId: entryId, status: "POSTED" },
  });
  if (existing) return existing;
  return reverseJournalEntry({ ...ctx, journalEntryId: entryId, memo });
}

async function postedPaymentCount(companyId: string, documentId: string) {
  return prisma.journalEntry.count({
    where: { companyId, sourceType: "PAYMENT", sourceId: { startsWith: `${documentId}:` }, status: "POSTED" },
  });
}

type Ctx = { companyId: string; membershipId: string; userId: string };

function checkReason(reason: string) {
  const r = reason.trim();
  if (r.length < MIN_REASON) throw new InvalidLineError("Give a short reason for voiding. It's kept in the audit log.");
  return r;
}

export async function voidInvoice(ctx: Ctx & { invoiceId: string; reason: string }) {
  await requirePermission(ctx.membershipId, "invoices", "EDIT");
  const reason = checkReason(ctx.reason);
  const invoice = await prisma.invoice.findFirst({ where: { id: ctx.invoiceId, companyId: ctx.companyId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.status === "DRAFT") throw new InvalidLineError("A draft invoice isn't posted yet. Delete it instead of voiding it.");
  if (invoice.status === "VOID") throw new InvalidLineError("This invoice is already void.");
  if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID" || (await postedPaymentCount(ctx.companyId, invoice.id)) > 0) {
    throw new InvalidLineError("This invoice has payments recorded against it, so it can't be voided. Refund or reverse the payments first.");
  }
  const entry = invoice.journalEntryId
    ? await prisma.journalEntry.findFirst({ where: { id: invoice.journalEntryId, companyId: ctx.companyId } })
    : await prisma.journalEntry.findFirst({ where: { companyId: ctx.companyId, sourceType: "INVOICE", sourceId: invoice.id, status: "POSTED" } });
  if (!entry) throw new InvalidLineError("This invoice has no posted journal entry to reverse.");

  const reversal = await findOrCreateReversal(ctx, entry.id, `Void of invoice ${invoice.invoiceNumber}: ${reason}`);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID", payToken: null } });
  await recordAuditEvent({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "invoice.voided",
    entityType: "Invoice",
    entityId: invoice.id,
    previousValue: { status: invoice.status, journalEntryId: entry.id },
    newValue: { status: "VOID", reason, reversalEntryId: reversal.id },
  });
  return { invoiceId: invoice.id, reversalEntryId: reversal.id };
}

export async function voidBill(ctx: Ctx & { billId: string; reason: string }) {
  await requirePermission(ctx.membershipId, "bills", "APPROVE");
  const reason = checkReason(ctx.reason);
  const bill = await prisma.bill.findFirst({ where: { id: ctx.billId, companyId: ctx.companyId } });
  if (!bill) throw new NotFoundError("Bill not found.");
  if (bill.status === "DRAFT") throw new InvalidLineError("A draft bill isn't posted yet. Delete it instead of voiding it.");
  if (bill.status === "VOID") throw new InvalidLineError("This bill is already void.");
  if (bill.status === "PAID" || bill.status === "PARTIALLY_PAID" || (await postedPaymentCount(ctx.companyId, bill.id)) > 0) {
    throw new InvalidLineError("This bill has payments recorded against it, so it can't be voided. Reverse the payments first.");
  }
  const entry = bill.journalEntryId
    ? await prisma.journalEntry.findFirst({ where: { id: bill.journalEntryId, companyId: ctx.companyId } })
    : await prisma.journalEntry.findFirst({ where: { companyId: ctx.companyId, sourceType: "BILL", sourceId: bill.id, status: "POSTED" } });
  if (!entry) throw new InvalidLineError("This bill has no posted journal entry to reverse.");

  const reversal = await findOrCreateReversal(ctx, entry.id, `Void of bill ${bill.billNumber}: ${reason}`);
  await prisma.bill.update({ where: { id: bill.id }, data: { status: "VOID" } });
  // A voided PO bill no longer counts as billed: its quantities go back to
  // the purchase order (and the reversal above re-opens GRNI for any stock
  // that was received), so the goods can be billed again correctly.
  await releasePOBilledQuantities(ctx.companyId, bill.id);
  await recordAuditEvent({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action: "bill.voided",
    entityType: "Bill",
    entityId: bill.id,
    previousValue: { status: bill.status, journalEntryId: entry.id },
    newValue: { status: "VOID", reason, reversalEntryId: reversal.id },
  });
  return { billId: bill.id, reversalEntryId: reversal.id };
}
