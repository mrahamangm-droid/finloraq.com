import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { createPortalSession, isStripeConfigured } from "@/lib/integrations/stripe";

/** Opens the Stripe Customer Portal (payment method, invoices, plan changes, cancellation). */
export async function POST(req: Request) {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    const redirectUrl = await createPortalSession(active.companyId, `${origin}/billing`);
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing portal." }, { status: 400 });
  }
}
