import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { reverseJournalEntry, InvalidLineError, PeriodLockedError, DuplicatePostingError } from "@/lib/ledger";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  try {
    const entry = await reverseJournalEntry({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
    });
    return NextResponse.json({ id: entry.id, status: entry.status });
  } catch (err) {
    if (err instanceof InvalidLineError || err instanceof PeriodLockedError || err instanceof DuplicatePostingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
