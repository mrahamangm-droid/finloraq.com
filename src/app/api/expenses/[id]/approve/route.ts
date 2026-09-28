import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { approveExpense, ApprovalPolicyError } from "@/lib/expenses";
import { InvalidLineError, PeriodLockedError } from "@/lib/ledger";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    const entry = await approveExpense({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
    });
    return NextResponse.json({ id: entry.id, status: entry.status });
  } catch (err) {
    if (err instanceof ApprovalPolicyError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof InvalidLineError || err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
