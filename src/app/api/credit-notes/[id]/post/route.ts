import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { postCreditNote } from "@/lib/credit-notes";

/** POST /api/credit-notes/:id/post — post a draft credit note to the ledger */
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    const entry = await postCreditNote(active.companyId, active.id, userId, id);
    return NextResponse.json({ journalEntry: entry });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}
