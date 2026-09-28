import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { reverseJournalEntry, InvalidLineError, DuplicatePostingError, PeriodLockedError } from "@/lib/ledger";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();

  try {
    const reversal = await reverseJournalEntry({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
    });
    return NextResponse.json({ id: reversal.id, entryNumber: reversal.entryNumber });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidLineError || err instanceof DuplicatePostingError || err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
