import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { reconcileBankAccount } from "@/lib/banking";
import { NotFoundError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    const count = await reconcileBankAccount({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankAccountId: params.id,
    });
    return NextResponse.json({ reconciled: count });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
