import { NextRequest, NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { listCreditNotes, createCreditNote } from "@/lib/credit-notes";

export async function GET(_req: NextRequest) {
  try {
    const { active } = await requireTenantContext();
    const creditNotes = await listCreditNotes(active.companyId, active.id);
    return NextResponse.json({ creditNotes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { active, userId } = await requireTenantContext();
    const body = await req.json();

    const cn = await createCreditNote({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      customerId: body.customerId,
      invoiceId: body.invoiceId,
      issueDate: new Date(body.issueDate),
      currency: body.currency ?? "USD",
      reason: body.reason,
      lines: body.lines ?? [],
    });

    return NextResponse.json({ creditNote: cn }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: msg.includes("Forbidden") ? 403 : 400 });
  }
}
