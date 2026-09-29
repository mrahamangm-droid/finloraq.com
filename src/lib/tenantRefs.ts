import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Checks that ids arriving in a request body (a customer on an invoice, a
 * cost centre on a journal line, ...) belong to the acting company.
 *
 * Every lookup of a record *by the route's own id* is already scoped to
 * companyId, but a foreign key taken from the body was being written as-is,
 * so company A could attach company B's customer to its own invoice — and
 * then read that customer back through A's invoice list. Callers throw their
 * own validation error when this returns anything.
 */
export type TenantRefKind =
  | "customer" | "supplier" | "project" | "costCentre" | "department" | "account" | "taxCode"
  | "membership" | "lead" | "deal" | "crmContact" | "pipeline" | "pipelineStage";

const LABELS: Record<TenantRefKind, string> = {
  customer: "Customer",
  supplier: "Supplier",
  project: "Project",
  costCentre: "Cost centre",
  department: "Department",
  account: "Account",
  taxCode: "Tax code",
  membership: "Team member",
  lead: "Lead",
  deal: "Deal",
  crmContact: "Contact",
  pipeline: "Pipeline",
  pipelineStage: "Pipeline stage",
};

type Db = PrismaClient | Prisma.TransactionClient;

async function countOwned(db: Db, kind: TenantRefKind, companyId: string, ids: string[]): Promise<number> {
  const where = { companyId, id: { in: ids } };
  switch (kind) {
    case "customer": return db.customer.count({ where });
    case "supplier": return db.supplier.count({ where });
    case "project": return db.project.count({ where });
    case "costCentre": return db.costCentre.count({ where });
    case "department": return db.department.count({ where });
    case "account": return db.account.count({ where });
    case "taxCode": return db.taxCode.count({ where });
    case "membership": return db.companyMembership.count({ where });
    case "lead": return db.lead.count({ where });
    case "deal": return db.deal.count({ where });
    case "crmContact": return db.crmContact.count({ where });
    case "pipeline": return db.pipeline.count({ where });
    case "pipelineStage": return db.pipelineStage.count({ where });
  }
}

/**
 * Returns a human-readable problem ("Customer not found.") if any of `ids`
 * isn't a `kind` record of `companyId`, or null when they all are. Empty,
 * null and undefined ids are ignored, so optional fields can be passed straight through.
 */
export async function foreignReferenceProblem(
  db: Db,
  companyId: string,
  kind: TenantRefKind,
  ids: (string | null | undefined)[],
): Promise<string | null> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return null;
  const owned = await countOwned(db, kind, companyId, unique);
  return owned === unique.length ? null : `${LABELS[kind]} not found.`;
}
