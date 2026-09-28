import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { updateBankTransaction, deleteBankTransaction, BankValidationError } from "@/lib/banking";
import { ForbiddenError } from "@/lib/rbac";

const patchSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const tx = await updateBankTransaction({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankTransactionId: params.id,
      date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      description: parsed.data.description,
      amount: parsed.data.amount,
    });
    return NextResponse.json({ id: tx.id });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof BankValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteBankTransaction({ companyId: active.companyId, membershipId: active.id, userId, bankTransactionId: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof BankValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
