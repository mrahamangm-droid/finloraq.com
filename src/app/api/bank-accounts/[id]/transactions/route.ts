import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { recordBankTransaction } from "@/lib/banking";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number(), // signed: +in / -out
});

async function handlePOST(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

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
}

export const POST = withApiErrors(handlePOST);
