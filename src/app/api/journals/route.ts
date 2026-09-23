import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { postJournalEntry, UnbalancedEntryError, PeriodLockedError, InvalidLineError, DuplicatePostingError } from "@/lib/ledger";
import { prisma } from "@/lib/db";

const lineSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  description: z.string().optional(),
  costCentreId: z.string().optional(),
});

const createSchema = z.object({
  date: z.string(), // ISO date
  memo: z.string().optional(),
  currency: z.string().length(3),
  lines: z.array(lineSchema).min(2),
  post: z.boolean().default(false),
});

async function handleGET() {
  const { active } = await requireTenantContext();

  const entries = await prisma.journalEntry.findMany({
    where: { companyId: active.companyId },
    orderBy: { date: "desc" },
    take: 100,
    include: { lines: true },
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      date: e.date,
      sourceType: e.sourceType,
      status: e.status,
      memo: e.memo,
      total: e.lines.reduce((acc, l) => acc + Number(l.debit), 0),
    }))
  );
}

async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const entry = await postJournalEntry({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      date: new Date(body.date),
      sourceType: "MANUAL",
      memo: body.memo,
      currency: body.currency,
      lines: body.lines,
      post: body.post,
    });
    return NextResponse.json({ id: entry.id, entryNumber: entry.entryNumber, status: entry.status });
  } catch (err) {
    if (
      err instanceof UnbalancedEntryError ||
      err instanceof PeriodLockedError ||
      err instanceof InvalidLineError ||
      err instanceof DuplicatePostingError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
