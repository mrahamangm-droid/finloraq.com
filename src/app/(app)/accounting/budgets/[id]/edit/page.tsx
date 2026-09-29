import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { getBudget } from "@/lib/budget";
import { prisma } from "@/lib/db";
import { BudgetEditor } from "@/components/budgets/budget-editor";

// Account types we want in the budget editor
const BUDGET_ACCOUNT_TYPES = ["REVENUE", "EXPENSE"];

interface EditBudgetPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: EditBudgetPageProps) {
  return { title: "Edit Budget — Finloraq" };
}

export default async function EditBudgetPage(props: EditBudgetPageProps) {
  const params = await props.params;
  const { id } = params;

  const { active } = await requireTenantContext();
  await requirePermission(active.id, "reports", "VIEW");

  // Load budget with items (getBudget throws if not found)
  let budget: Awaited<ReturnType<typeof getBudget>>;
  try {
    budget = await getBudget(active.companyId, active.id, id);
  } catch {
    notFound();
  }

  // Load chart of accounts (REVENUE + EXPENSE only, active)
  const accounts = await prisma.account.findMany({
    where: {
      companyId: active.companyId,
      isActive: true,
      type: { in: BUDGET_ACCOUNT_TYPES },
    },
    select: { code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  // Transform BudgetItem[] into Record<accountCode, Record<month, amount>>
  const initialData: Record<string, Record<number, number>> = {};
  for (const item of budget.items) {
    if (!initialData[item.accountCode]) initialData[item.accountCode] = {};
    initialData[item.accountCode]![item.month] = Number(item.amount);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/accounting/budgets" className="hover:text-foreground">
          Budgets
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">{budget.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{budget.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter monthly budget amounts for each account.
            Changes are saved when you click &ldquo;Save Budget&rdquo;.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/reports/budget-vs-actual?budgetId=${budget.id}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            View Report
          </Link>
        </div>
      </div>

      {/* Spreadsheet editor */}
      <BudgetEditor
        budgetId={budget.id}
        fiscalYear={budget.fiscalYear}
        currency={budget.currency}
        accounts={accounts}
        initialData={initialData}
      />
    </div>
  );
}
