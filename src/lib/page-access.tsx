import { can, type Module } from "@/lib/rbac";
import { NoAccess } from "@/components/no-access";

const AREA_LABEL: Record<Module, string> = {
  dashboard: "the dashboard",
  accounting: "the chart of accounts",
  journals: "journal entries",
  sales: "sales",
  invoices: "invoices",
  purchases: "purchases",
  bills: "bills",
  expenses: "expenses",
  banking: "banking",
  customers: "customers",
  suppliers: "suppliers",
  projects: "projects",
  taxes: "taxes",
  reports: "reports",
  documents: "documents",
  users: "users",
  settings: "company settings",
  audit: "the audit log",
  ai_copilot: "the AI Copilot",
};

/**
 * Page-level read gate, the page counterpart of the VIEW checks on the read
 * APIs. Call it right after requireTenantContext() and before any query:
 *
 *   const denied = await viewGate(active.id, "journals");
 *   if (denied) return denied;
 *
 * Returns null when the member may view the module, otherwise the NoAccess
 * page to render instead. Uses can(), so PermissionOverride rows apply.
 */
export async function viewGate(membershipId: string, module: Module) {
  if (await can(membershipId, module, "VIEW")) return null;
  return <NoAccess area={AREA_LABEL[module]} />;
}
