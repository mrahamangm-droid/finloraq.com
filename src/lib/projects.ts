import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { foreignReferenceProblem } from "@/lib/tenantRefs";
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
  const customerProblem = await foreignReferenceProblem(prisma, params.companyId, "customer", [params.customerId]);
  if (customerProblem) throw new ProjectValidationError(customerProblem);

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

/** Thrown for a bad edit, e.g. clearing the name or code. */
export class ProjectValidationError extends Error {}

/**
 * Edits a project's own fields (name, code, linked customer, budget).
 * Doesn't touch isActive (setProjectActive owns that) or history —
 * invoices/bills already linked to this project keep pointing at the same
 * row, so renaming or rebudgeting a project never disturbs past postings.
 * Any field left `undefined` is left untouched.
 */
export async function updateProject(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  projectId: string;
  name?: string;
  code?: string;
  customerId?: string | null;
  budget?: number | null;
}) {
  await requirePermission(params.membershipId, "projects", "EDIT");

  const before = await prisma.project.findFirst({ where: { id: params.projectId, companyId: params.companyId } });
  if (!before) throw new NotFoundError("Project not found.");

  if (params.name !== undefined && params.name.trim() === "") {
    throw new ProjectValidationError("Project name can't be empty.");
  }
  if (params.code !== undefined && params.code.trim() === "") {
    throw new ProjectValidationError("Project code can't be empty.");
  }
  const customerProblem = await foreignReferenceProblem(prisma, params.companyId, "customer", [params.customerId]);
  if (customerProblem) throw new ProjectValidationError(customerProblem);

  if (params.code !== undefined && params.code.trim() !== before.code) {
    const clash = await prisma.project.findUnique({
      where: { companyId_code: { companyId: params.companyId, code: params.code.trim() } },
    });
    if (clash && clash.id !== params.projectId) {
      throw new ProjectValidationError(`Project code "${params.code.trim()}" is already in use.`);
    }
  }

  const project = await prisma.project.update({
    where: { id: params.projectId },
    data: {
      name: params.name !== undefined ? params.name.trim() : undefined,
      code: params.code !== undefined ? params.code.trim() : undefined,
      customerId: params.customerId !== undefined ? params.customerId : undefined,
      budget: params.budget !== undefined ? params.budget : undefined,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "project.updated",
    entityType: "Project",
    entityId: project.id,
    previousValue: { name: before.name, code: before.code, customerId: before.customerId, budget: before.budget?.toString() ?? null },
    newValue: { name: project.name, code: project.code, customerId: project.customerId, budget: project.budget?.toString() ?? null },
  });

  return project;
}

/**
 * Revenue = posted (SENT/PARTIALLY_PAID/PAID/OVERDUE) invoices linked to
 * this project, at their subtotal (pre-tax — tax isn't the company's
 * revenue). Cost = posted (APPROVED/PARTIALLY_PAID/PAID/OVERDUE) bills
 * linked to this project, at their subtotal, PLUS any direct cost posted
 * straight to the ledger with this project tagged on the line
 * (JournalLine.projectId — the manual journal entry form lets a line be
 * coded to a project; see new-journal-entry-form.tsx). That direct-cost
 * figure is read from POSTED lines against EXPENSE-type accounts only,
 * net of debit minus credit (so a correcting/reversing line on the same
 * account nets out rather than double-counting) — invoice/bill postings
 * never set JournalLine.projectId themselves (nothing in
 * buildInvoicePosting/buildBillPosting does), so there's no risk of
 * double-counting a bill's cost that's already captured via the `bills`
 * query above.
 */
export type ProjectProfitability = Awaited<ReturnType<typeof projectProfitability>>;

export async function projectProfitability(companyId: string, projectId: string) {
  const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, companyId } });

  const [invoices, bills, directCostLines] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, projectId, status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    }),
    prisma.bill.findMany({
      where: { companyId, projectId, status: { in: ["APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    }),
    prisma.journalLine.findMany({
      where: {
        projectId,
        account: { companyId, type: "EXPENSE" },
        journalEntry: { companyId, status: "POSTED" },
      },
      select: { debit: true, credit: true },
    }),
  ]);

  const revenue = sum(invoices.map((i: any) => i.subtotal)).toNumber();
  const billCost = sum(bills.map((b: any) => b.subtotal)).toNumber();
  const directCost = sum(directCostLines.map((l: any) => l.debit)).minus(sum(directCostLines.map((l: any) => l.credit))).toNumber();
  const cost = billCost + directCost;
  const margin = revenue - cost;
  const budget = project.budget?.toNumber() ?? null;

  return {
    project,
    revenue,
    cost,
    directCost,
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
  return Promise.all(projects.map((p: any) => projectProfitability(companyId, p.id)));
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
  if (!project) throw new NotFoundError("Project not found.");

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
  if (!project) throw new NotFoundError("Project not found.");

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
