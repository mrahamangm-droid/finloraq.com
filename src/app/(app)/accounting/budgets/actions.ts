"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { createBudget } from "@/lib/budget";

export async function createBudgetAction(formData: FormData) {
  const { active, userId } = await requireTenantContext();

  const name = String(formData.get("name") ?? "").trim();
  const fiscalYear = parseInt(String(formData.get("fiscalYear") ?? new Date().getFullYear()), 10);
  const currency = String(formData.get("currency") ?? active.company.baseCurrency ?? "USD").trim();

  if (!name) throw new Error("Budget name is required");
  if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) throw new Error("Invalid fiscal year");

  const budget = await createBudget({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    name,
    fiscalYear,
    currency,
    items: [], // Items are entered in the editor after creation
  });

  revalidatePath("/accounting/budgets");
  redirect(`/accounting/budgets/${budget.id}/edit`);
}
