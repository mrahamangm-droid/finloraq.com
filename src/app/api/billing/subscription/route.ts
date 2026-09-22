import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { getBillingSnapshot } from "@/lib/billing/subscription";

// Deliberately no module-permission gate beyond "is an active member of
// this company" — seeing the plan/seats/usage is safe for every role
// (it's what a Staff member sees on the Billing page too); only actually
// CHANGING the plan requires settings:EDIT, enforced in
// /api/billing/change-plan.
export async function GET() {
  const { active } = await requireTenantContext();
  const snapshot = await getBillingSnapshot(active.companyId);
  return NextResponse.json(snapshot);
}
