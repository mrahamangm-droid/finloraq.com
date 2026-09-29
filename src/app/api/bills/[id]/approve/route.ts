import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/apiHandler";
import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { approveAndPostBill } from "@/lib/purchases";
import { InvalidLineError, DuplicatePostingError, PeriodLockedError } from "@/lib/ledger";

async function handlePOST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active, userId } = await requireTenantContext();
  try {
    const bill = await approveAndPostBill({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      billId: id,
    });
    return NextResponse.json({ id: bill.id, status: bill.status });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidLineError || err instanceof DuplicatePostingError || err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withApiErrors(handlePOST);
