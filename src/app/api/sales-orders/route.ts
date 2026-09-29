import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { createSalesOrder } from "@/lib/sales-orders";
import { InvalidLineError } from "@/lib/ledger";
import { prisma } from "@/lib/db";

const schema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string(),
  currency: z.string().length(3),
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

export async function GET() {
  const { active } = await requireTenantContext();
  if (!(await can(active.id, "sales_orders", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on sales orders." }, { status: 403 });
  }
  const orders = await prisma.salesOrder.findMany({
    where: { companyId: active.companyId },
    orderBy: { issueDate: "desc" },
    include: { customer: true },
  });
  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const order = await createSalesOrder({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      currency: body.currency,
      lines: body.lines,
    });
    return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
