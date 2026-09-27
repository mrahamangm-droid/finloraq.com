import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { isStripeConfigured } from "@/lib/stripe/client";
import { startConnectOnboarding } from "@/lib/stripe/connect";

/** Starts (or resumes) Stripe onboarding for accepting invoice payments. */
export async function POST() {
  const { active, userId } = await requireTenantContext();
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Online payments aren't enabled on this Finloraq deployment yet." }, { status: 501 });
  }
  try {
    const url = await startConnectOnboarding({ companyId: active.companyId, membershipId: active.id, userId });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start Stripe onboarding." }, { status: 400 });
  }
}
