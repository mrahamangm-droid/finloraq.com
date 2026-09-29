import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { createShipment } from "@/lib/sales-orders";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({
  shipDate: z.string(),
  notes: z.string().optional(),
  lines: z.array(z.object({ salesOrderLineId: z.string().min(1), quantity: z.number().positive() })).min(1),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  try {
    const { shipment, salesOrder } = await createShipment({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      salesOrderId: id,
      shipDate: new Date(body.shipDate),
      notes: body.notes,
      lines: body.lines,
    });
    return NextResponse.json({ id: shipment.id, shipmentNumber: shipment.shipmentNumber, salesOrderStatus: salesOrder.status });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
