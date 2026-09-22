import { prisma } from "@/lib/db";

/**
 * Append-only audit trail. There is deliberately no update/delete export
 * from this module — audit rows must never be mutated. Call this from
 * every state-changing server action/API route, not just accounting
 * postings: logins, role changes, exports, and settings changes all count.
 */
export async function recordAuditEvent(input: {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  source?: "web" | "api" | "ai" | "system";
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.auditEvent.create({
    data: {
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValue: input.previousValue === undefined ? undefined : (input.previousValue as object),
      newValue: input.newValue === undefined ? undefined : (input.newValue as object),
      source: input.source ?? "web",
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
