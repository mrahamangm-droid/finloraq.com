import { requireTenantContext } from "@/lib/tenant";
import { listWorkflowRules } from "@/lib/workflow";
import {
  createWorkflowRuleAction,
  deleteWorkflowRuleAction,
  toggleWorkflowRuleAction,
} from "./actions";

const ENTITY_TYPES = ["Expense", "Bill", "JournalEntry"] as const;

const ROLES = [
  { value: "STAFF",           label: "Staff" },
  { value: "ACCOUNTANT",      label: "Accountant" },
  { value: "FINANCE_MANAGER", label: "Finance Manager" },
  { value: "CFO",             label: "CFO" },
  { value: "COMPANY_ADMIN",   label: "Company Admin" },
] as const;

function fmtAmount(v: unknown): string {
  if (v == null) return "—";
  const n = typeof v === "object" ? (v as any).toNumber?.() ?? v : Number(v);
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2 }).format(n);
}

export default async function WorkflowsPage() {
  const { active } = await requireTenantContext();
  const rules = await listWorkflowRules(active.company.id, active.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Workflow Rules</h1>
        <p className="text-sm text-muted-foreground">
          Define approval gates that must be cleared before certain transactions are posted.
          For example: any Expense over AED 5,000 requires a CFO to approve.
        </p>
      </div>

      {/* Existing rules */}
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflow rules yet. Add one below to start routing approvals.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-right">Min Amount</th>
                <th className="px-4 py-3 text-right">Max Amount</th>
                <th className="px-4 py-3 text-left">Required Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule: any) => (
                <tr key={rule.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{rule.entityType}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {fmtAmount(rule.minAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {fmtAmount(rule.maxAmount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ROLES.find((r) => r.value === rule.requiredRole)?.label ?? rule.requiredRole}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.isActive
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rule.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <form
                        action={toggleWorkflowRuleAction.bind(null, rule.id, !rule.isActive)}
                      >
                        <button
                          type="submit"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {rule.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={deleteWorkflowRuleAction.bind(null, rule.id)}>
                        <button
                          type="submit"
                          className="text-xs text-destructive underline-offset-2 hover:underline"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create new rule form */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Add New Rule</h2>
        <form action={createWorkflowRuleAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Rule Name
            </label>
            <input
              name="name"
              required
              placeholder="e.g. High-value expense"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Entity Type
            </label>
            <select
              name="entityType"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Required Role (minimum)
            </label>
            <select
              name="requiredRole"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Min Amount (leave blank for no lower bound)
            </label>
            <input
              name="minAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Max Amount (leave blank for no upper bound)
            </label>
            <input
              name="maxAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="no limit"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
