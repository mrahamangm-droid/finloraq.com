import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { voidCreditNote } from "@/lib/credit-notes";

/** POST /api/credit-notes/:id/void — void a credit note (reverses ledger if posted) */
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    await voidCreditNote(active.companyId, active.id, userId, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}
