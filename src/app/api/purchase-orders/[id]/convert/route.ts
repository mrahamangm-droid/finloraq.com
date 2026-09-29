import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { convertPOToBill } from "@/lib/purchase-orders";

/** POST /api/purchase-orders/:id/convert — convert a received PO to a bill */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const bill = await convertPOToBill({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      poId: id,
      dueDate: new Date(body.dueDate),
    });

    return NextResponse.json({ bill }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}
