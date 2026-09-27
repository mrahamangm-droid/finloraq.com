import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { updateAccount, deleteAccount, AccountValidationError, AccountInUseError } from "@/lib/accounts";
import { ForbiddenError } from "@/lib/rbac";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

const patchSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const account = await updateAccount({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      accountId: params.id,
      ...parsed.data,
    });
    return NextResponse.json({ id: account.id });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof AccountValidationError || err instanceof AccountInUseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  try {
    await deleteAccount({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      accountId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof AccountInUseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
