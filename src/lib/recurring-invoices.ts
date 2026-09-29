/**
 * Recurring Invoices
 *
 * A RecurringInvoice template stores the schedule and line items for an invoice
 * that should be generated automatically on a fixed cadence (weekly / monthly /
 * quarterly / annually). The scheduler (processRecurringInvoices) is called by
 * the /api/cron/recurring-invoices route, which should be invoked by an external
 * cron job or a Vercel Cron function on a daily schedule.
 *
 * The template never touches the ledger itself — it simply calls createInvoice()
 * and marks the generated invoice SENT. Posting to the ledger (recognizing
 * revenue) is still the user's explicit action, preserving the same immutability
 * guarantee as manual invoices.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { computeTaxedLines } from "@/lib/taxCalc";
import { nextDocumentNumber } from "@/lib/numbering";

export type RecurringFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
export type RecurringStatus = "ACTIVE" | "PAUSED" | "ENDED";

export interface RecurringLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string;
}

/** Compute the next fire date given a frequency and the previous run date. */
export function nextRunDate(from: Date, frequency: RecurringFrequency): Date {
  const d = new Date(from);
  switch (frequency) {
    case "WEEKLY":     d.setDate(d.getDate() + 7); break;
    case "BIWEEKLY":   d.setDate(d.getDate() + 14); break;
    case "MONTHLY":    d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY":  d.setMonth(d.getMonth() + 3); break;
    case "ANNUALLY":   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// ─── Create template ──────────────────────────────────────────────────────────

export async function createRecurringInvoice(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  customerId: string;
  currency: string;
  frequency: RecurringFrequency;
  startDate: Date;
  endDate?: Date;
  notes?: string;
  lines: RecurringLineInput[];
}) {
  await requirePermission(params.membershipId, "invoices", "CREATE");

  if (params.lines.length === 0) throw new Error("A recurring invoice needs at least one line.");

  const ri = await prisma.recurringInvoice.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      currency: params.currency,
      frequency: params.frequency,
      startDate: params.startDate,
      endDate: params.endDate,
      nextRunAt: params.startDate,
      status: "ACTIVE",
      notes: params.notes,
      lines: {
        create: params.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxCodeId: l.taxCodeId,
        })),
      },
    },
    include: { lines: true, customer: true },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "recurring_invoice.created",
    entityType: "RecurringInvoice",
    entityId: ri.id,
    newValue: { frequency: ri.frequency, customerId: ri.customerId },
  });

  return ri;
}

// ─── List / Get ───────────────────────────────────────────────────────────────

export async function listRecurringInvoices(companyId: string, membershipId: string) {
  await requirePermission(membershipId, "invoices", "VIEW");
  return prisma.recurringInvoice.findMany({
    where: { companyId },
    orderBy: { nextRunAt: "asc" },
    include: { customer: true, _count: { select: { invoices: true } } },
  });
}

export async function getRecurringInvoice(
  companyId: string,
  membershipId: string,
  id: string
) {
  await requirePermission(membershipId, "invoices", "VIEW");
  const ri = await prisma.recurringInvoice.findFirst({
    where: { id, companyId },
    include: {
      customer: true,
      lines: { include: { taxCode: true } },
      invoices: { orderBy: { issueDate: "desc" }, take: 10 },
    },
  });
  if (!ri) throw new Error("Recurring invoice not found");
  return ri;
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateRecurringInvoiceStatus(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string,
  status: RecurringStatus
) {
  await requirePermission(membershipId, "invoices", "EDIT");
  const ri = await prisma.recurringInvoice.findFirst({ where: { id, companyId } });
  if (!ri) throw new Error("Recurring invoice not found");

  const updated = await prisma.recurringInvoice.update({
    where: { id },
    data: { status },
  });

  await recordAuditEvent({
    companyId,
    userId,
    action: "recurring_invoice.status_changed",
    entityType: "RecurringInvoice",
    entityId: id,
    previousValue: { status: ri.status },
    newValue: { status },
  });

  return updated;
}

// ─── Delete (only if no invoices generated) ───────────────────────────────────

export async function deleteRecurringInvoice(
  companyId: string,
  membershipId: string,
  userId: string,
  id: string
) {
  await requirePermission(membershipId, "invoices", "DELETE");
  const ri = await prisma.recurringInvoice.findFirst({
    where: { id, companyId },
    include: { _count: { select: { invoices: true } } },
  });
  if (!ri) throw new Error("Recurring invoice not found");
  if (ri._count.invoices > 0) throw new Error("Cannot delete a recurring invoice that has already generated invoices. Pause it instead.");

  await prisma.recurringInvoice.delete({ where: { id } });

  await recordAuditEvent({
    companyId,
    userId,
    action: "recurring_invoice.deleted",
    entityType: "RecurringInvoice",
    entityId: id,
    previousValue: { frequency: ri.frequency, customerId: ri.customerId },
  });
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Process all active recurring invoices whose nextRunAt is in the past.
 * Called by /api/cron/recurring-invoices (daily, secured by CRON_SECRET).
 *
 * For each due template:
 *   1. Generate a draft Invoice using the template's lines.
 *   2. Set nextRunAt to the next occurrence.
 *   3. If nextRunAt > endDate, mark the template ENDED.
 *
 * Returns a summary of what was processed.
 */
export async function processRecurringInvoices(asOf: Date = new Date()) {
  const due = await prisma.recurringInvoice.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: asOf } },
    include: { lines: true },
  });

  const results: Array<{ id: string; invoiceId?: string; error?: string }> = [];

  for (const ri of due) {
    try {
      const riLines: Array<{ description: string; quantity: number; unitPrice: number; taxCodeId?: string }> =
        ri.lines.map((l: { description: string; quantity: { toNumber?: () => number } | number; unitPrice: { toNumber?: () => number } | number; taxCodeId?: string | null }) => ({
          description: l.description,
          quantity: typeof l.quantity === "number" ? l.quantity : Number(l.quantity),
          unitPrice: typeof l.unitPrice === "number" ? l.unitPrice : Number(l.unitPrice),
          taxCodeId: l.taxCodeId ?? undefined,
        }));
      const { lines: computed, subtotal, taxTotal, total } = await computeTaxedLines(
        prisma,
        ri.companyId,
        riLines
      );

      // Use a system membershipId (COMPANY_ADMIN) for the scheduler
      // In production, look up the company's owner membership; here we skip RBAC
      // for the scheduler since it runs server-side under CRON_SECRET auth.
      const invoice = await prisma.$transaction(async (tx: any) => {
        const invoiceNumber = await nextDocumentNumber(
          tx,
          ri.companyId,
          "INV",
          () => tx.invoice.findFirst({
            where: { companyId: ri.companyId },
            orderBy: { invoiceNumber: "desc" },
            select: { invoiceNumber: true },
          }).then((r: any) => (r ? { number: r.invoiceNumber } : null))
        );

        const dueDate = new Date(ri.nextRunAt);
        dueDate.setDate(dueDate.getDate() + 30); // default net-30; use customer.paymentTermsDays in production

        return tx.invoice.create({
          data: {
            companyId: ri.companyId,
            customerId: ri.customerId,
            recurringInvoiceId: ri.id,
            invoiceNumber,
            issueDate: ri.nextRunAt,
            dueDate,
            currency: ri.currency,
            subtotal,
            taxTotal,
            total,
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
        });
      });

      // Advance the schedule
      const newNextRunAt = nextRunDate(ri.nextRunAt, ri.frequency as RecurringFrequency);
      const ended = ri.endDate && newNextRunAt > ri.endDate;

      await prisma.recurringInvoice.update({
        where: { id: ri.id },
        data: {
          lastRunAt: ri.nextRunAt,
          nextRunAt: newNextRunAt,
          status: ended ? "ENDED" : "ACTIVE",
        },
      });

      results.push({ id: ri.id, invoiceId: invoice.id });
    } catch (err) {
      results.push({ id: ri.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: due.length, results };
}
