import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { reconcileBankAccount } from "@/lib/banking";

async function handlePOST(_req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const count = await reconcileBankAccount({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    bankAccountId: params.id,
  });
  return NextResponse.json({ reconciled: count });
}

export const POST = withApiErrors(handlePOST);
