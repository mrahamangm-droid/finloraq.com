import type { CompanyRole, PermissionAction } from "@/lib/prisma-enums";
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
  | "crm"
  | "quotes"
  | "purchase_orders"
  | "credit_notes"
  | "recurring_invoices"
  | "projects"
  | "taxes"
  | "reports"
  | "documents"
  | "users"
  | "settings"
  | "audit"
  | "ai_copilot"
  | "products"
  | "inventory"
  | "workflows"
  | "approvals";

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
      "expenses", "banking", "customers", "suppliers", "crm", "quotes", "purchase_orders",
      "credit_notes", "recurring_invoices", "products", "inventory", "projects", "taxes", "reports",
      "documents", "users", "settings", "audit", "ai_copilot", "workflows", "approvals",
    ] as Module[]).map((m) => [m, ALL])
  ),
  CFO: {
    dashboard: ALL,
    // APPROVE on accounting = reopening a locked accounting period
    // (src/lib/periodClose.ts). Nothing else checks accounting:APPROVE.
    accounting: [...VIEW_CREATE_EDIT_EXPORT, "APPROVE"],
    journals: ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT"],
    sales: VIEW_EXPORT,
    invoices: VIEW_EXPORT,
    purchases: VIEW_EXPORT,
    bills: ["VIEW", "APPROVE", "EXPORT"],
    expenses: ["VIEW", "APPROVE", "EXPORT"],
    banking: ["VIEW", "APPROVE", "EXPORT"],
    customers: VIEW_EXPORT,
    suppliers: VIEW_EXPORT,
    crm: VIEW_EXPORT, // pipeline value for revenue forecasting
    products: VIEW_EXPORT,
    inventory: VIEW_EXPORT,
    quotes: VIEW_EXPORT,
    purchase_orders: VIEW_EXPORT,
    credit_notes: ["VIEW", "APPROVE", "EXPORT"],
    recurring_invoices: VIEW_EXPORT,
    projects: VIEW_EXPORT,
    taxes: VIEW_EXPORT,
    reports: VIEW_EXPORT,
    documents: VIEW_ONLY,
    users: VIEW_ONLY,
    settings: VIEW_ONLY,
    audit: VIEW_ONLY,
    ai_copilot: ALL,
    workflows: ALL,
    approvals: ALL,
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
    banking: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    customers: VIEW_CREATE_EDIT,
    suppliers: VIEW_CREATE_EDIT,
    crm: VIEW_ONLY, // read pipeline for cash-flow planning
    products: VIEW_CREATE_EDIT,
    inventory: VIEW_CREATE_EDIT,
    quotes: VIEW_CREATE_EDIT,
    purchase_orders: VIEW_CREATE_EDIT,
    credit_notes: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    recurring_invoices: VIEW_CREATE_EDIT,
    projects: VIEW_CREATE_EDIT,
    taxes: VIEW_CREATE_EDIT,
    reports: VIEW_EXPORT,
    documents: VIEW_CREATE_EDIT,
    users: VIEW_ONLY,
    settings: [],
    audit: VIEW_ONLY,
    ai_copilot: VIEW_CREATE_EDIT,
    workflows: VIEW_CREATE_EDIT,
    approvals: ALL,
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
    crm: [], // accountants deal with the resulting invoices, not the pipeline
    products: VIEW_CREATE_EDIT, // accountants manage product/service catalog
    inventory: VIEW_CREATE_EDIT, // accountants track stock movements
    quotes: VIEW_ONLY, // quotes that became invoices are visible for context
    purchase_orders: VIEW_CREATE_EDIT, // bills come from POs
    credit_notes: VIEW_CREATE_EDIT, // can draft; posting requires APPROVE which finance managers hold
    recurring_invoices: VIEW_CREATE_EDIT, // accountants manage the template schedule
    projects: VIEW_ONLY,
    taxes: VIEW_CREATE_EDIT,
    reports: VIEW_EXPORT,
    documents: VIEW_CREATE_EDIT,
    users: [],
    settings: [],
    audit: [],
    ai_copilot: VIEW_CREATE_EDIT,
    workflows: VIEW_ONLY,
    approvals: VIEW_ONLY,
  },
  STAFF: {
    dashboard: VIEW_ONLY,
    expenses: ["VIEW", "CREATE"],
    invoices: VIEW_ONLY,
    customers: VIEW_ONLY,
    crm: VIEW_CREATE_EDIT, // staff handle day-to-day CRM: leads, contacts, deals
    products: VIEW_ONLY, // staff can browse the catalog but not modify it
    quotes: VIEW_CREATE_EDIT, // staff can create and send quotes
    purchase_orders: [], // purchasing is finance/management territory
    credit_notes: [], // credit notes are a finance function
    recurring_invoices: [], // recurring invoice templates are a finance function
    projects: VIEW_ONLY,
    documents: ["VIEW", "CREATE"],
    ai_copilot: ["VIEW", "CREATE"],
    approvals: VIEW_ONLY,
  },
  AUDITOR: Object.fromEntries(
    ([
      "dashboard", "accounting", "journals", "sales", "invoices", "purchases", "bills",
      "expenses", "banking", "customers", "suppliers", "crm", "quotes", "purchase_orders",
      "credit_notes", "recurring_invoices", "products", "inventory", "projects", "taxes", "reports",
      "documents", "audit", "approvals",
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
