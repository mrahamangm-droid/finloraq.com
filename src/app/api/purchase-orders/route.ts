import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/purchase-orders";
import { domainErrorResponse } from "@/lib/api-errors";

const schema = z.object({
  supplierId: z.string().min(1),
  projectId: z.string().optional(),
  issueDate: z.string().min(1),
  expectedDate: z.string().optional(),
  currency: z.string().length(3),
  exchangeRate: z.number().positive().optional(),
  notes: z.string().max(5000).optional(),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      taxCodeId: z.string().optional(),
      productId: z.string().optional(),
    })
  ).min(1),
});

export async function GET(_req: NextRequest) {
  const { active } = await requireTenantContext();
  try {
    const pos = await listPurchaseOrders(active.companyId, active.id);
    return NextResponse.json({ purchaseOrders: pos });
  } catch (err) {
    return domainErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  try {
    const po = await createPurchaseOrder({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      supplierId: body.supplierId,
      projectId: body.projectId || undefined,
      issueDate: new Date(body.issueDate),
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
      currency: body.currency,
      exchangeRate: body.exchangeRate,
      notes: body.notes,
      lines: body.lines,
    });
    return NextResponse.json({ purchaseOrder: po }, { status: 201 });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
