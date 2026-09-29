import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { convertQuoteToInvoice } from "@/lib/quotes";

/** POST /api/quotes/:id/convert — convert an accepted quote to an invoice */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const invoice = await convertQuoteToInvoice({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      quoteId: id,
      dueDate: new Date(body.dueDate),
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
