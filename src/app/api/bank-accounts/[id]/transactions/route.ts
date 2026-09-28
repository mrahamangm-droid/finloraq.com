import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { recordBankTransaction } from "@/lib/banking";
import { NotFoundError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number(), // signed: +in / -out
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const tx = await recordBankTransaction({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankAccountId: params.id,
      date: new Date(parsed.data.date),
      description: parsed.data.description,
      amount: parsed.data.amount,
    });
    return NextResponse.json({ id: tx.id });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
