import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { createInvoice } from "@/lib/sales";
import { InvalidLineError } from "@/lib/ledger";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fieldDefs } from "@/lib/customization/server";
import { CustomFieldError, parseCustomFieldValues } from "@/lib/customization/customFields";

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
  customFields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
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
    // Checked before the invoice exists, so a missing required field never leaves a stray draft.
    const defs = await fieldDefs(active.companyId, "INVOICE");
    const customFields = parseCustomFieldValues(defs, body.customFields ?? {});

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
    if (defs.length > 0) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { customFields: customFields as Prisma.InputJsonValue } });
    }
    return NextResponse.json({ id: invoice.id, invoiceNumber: invoice.invoiceNumber });
  } catch (err) {
    if (err instanceof InvalidLineError || err instanceof CustomFieldError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
