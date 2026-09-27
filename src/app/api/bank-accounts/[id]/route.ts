import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { updateBankAccount, deleteBankAccount, BankValidationError } from "@/lib/banking";
import { ForbiddenError } from "@/lib/rbac";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  openingBalance: z.number().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const account = await updateBankAccount({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankAccountId: params.id,
      ...parsed.data,
    });
    return NextResponse.json({ id: account.id });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof BankValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteBankAccount({ companyId: active.companyId, membershipId: active.id, userId, bankAccountId: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof BankValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
