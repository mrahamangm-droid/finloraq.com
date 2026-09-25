import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { deleteDraftJournalEntry } from "@/lib/ledger";
import { InvalidLineError } from "@/lib/ledger";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { active, userId } = await requireTenantContext();
  try {
    await deleteDraftJournalEntry({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      journalEntryId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
