import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { deleteDraftJournalEntry, InvalidLineError } from "@/lib/ledger";
import { updateDraftExpense } from "@/lib/expenses";
import { ForbiddenError } from "@/lib/rbac";

const patchSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  expenseAccountCode: z.string().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const expense = await updateDraftExpense({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
      date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      description: parsed.data.description,
      amount: parsed.data.amount,
      taxAmount: parsed.data.taxAmount,
      expenseAccountCode: parsed.data.expenseAccountCode,
    });
    return NextResponse.json({ id: expense.id });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteDraftJournalEntry({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
