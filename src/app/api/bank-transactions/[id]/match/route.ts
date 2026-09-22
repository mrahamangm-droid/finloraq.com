import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { matchBankTransaction } from "@/lib/banking";
import { InvalidLineError } from "@/lib/ledger";
import { prisma } from "@/lib/db";

const schema = z.object({ entryNumber: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const entry = await prisma.journalEntry.findFirst({
    where: { companyId: active.companyId, entryNumber: parsed.data.entryNumber },
  });
  if (!entry) {
    return NextResponse.json({ error: `No journal entry ${parsed.data.entryNumber} found.` }, { status: 400 });
  }

  try {
    const tx = await matchBankTransaction({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankTransactionId: params.id,
      journalEntryId: entry.id,
    });
    return NextResponse.json({ id: tx.id, status: tx.status });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
