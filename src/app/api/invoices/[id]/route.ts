import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { updateInvoice, deleteInvoice } from "@/lib/sales";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  customerId: z.string().min(1).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      taxCodeId: z.string().optional(),
    })
  ).min(1).optional(),
});

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active } = await requireTenantContext();
  // Reads are gated on VIEW exactly like writes are gated on CREATE/EDIT —
  // a role without invoices:VIEW (e.g. STAFF) gets 403, not the data.
  if (!(await can(active.id, "invoices", "VIEW"))) {
    return NextResponse.json({ error: "Missing VIEW on invoices." }, { status: 403 });
  }
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, companyId: active.companyId },
    include: { customer: true, lines: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const invoice = await updateInvoice({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      invoiceId: params.id,
      customerId: parsed.data.customerId,
      issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : undefined,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      currency: parsed.data.currency,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ id: invoice.id });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  try {
    await deleteInvoice({ companyId: active.companyId, membershipId: active.id, userId, invoiceId: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
