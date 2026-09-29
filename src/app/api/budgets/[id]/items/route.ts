import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { upsertBudgetItems } from "@/lib/budget";

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    const body = await req.json();
    const budget = await upsertBudgetItems(active.companyId, active.id, userId, id, body.items);
    return NextResponse.json(budget);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
