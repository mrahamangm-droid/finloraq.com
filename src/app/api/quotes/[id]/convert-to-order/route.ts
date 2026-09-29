import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { convertQuoteToSalesOrder } from "@/lib/quotes";

/** POST /api/quotes/:id/convert-to-order — convert an accepted quote to a sales order */
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();

    const order = await convertQuoteToSalesOrder({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      quoteId: id,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    const status = msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
