import { withApiErrors } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createBill } from "@/lib/purchases";
import { InvalidLineError } from "@/lib/ledger";
import { prisma } from "@/lib/db";

const schema = z.object({
  supplierId: z.string().min(1),
  issueDate: z.string(),
  dueDate: z.string(),
  currency: z.string().length(3),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      taxCodeId: z.string().optional(),
    })
  ).min(1),
});

async function handleGET() {
  const { active } = await requireTenantContext();
  const bills = await prisma.bill.findMany({
    where: { companyId: active.companyId },
    orderBy: { issueDate: "desc" },
    include: { supplier: true },
  });
  return NextResponse.json(bills);
}

async function handlePOST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const bill = await createBill({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      supplierId: body.supplierId,
      issueDate: new Date(body.issueDate),
      dueDate: new Date(body.dueDate),
      currency: body.currency,
      lines: body.lines,
    });
    return NextResponse.json({ id: bill.id, billNumber: bill.billNumber });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
