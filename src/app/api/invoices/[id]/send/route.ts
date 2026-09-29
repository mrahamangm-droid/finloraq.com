import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { sendInvoiceByEmail } from "@/lib/sales";

const schema = z.object({
  /** Override recipient — defaults to the customer's email on file. */
  to: z.string().email().optional(),
});

/**
 * POST /api/invoices/:id/send
 * Emails the invoice to the customer (or an override address).
 * Only allowed for SENT, PARTIALLY_PAID, and OVERDUE invoices.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const result = await sendInvoiceByEmail({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      invoiceId: id,
      toEmail: parsed.data.to,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send invoice email.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
