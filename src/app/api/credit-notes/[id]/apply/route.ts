import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { applyCreditNoteToInvoice } from "@/lib/credit-notes";

const schema = z.object({
  invoiceId: z.string().min(1, "invoiceId is required"),
});

/**
 * POST /api/credit-notes/:id/apply
 * Apply a POSTED credit note against an open invoice.
 *
 * The credit note's double-entry (DR Revenue/Tax, CR AR) was already created
 * when it was posted. This endpoint allocates that AR reduction to the specific
 * invoice so its balance-due display reflects the credit.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const result = await applyCreditNoteToInvoice({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      creditNoteId: id,
      invoiceId: parsed.data.invoiceId,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to apply credit note.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
