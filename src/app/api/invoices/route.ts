import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createInvoice } from "@/lib/sales";
import { InvalidLineError } from "@/lib/ledger";
import { prisma } from "@/lib/db";

const schema = z.object({
  customerId: z.string().min(1),
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

export async function GET() {
  const { active } = await requireTenantContext();
  const invoices = await prisma.invoice.findMany({
    where: { companyId: active.companyId },
    orderBy: { issueDate: "desc" },
    include: { customer: true },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: Request) {
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const invoice = await createInvoice({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      dueDate: new Date(body.dueDate),
      currency: body.currency,
      lines: body.lines,
    });
    return NextResponse.json({ id: invoice.id, invoiceNumber: invoice.invoiceNumber });
  } catch (err) {
    if (err instanceof InvalidLineError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
