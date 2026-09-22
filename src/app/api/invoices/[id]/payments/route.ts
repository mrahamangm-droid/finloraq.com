import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { recordInvoicePayment } from "@/lib/sales";
import { InvalidLineError } from "@/lib/ledger";

const schema = z.object({ amount: z.number().positive(), date: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const entry = await recordInvoicePayment({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      invoiceId: params.id,
      amount: parsed.data.amount,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
    });
    return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
