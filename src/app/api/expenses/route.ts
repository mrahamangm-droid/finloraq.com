import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { createExpense, listRecentExpenses } from "@/lib/expenses";
import { InvalidLineError } from "@/lib/ledger";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: z.number().positive().optional(),
});

export async function GET() {
  const { active } = await requireTenantContext();
  // Reads are gated on VIEW exactly like writes are gated on CREATE/EDIT —
  // a role without expenses:VIEW (e.g. STAFF) gets 403, not the data.
  if (!(await can(active.id, "expenses", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on expenses." }, { status: 403 });
  }
  const expenses = await listRecentExpenses(active.companyId);
  return NextResponse.json(expenses);
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const entry = await createExpense({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      date: new Date(parsed.data.date),
      description: parsed.data.description,
      amount: parsed.data.amount,
      taxAmount: parsed.data.taxAmount,
      currency: parsed.data.currency,
      exchangeRate: parsed.data.exchangeRate,
    });
    return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber, status: entry.status });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
