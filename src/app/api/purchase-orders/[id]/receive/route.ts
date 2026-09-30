import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createPurchaseReceive } from "@/lib/purchase-orders";
import { domainErrorResponse } from "@/lib/api-errors";

const schema = z.object({
  receiveDate: z.string().min(1),
  notes: z.string().max(5000).optional(),
  lines: z.array(z.object({ purchaseOrderLineId: z.string().min(1), quantity: z.number().positive() })).min(1),
});

/** POST /api/purchase-orders/:id/receive — record goods received against the PO. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { receive, purchaseOrder } = await createPurchaseReceive({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      poId: id,
      receiveDate: new Date(parsed.data.receiveDate),
      notes: parsed.data.notes,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ id: receive.id, receiveNumber: receive.receiveNumber, purchaseOrderStatus: purchaseOrder.status }, { status: 201 });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
