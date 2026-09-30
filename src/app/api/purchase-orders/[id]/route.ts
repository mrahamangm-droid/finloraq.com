import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { getPurchaseOrder, updatePurchaseOrderStatus, deletePurchaseOrder } from "@/lib/purchase-orders";
import { domainErrorResponse } from "@/lib/api-errors";

const statusSchema = z.object({ status: z.enum(["SENT", "ACKNOWLEDGED", "CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED", "BILLED"]) });

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active } = await requireTenantContext();
  try {
    const po = await getPurchaseOrder(active.companyId, active.id, id);
    return NextResponse.json({ purchaseOrder: po });
  } catch (err) {
    return domainErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  try {
    const po = await updatePurchaseOrderStatus(active.companyId, active.id, userId, id, parsed.data.status);
    return NextResponse.json({ purchaseOrder: po });
  } catch (err) {
    return domainErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deletePurchaseOrder(active.companyId, active.id, userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
