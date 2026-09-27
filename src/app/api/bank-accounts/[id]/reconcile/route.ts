import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { reconcileBankAccount } from "@/lib/banking";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const count = await reconcileBankAccount({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    bankAccountId: params.id,
  });
  return NextResponse.json({ reconciled: count });
}
