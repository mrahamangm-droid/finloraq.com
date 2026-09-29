import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getQuote, updateQuoteStatus, deleteQuote } from "@/lib/quotes";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active } = await requireTenantContext();
    const quote = await getQuote(active.companyId, active.id, id);
    return NextResponse.json({ quote });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const quote = await updateQuoteStatus(
      active.companyId, active.id, userId, id, body.status
    );
    return NextResponse.json({ quote });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    await deleteQuote(active.companyId, active.id, userId, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
