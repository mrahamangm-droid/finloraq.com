import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { approveExpense } from "@/lib/expenses";
import { InvalidLineError, PeriodLockedError } from "@/lib/ledger";

async function handlePOST(_req: Request, { params }: { params: { id: string } }) {
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
    if (err instanceof InvalidLineError || err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withApiErrors(handlePOST);
