import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createBudgetAction } from "../actions";

export const metadata = { title: "New Budget — Finloraq" };

export default async function NewBudgetPage() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "reports", "CREATE");

  const currentYear = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accounting/budgets" className="text-sm text-muted-foreground hover:text-foreground">
          ← Budgets
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">New Budget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create an annual budget, then enter monthly amounts per account in the editor.
        </p>
      </div>

      <form action={createBudgetAction} className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Budget Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              maxLength={255}
              placeholder="e.g. FY2026 Operating Budget"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Fiscal Year <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                name="fiscalYear"
                required
                min={2000}
                max={2100}
                defaultValue={currentYear}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
              <input
                type="text"
                name="currency"
                maxLength={3}
                defaultValue={active.company.baseCurrency ?? "USD"}
                placeholder="USD"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/accounting/budgets"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create &amp; Open Editor
          </button>
        </div>
      </form>
    </div>
  );
}
