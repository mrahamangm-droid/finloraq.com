import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/purchase-orders";

export async function GET(_req: NextRequest) {
  try {
    const { active } = await requireTenantContext();
    const pos = await listPurchaseOrders(active.companyId, active.id);
    return NextResponse.json({ purchaseOrders: pos });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const po = await createPurchaseOrder({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      supplierId: body.supplierId,
      projectId: body.projectId,
      issueDate: new Date(body.issueDate),
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
      currency: body.currency ?? "USD",
      notes: body.notes,
      lines: body.lines ?? [],
    });

    return NextResponse.json({ purchaseOrder: po }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}
