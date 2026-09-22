import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createDraftExpenseFromExtraction } from "@/lib/ai/extraction";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const entry = await createDraftExpenseFromExtraction({
    companyId: active.companyId,
    membershipId: active.id,
    userId,
    documentId: params.id,
    date: new Date(parsed.data.date),
    description: parsed.data.description,
    amount: parsed.data.amount,
    taxAmount: parsed.data.taxAmount,
  });

  return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber, status: entry.status });
}
