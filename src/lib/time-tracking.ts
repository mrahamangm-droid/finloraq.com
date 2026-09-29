/**
 * Project Time Tracking
 *
 * Records hours worked against a project by a company membership.
 * Billable entries can later be converted to Invoice lines via the
 * "Invoice time" workflow (invoiceLineId is set at that point and
 * the entry is considered locked against further billing).
 *
 * Double-entry safety: this module does NOT write JournalEntry rows.
 * Revenue recognition from billable time flows through the normal
 * invoicing pathway (src/lib/ledger.ts) when the invoice is posted.
 */

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

// ─── Exported types ────────────────────────────────────────────────────────────

export interface TimeEntryRow {
  id: string;
  projectId: string;
  userId: string;
  date: Date;
  hours: number;
  description: string;
  hourlyRate: number | null;
  isBillable: boolean;
  invoiceLineId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeEntrySummary {
  totalHours: number;
  billableHours: number;
  unbilledHours: number; // billable but not yet invoiced
  billableValue: number; // sum of (hours × rate) for unbilled billable entries
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function listTimeEntries(
  companyId: string,
  projectId: string,
  opts?: { limit?: number; offset?: number; billableOnly?: boolean }
): Promise<TimeEntryRow[]> {
  const entries = await prisma.timeEntry.findMany({
    where: {
      companyId,
      projectId,
      ...(opts?.billableOnly ? { isBillable: true } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts?.limit ?? 100,
    skip: opts?.offset ?? 0,
  });

  type Row = (typeof entries)[number];
  return entries.map((e: Row): TimeEntryRow => ({
    id: e.id,
    projectId: e.projectId,
    userId: e.userId,
    date: e.date,
    hours: e.hours.toNumber(),
    description: e.description,
    hourlyRate: e.hourlyRate?.toNumber() ?? null,
    isBillable: e.isBillable,
    invoiceLineId: e.invoiceLineId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));
}

export async function getTimeEntrySummary(
  companyId: string,
  projectId: string
): Promise<TimeEntrySummary> {
  const entries = await prisma.timeEntry.findMany({
    where: { companyId, projectId },
  });

  type Row = (typeof entries)[number];
  let totalHours = 0;
  let billableHours = 0;
  let unbilledHours = 0;
  let billableValue = 0;

  for (const e of entries as Row[]) {
    const h = e.hours.toNumber();
    totalHours += h;
    if (e.isBillable) {
      billableHours += h;
      if (!e.invoiceLineId) {
        unbilledHours += h;
        billableValue += h * (e.hourlyRate?.toNumber() ?? 0);
      }
    }
  }

  return { totalHours, billableHours, unbilledHours, billableValue };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createTimeEntry(
  companyId: string,
  membershipId: string,
  data: {
    projectId: string;
    userId: string;
    date: Date;
    hours: number;
    description: string;
    hourlyRate?: number | null;
    isBillable?: boolean;
  }
): Promise<TimeEntryRow> {
  await requirePermission(membershipId, "projects", "EDIT");

  if (data.hours <= 0) throw new Error("Hours must be greater than zero.");
  if (data.hours > 24) throw new Error("Cannot log more than 24 hours in a single entry.");

  // Confirm project belongs to this company
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, companyId },
  });
  if (!project) throw new Error("Project not found.");

  const entry = await prisma.timeEntry.create({
    data: {
      companyId,
      projectId: data.projectId,
      userId: data.userId,
      date: data.date,
      hours: data.hours,
      description: data.description,
      hourlyRate: data.hourlyRate ?? null,
      isBillable: data.isBillable ?? true,
    },
  });

  await recordAuditEvent({
    companyId,
    action: "time_tracking.entry_created",
    entityType: "TimeEntry",
    entityId: entry.id,
    newValue: {
      projectId: data.projectId,
      hours: data.hours,
      date: data.date.toISOString().substring(0, 10),
      isBillable: data.isBillable ?? true,
    },
  });

  return {
    id: entry.id,
    projectId: entry.projectId,
    userId: entry.userId,
    date: entry.date,
    hours: entry.hours.toNumber(),
    description: entry.description,
    hourlyRate: entry.hourlyRate?.toNumber() ?? null,
    isBillable: entry.isBillable,
    invoiceLineId: entry.invoiceLineId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function updateTimeEntry(
  companyId: string,
  membershipId: string,
  entryId: string,
  data: {
    date?: Date;
    hours?: number;
    description?: string;
    hourlyRate?: number | null;
    isBillable?: boolean;
  }
): Promise<void> {
  await requirePermission(membershipId, "projects", "EDIT");

  const existing = await prisma.timeEntry.findFirst({
    where: { id: entryId, companyId },
  });
  if (!existing) throw new Error("Time entry not found.");
  if (existing.invoiceLineId) throw new Error("Cannot edit a time entry that has already been invoiced.");

  if (data.hours !== undefined) {
    if (data.hours <= 0) throw new Error("Hours must be greater than zero.");
    if (data.hours > 24) throw new Error("Cannot log more than 24 hours in a single entry.");
  }

  await prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      ...(data.date !== undefined ? { date: data.date } : {}),
      ...(data.hours !== undefined ? { hours: data.hours } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
      ...(data.isBillable !== undefined ? { isBillable: data.isBillable } : {}),
    },
  });

  await recordAuditEvent({
    companyId,
    action: "time_tracking.entry_updated",
    entityType: "TimeEntry",
    entityId: entryId,
    newValue: data,
  });
}

export async function deleteTimeEntry(
  companyId: string,
  membershipId: string,
  entryId: string
): Promise<void> {
  await requirePermission(membershipId, "projects", "EDIT");

  const existing = await prisma.timeEntry.findFirst({
    where: { id: entryId, companyId },
  });
  if (!existing) throw new Error("Time entry not found.");
  if (existing.invoiceLineId) throw new Error("Cannot delete a time entry that has already been invoiced.");

  await prisma.timeEntry.delete({ where: { id: entryId } });

  await recordAuditEvent({
    companyId,
    action: "time_tracking.entry_deleted",
    entityType: "TimeEntry",
    entityId: entryId,
    newValue: { deletedAt: new Date().toISOString() },
  });
}

// ─── Unbilled billable entries (for invoice conversion) ───────────────────────

export async function listUnbilledEntries(
  companyId: string,
  projectId: string
): Promise<TimeEntryRow[]> {
  return listTimeEntries(companyId, projectId, { billableOnly: true }).then((entries) =>
    entries.filter((e) => !e.invoiceLineId)
  );
}

/**
 * Mark a batch of time entries as invoiced.
 * Called from the invoicing workflow once an invoice line has been created.
 * Only entries that are billable and not already invoiced are updated.
 */
export async function markEntriesInvoiced(
  companyId: string,
  membershipId: string,
  entryIds: string[],
  invoiceLineId: string
): Promise<void> {
  await requirePermission(membershipId, "invoices", "EDIT");

  const entries = await prisma.timeEntry.findMany({
    where: {
      id: { in: entryIds },
      companyId,
      isBillable: true,
      invoiceLineId: null,
    },
  });

  if (entries.length === 0) throw new Error("No eligible unbilled time entries found.");

  type EntryRow = (typeof entries)[number];
  const validIds = entries.map((e: EntryRow) => e.id);

  await prisma.timeEntry.updateMany({
    where: { id: { in: validIds } },
    data: { invoiceLineId },
  });

  await recordAuditEvent({
    companyId,
    action: "time_tracking.entries_invoiced",
    entityType: "InvoiceLine",
    entityId: invoiceLineId,
    newValue: { entryIds: validIds, count: validIds.length },
  });
}
