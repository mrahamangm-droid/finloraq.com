import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { sum } from "@/lib/currency";
import { PartyInUseError } from "@/lib/parties";

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

export async function listProjectsWithProfitability(companyId: string, isActive = true) {
  const projects = await prisma.project.findMany({ where: { companyId, isActive }, orderBy: { createdAt: "desc" } });
  return Promise.all(projects.map((p) => projectProfitability(companyId, p.id)));
}

export async function countArchivedProjects(companyId: string) {
  return prisma.project.count({ where: { companyId, isActive: false } });
}

/**
 * Permanently removes a project. Refused when any invoice or bill was
 * ever linked to it, since that would orphan financial records; archive
 * (setProjectActive) is the right move for a project with history.
 * Mirrors deleteCustomer()/deleteSupplier() in src/lib/parties.ts, and
 * reuses their PartyInUseError — same "has history, archive instead"
 * concept, just checked against Invoice/Bill instead of one or the other.
 */
export async function deleteProject(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  projectId: string;
}) {
  await requirePermission(params.membershipId, "projects", "DELETE");

  const project = await prisma.project.findFirst({ where: { id: params.projectId, companyId: params.companyId } });
  if (!project) throw new Error("Project not found.");

  const [invoiceCount, billCount] = await Promise.all([
    prisma.invoice.count({ where: { projectId: project.id } }),
    prisma.bill.count({ where: { projectId: project.id } }),
  ]);
  const recordCount = invoiceCount + billCount;
  if (recordCount > 0) {
    throw new PartyInUseError(
      `${project.name} has ${recordCount} invoice/bill${recordCount === 1 ? "" : "s"} on record and can't be deleted. Archive it instead to hide it without losing that history.`
    );
  }

  await prisma.project.delete({ where: { id: project.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "project.deleted",
    entityType: "Project",
    entityId: project.id,
    previousValue: { name: project.name, code: project.code },
  });
}

/**
 * Archives or restores a project (toggles Project.isActive) instead of
 * deleting it — the safe option once it has invoice/bill history.
 * Mirrors setCustomerActive()/setSupplierActive() in src/lib/parties.ts.
 */
export async function setProjectActive(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  projectId: string;
  isActive: boolean;
}) {
  await requirePermission(params.membershipId, "projects", "DELETE");

  const project = await prisma.project.findFirst({ where: { id: params.projectId, companyId: params.companyId } });
  if (!project) throw new Error("Project not found.");

  const updated = await prisma.project.update({ where: { id: project.id }, data: { isActive: params.isActive } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: params.isActive ? "project.restored" : "project.archived",
    entityType: "Project",
    entityId: project.id,
  });

  return updated;
}
