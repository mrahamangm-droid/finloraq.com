import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createExpense, listRecentExpenses } from "@/lib/expenses";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().optional(),
});

async function handleGET() {
  const { active } = await requireTenantContext();
  const expenses = await listRecentExpenses(active.companyId);
  return NextResponse.json(expenses);
}

async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const entry = await createExpense({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    date: new Date(parsed.data.date),
    description: parsed.data.description,
    amount: parsed.data.amount,
    taxAmount: parsed.data.taxAmount,
  });

  return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber, status: entry.status });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
