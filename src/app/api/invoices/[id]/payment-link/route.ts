import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getOrCreatePayLink, PaymentLinkError } from "@/lib/stripe/invoicePayments";

/** Returns the invoice's shareable "Pay now" link (created on first request). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { active } = await requireTenantContext();
  try {
    const url = await getOrCreatePayLink({ companyId: active.companyId, membershipId: active.id, invoiceId: params.id });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PaymentLinkError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
