import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createDraftExpenseFromExtraction, DocumentNotFoundError } from "@/lib/ai/extraction";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
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
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
