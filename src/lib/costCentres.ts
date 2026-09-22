import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

export async function createCostCentre(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  code: string;
}) {
  await requirePermission(params.membershipId, "accounting", "CREATE");

  const costCentre = await prisma.costCentre.create({
    data: { companyId: params.companyId, name: params.name, code: params.code },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "cost_centre.created",
    entityType: "CostCentre",
    entityId: costCentre.id,
    newValue: { name: costCentre.name, code: costCentre.code },
  });

  return costCentre;
}

/** Spend by cost centre for a period — sums debit lines on EXPENSE-type
 *  accounts tagged with each cost centre, from posted entries only. This
 *  is the first real consumer of JournalLine.costCentreId, which the
 *  schema has carried since Phase 2 but nothing wrote to until the
 *  journal entry form grew a cost centre picker in this phase. */
export async function spendByCostCentre(companyId: string, from: Date, to: Date) {
  const costCentres = await prisma.costCentre.findMany({ where: { companyId, isActive: true } });

  const lines = await prisma.journalLine.findMany({
    where: {
      costCentreId: { not: null },
      account: { companyId, type: "EXPENSE" },
      journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } },
    },
  });

  return costCentres.map((cc) => {
    const ccLines = lines.filter((l) => l.costCentreId === cc.id);
    const spend = ccLines.reduce((a, l) => a + l.debit.toNumber() - l.credit.toNumber(), 0);
    return { id: cc.id, name: cc.name, code: cc.code, spend };
  });
}
