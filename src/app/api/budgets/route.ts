import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listBudgets, createBudget } from "@/lib/budget";

export async function GET() {
  try {
    const { active } = await requireTenantContext();
    const budgets = await listBudgets(active.companyId, active.id);
    return NextResponse.json(budgets);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const body = await req.json();
    const budget = await createBudget({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      name: body.name,
      fiscalYear: body.fiscalYear,
      currency: body.currency ?? active.company.baseCurrency ?? "USD",
      items: body.items ?? [],
    });
    return NextResponse.json(budget, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
