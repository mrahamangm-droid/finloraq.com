import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { confirmSalesOrder } from "@/lib/sales-orders";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    const order = await confirmSalesOrder({ companyId: active.companyId, membershipId: active.id, userId, salesOrderId: id });
    return NextResponse.json({ id: order.id, status: order.status });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
