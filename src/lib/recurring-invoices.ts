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

/**
 * Compute the next fire date given a frequency and the previous run date.
 *
 * anchorDay (1-31), when given, is the day-of-month the schedule should
 * always target — taken from the template's original startDate. Without
 * it, repeated MONTHLY/QUARTERLY/ANNUALLY advancement compounds drift:
 * JS Date auto-overflows a short month (Jan 31 + 1 month lands on Mar 3,
 * not Feb 28/29), and computing the next occurrence from that already-
 * wrong date permanently walks the schedule earlier every cycle (Jan 31 ->
 * Feb 28 -> Mar 28 instead of the correct Mar 31). Anchoring to the
 * original day every time and clamping only to the target month's actual
 * length keeps the schedule stable.
 */
export function nextRunDate(from: Date, frequency: RecurringFrequency, anchorDay?: number): Date {
  switch (frequency) {
    case "WEEKLY": {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    }
    case "BIWEEKLY": {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + 14);
      return d;
    }
    case "MONTHLY":
      return addMonthsAnchored(from, 1, anchorDay);
    case "QUARTERLY":
      return addMonthsAnchored(from, 3, anchorDay);
    case "ANNUALLY":
      return addMonthsAnchored(from, 12, anchorDay);
  }
}

function addMonthsAnchored(from: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? from.getUTCDate();
  const totalMonths = from.getUTCFullYear() * 12 + from.getUTCMonth() + months;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const daysInTargetMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m, Math.min(day, daysInTargetMonth),
    from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()
  ));
}

/**
 * Fast-forwards from a schedule's original startDate to the first
 * occurrence on or after `onOrAfter`, preserving the anchor day-of-month
 * throughout (never compounding drift). Used both when a schedule resumes
 * after being paused (so it doesn't burst-generate every missed period —
 * see updateRecurringInvoiceStatus) and could be reused wherever a
 * schedule's cadence needs recomputing from scratch.
 */
export function firstOccurrenceOnOrAfter(startDate: Date, frequency: RecurringFrequency, onOrAfter: Date): Date {
  const anchorDay = startDate.getUTCDate();
  let occurrence = new Date(startDate);
  let iterations = 0;
  while (occurrence < onOrAfter) {
    occurrence = nextRunDate(occurrence, frequency, anchorDay);
    if (++iterations > 1000) {
      throw new Error("Could not compute the next occurrence — check the schedule's startDate and frequency.");
    }
  }
  return occurrence;
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
      createdByMembershipId: params.membershipId,
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

  // Resuming a schedule that's been paused/ended while overdue must not
  // burst-generate one invoice per missed period the next time the cron
  // runs — fast-forward nextRunAt to the first real occurrence from here,
  // same as leaving it running would have naturally landed on eventually.
  const now = new Date();
  const resuming = status === "ACTIVE" && ri.status !== "ACTIVE";
  const nextRunAt = resuming && ri.nextRunAt <= now
    ? firstOccurrenceOnOrAfter(ri.startDate, ri.frequency as RecurringFrequency, now)
    : ri.nextRunAt;

  const updated = await prisma.recurringInvoice.update({
    where: { id },
    data: { status, nextRunAt },
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
      // Run generation through the membership that created the schedule,
      // same system-actor pattern as other cron-driven writes in this
      // codebase — a lost/deactivated membership fails this one row (caught
      // below, recorded, batch continues) rather than the scheduler
      // silently having no access control at all. Rows created before this
      // field existed have no creator to check against; skip the check for
      // those rather than failing every legacy schedule outright.
      if (ri.createdByMembershipId) {
        await requirePermission(ri.createdByMembershipId, "invoices", "CREATE");
      }

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

      // Idempotency: reuse Invoice.importRef (unique per companyId) so a
      // retried/overlapping cron invocation for the same period can't
      // create a second invoice — if this exact period was already
      // generated, the create below throws P2002 and the catch just looks
      // up the existing invoice instead of treating it as a failure.
      const period = ri.nextRunAt.toISOString().slice(0, 10);
      const importRef = `recurring:${ri.id}:${period}`;

      let invoice;
      try {
        invoice = await prisma.$transaction(async (tx: any) => {
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
          dueDate.setUTCDate(dueDate.getUTCDate() + 30); // default net-30; use customer.paymentTermsDays in production

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
              importRef,
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
      } catch (err: any) {
        if (err?.code === "P2002") {
          invoice = await prisma.invoice.findFirstOrThrow({ where: { companyId: ri.companyId, importRef } });
        } else {
          throw err;
        }
      }

      // Advance the schedule, anchored to the template's original
      // startDate day-of-month so repeated advancement never drifts.
      const anchorDay = ri.startDate.getUTCDate();
      const newNextRunAt = nextRunDate(ri.nextRunAt, ri.frequency as RecurringFrequency, anchorDay);
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
