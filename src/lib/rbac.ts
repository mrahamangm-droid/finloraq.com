import type { CompanyRole, PermissionAction } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Server-side authorization only. Nothing in this file is ever safe to
 * trust from the client — every mutating API route and server action must
 * call requirePermission()/can() itself; the UI hiding a button is a
 * convenience, not a control.
 */

export type Module =
  | "dashboard"
  | "accounting"
  | "journals"
  | "sales"
  | "invoices"
  | "purchases"
  | "bills"
  | "expenses"
  | "banking"
  | "customers"
  | "suppliers"
  | "projects"
  | "taxes"
  | "reports"
  | "documents"
  | "users"
  | "settings"
  | "audit"
  | "ai_copilot";

const ALL: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "APPROVE", "DELETE", "EXPORT"];
const VIEW_ONLY: PermissionAction[] = ["VIEW"];
const VIEW_EXPORT: PermissionAction[] = ["VIEW", "EXPORT"];
const VIEW_CREATE_EDIT: PermissionAction[] = ["VIEW", "CREATE", "EDIT"];
const VIEW_CREATE_EDIT_EXPORT: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "EXPORT"];

/**
 * Default permission matrix by role. This is the source of truth for
 * "what can a role do" — PermissionOverride rows in the DB layer on top
 * of this per user, per module, per company.
 */
const DEFAULT_MATRIX: Record<CompanyRole, Partial<Record<Module, PermissionAction[]>>> = {
  COMPANY_ADMIN: Object.fromEntries(
    ([
      "dashboard", "accounting", "journals", "sales", "invoices", "purchases", "bills",
      "expenses", "banking", "customers", "suppliers", "projects", "taxes", "reports",
      "documents", "users", "settings", "audit", "ai_copilot",
    ] as Module[]).map((m) => [m, ALL])
  ),
  CFO: {
    dashboard: ALL,
    accounting: VIEW_CREATE_EDIT_EXPORT,
    journals: ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT"],
    sales: VIEW_EXPORT,
    invoices: VIEW_EXPORT,
    purchases: VIEW_EXPORT,
    bills: ["VIEW", "APPROVE", "EXPORT"],
    expenses: ["VIEW", "APPROVE", "EXPORT"],
    banking: VIEW_EXPORT,
    customers: VIEW_EXPORT,
    suppliers: VIEW_EXPORT,
    projects: VIEW_EXPORT,
    taxes: VIEW_EXPORT,
    reports: VIEW_EXPORT,
    documents: VIEW_ONLY,
    users: VIEW_ONLY,
    settings: VIEW_ONLY,
    audit: VIEW_ONLY,
    ai_copilot: ALL,
  },
  FINANCE_MANAGER: {
    dashboard: VIEW_ONLY,
    accounting: VIEW_CREATE_EDIT,
    journals: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    sales: VIEW_CREATE_EDIT,
    invoices: VIEW_CREATE_EDIT,
    purchases: VIEW_CREATE_EDIT,
    bills: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    expenses: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    banking: VIEW_CREATE_EDIT,
    customers: VIEW_CREATE_EDIT,
    suppliers: VIEW_CREATE_EDIT,
    projects: VIEW_CREATE_EDIT,
    taxes: VIEW_CREATE_EDIT,
    reports: VIEW_EXPORT,
    documents: VIEW_CREATE_EDIT,
    users: VIEW_ONLY,
    settings: [],
    audit: VIEW_ONLY,
    ai_copilot: VIEW_CREATE_EDIT,
  },
  ACCOUNTANT: {
    dashboard: VIEW_ONLY,
    accounting: VIEW_CREATE_EDIT,
    journals: VIEW_CREATE_EDIT,
    sales: VIEW_CREATE_EDIT,
    invoices: VIEW_CREATE_EDIT,
    purchases: VIEW_CREATE_EDIT,
    bills: VIEW_CREATE_EDIT,
    expenses: VIEW_CREATE_EDIT,
    banking: VIEW_CREATE_EDIT,
    customers: VIEW_CREATE_EDIT,
    suppliers: VIEW_CREATE_EDIT,
    projects: VIEW_ONLY,
    taxes: VIEW_CREATE_EDIT,
    reports: VIEW_EXPORT,
    documents: VIEW_CREATE_EDIT,
    users: [],
    settings: [],
    audit: [],
    ai_copilot: VIEW_CREATE_EDIT,
  },
  STAFF: {
    dashboard: VIEW_ONLY,
    expenses: ["VIEW", "CREATE"],
    invoices: VIEW_ONLY,
    customers: VIEW_ONLY,
    projects: VIEW_ONLY,
    documents: ["VIEW", "CREATE"],
    ai_copilot: ["VIEW", "CREATE"],
  },
  AUDITOR: Object.fromEntries(
    ([
      "dashboard", "accounting", "journals", "sales", "invoices", "purchases", "bills",
      "expenses", "banking", "customers", "suppliers", "projects", "taxes", "reports",
      "documents", "audit",
    ] as Module[]).map((m) => [m, VIEW_EXPORT])
  ),
};

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Pure function over the default matrix — used by unit tests and can(). */
export function roleCan(role: CompanyRole, module: Module, action: PermissionAction): boolean {
  return DEFAULT_MATRIX[role]?.[module]?.includes(action) ?? false;
}

/**
 * Full check: role default matrix, then any PermissionOverride for this
 * specific membership. Overrides can grant OR revoke relative to the
 * default, so both directions are checked explicitly.
 */
export async function can(
  membershipId: string,
  module: Module,
  action: PermissionAction
): Promise<boolean> {
  const membership = await prisma.companyMembership.findUnique({
    where: { id: membershipId },
    include: { overrides: { where: { module, action } } },
  });
  if (!membership || !membership.isActive) return false;

  const override = membership.overrides[0];
  if (override) return override.granted;

  return roleCan(membership.role, module, action);
}

export async function requirePermission(
  membershipId: string,
  module: Module,
  action: PermissionAction
): Promise<void> {
  if (!(await can(membershipId, module, action))) {
    throw new ForbiddenError(`Missing ${action} on ${module}.`);
  }
}
