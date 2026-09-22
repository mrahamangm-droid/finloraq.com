import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/rbac";
import { billingPortalUrl } from "@/lib/stripe/subscriptions";

/** Opens Stripe's hosted billing portal: cards, receipts, cancellation. */
export async function POST() {
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "settings", "EDIT");
  try {
    return NextResponse.json({ url: await billingPortalUrl(active.companyId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing." }, { status: 400 });
  }
}
