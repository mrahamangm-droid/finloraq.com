import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { sum } from "@/lib/currency";

export async function createProject(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  name: string;
  code: string;
  customerId?: string;
  budget?: number;
}) {
  await requirePermission(params.membershipId, "projects", "CREATE");

  const project = await prisma.project.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      code: params.code,
      customerId: params.customerId,
      budget: params.budget,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "project.created",
    entityType: "Project",
    entityId: project.id,
    newValue: { name: project.name, code: project.code },
  });

  return project;
}

/**
 * Revenue = posted (SENT/PARTIALLY_PAID/PAID/OVERDUE) invoices linked to
 * this project, at their subtotal (pre-tax — tax isn't the company's
 * revenue). Cost = posted (APPROVED/PARTIALLY_PAID/PAID/OVERDUE) bills
 * linked to this project, at their subtotal. Both read the source
 * documents directly rather than re-deriving from journal lines, since
 * projectId lives on Invoice/Bill, not on JournalLine in this schema —
 * documented as a known limitation below (direct expenses coded to a
 * project via a JournalLine.projectId aren't counted here yet).
 */
export async function projectProfitability(companyId: string, projectId: string) {
  const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, companyId } });

  const [invoices, bills] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, projectId, status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    }),
    prisma.bill.findMany({
      where: { companyId, projectId, status: { in: ["APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    }),
  ]);

  const revenue = sum(invoices.map((i) => i.subtotal)).toNumber();
  const cost = sum(bills.map((b) => b.subtotal)).toNumber();
  const margin = revenue - cost;
  const budget = project.budget?.toNumber() ?? null;

  return {
    project,
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    budget,
    budgetVariance: budget !== null ? budget - cost : null,
    invoiceCount: invoices.length,
    billCount: bills.length,
  };
}

export async function listProjectsWithProfitability(companyId: string) {
  const projects = await prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  return Promise.all(projects.map((p) => projectProfitability(companyId, p.id)));
}
