import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { createInvoiceFromSalesOrder } from "@/lib/sales-orders";
import { InvalidLineError } from "@/lib/ledger";
import { ForbiddenError } from "@/lib/rbac";

const schema = z.object({ dueDate: z.string() });

/** Raises a DRAFT invoice for every shipped-but-not-yet-invoiced quantity
 *  on this order. Matches convertQuoteToInvoice's shape (an { invoice }
 *  envelope) — the caller still has to post it separately, same two-step
 *  draft-then-post pattern every other invoice follows. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const invoice = await createInvoiceFromSalesOrder({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      salesOrderId: id,
      dueDate: new Date(parsed.data.dueDate),
    });
    return NextResponse.json({ invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber } }, { status: 201 });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof InvalidLineError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
