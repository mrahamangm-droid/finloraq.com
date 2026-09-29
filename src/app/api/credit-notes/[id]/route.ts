import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getCreditNote } from "@/lib/credit-notes";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active } = await requireTenantContext();
    const creditNote = await getCreditNote(active.companyId, active.id, id);
    return NextResponse.json({ creditNote });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
